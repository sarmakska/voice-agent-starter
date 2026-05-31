import type { SttAdapter, SttResult } from './registry.js'
import { pcm16ToWav, sampleCount } from '../audio.js'

const API_KEY = process.env.DEEPGRAM_API_KEY || ''
const MODEL = process.env.DEEPGRAM_MODEL || 'nova-3'
const SAMPLE_RATE = 16000
const PARTIAL_BYTES = SAMPLE_RATE * 2 * 1 // ~1s of audio between partials

/**
 * Deepgram STT adapter.
 *
 * Deepgram offers a streaming WebSocket API, but the cleanest cross-runtime way
 * to consume it from this orchestrator without an extra dependency is the
 * pre-recorded `/v1/listen` endpoint over growing windows: we transcribe a
 * rolling window for live partials and the full utterance on flush. This keeps
 * the adapter to one file and one fetch while still surfacing partials. Swap in
 * the Deepgram streaming SDK if you need word-level interim results. Without a
 * key the adapter returns null so the pipeline still runs.
 */
export function deepgramStt(): SttAdapter {
  let utterance: Buffer[] = []
  let bytesSincePartial = 0

  async function listen(window: Buffer): Promise<string | null> {
    if (!API_KEY || sampleCount(window) < SAMPLE_RATE / 4) return null
    const wav = pcm16ToWav(window, SAMPLE_RATE)
    try {
      const res = await fetch(
        `https://api.deepgram.com/v1/listen?model=${MODEL}&smart_format=true`,
        {
          method: 'POST',
          headers: { Authorization: `Token ${API_KEY}`, 'Content-Type': 'audio/wav' },
          body: new Uint8Array(wav),
        },
      )
      if (!res.ok) return null
      const json = (await res.json()) as any
      const text = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript
      return typeof text === 'string' && text.trim() ? text.trim() : null
    } catch {
      return null
    }
  }

  return {
    id: `deepgram:${MODEL}`,
    async feed(pcm) {
      utterance.push(pcm)
      bytesSincePartial += pcm.length
      if (bytesSincePartial >= PARTIAL_BYTES) {
        bytesSincePartial = 0
        const text = await listen(Buffer.concat(utterance))
        if (text) return { text, final: false }
      }
      return null
    },
    async flush(): Promise<SttResult | null> {
      if (utterance.length === 0) return null
      const window = Buffer.concat(utterance)
      utterance = []
      bytesSincePartial = 0
      const text = await listen(window)
      return text ? { text, final: true } : null
    },
    reset() {
      utterance = []
      bytesSincePartial = 0
    },
  }
}
