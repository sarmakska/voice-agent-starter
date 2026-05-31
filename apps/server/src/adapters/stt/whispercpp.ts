import type { SttAdapter, SttResult } from './registry.js'
import { pcm16ToWav, sampleCount } from '../audio.js'

const BASE_URL = process.env.WHISPERCPP_URL || 'http://localhost:8090'
const SAMPLE_RATE = 16000
// Transcribe a growing window roughly every 1s of speech to surface partials.
const PARTIAL_BYTES = SAMPLE_RATE * 2 * 1

/**
 * Whisper.cpp streaming STT adapter.
 *
 * Whisper.cpp ships a `whisper-server` binary that exposes an OpenAI-style
 * `/inference` endpoint accepting a WAV upload. Whisper itself is not a true
 * streaming model, so this adapter approximates streaming the way production
 * voice stacks do: it accumulates the active utterance, transcribes a growing
 * window every second to surface live partials, and finalises when the caller
 * flushes (driven by VAD trailing silence in the orchestrator).
 *
 * This keeps STT fully self-hosted with no per-minute API cost. Point
 * WHISPERCPP_URL at your running whisper-server. With no server reachable the
 * adapter degrades to returning null so the rest of the pipeline still runs.
 */
export function whispercppStt(): SttAdapter {
  let utterance: Buffer[] = []
  let bytesSincePartial = 0

  async function transcribe(window: Buffer, signal?: AbortSignal): Promise<string | null> {
    if (sampleCount(window) < SAMPLE_RATE / 4) return null // need at least 250ms
    const wav = pcm16ToWav(window, SAMPLE_RATE)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
    form.append('response_format', 'json')
    form.append('temperature', '0')
    try {
      const res = await fetch(`${BASE_URL}/inference`, { method: 'POST', body: form, signal })
      if (!res.ok) return null
      const json = (await res.json()) as { text?: string }
      return (json.text || '').trim() || null
    } catch {
      return null
    }
  }

  return {
    id: `whispercpp:${BASE_URL}`,
    async feed(pcm) {
      utterance.push(pcm)
      bytesSincePartial += pcm.length
      if (bytesSincePartial >= PARTIAL_BYTES) {
        bytesSincePartial = 0
        const window = Buffer.concat(utterance)
        const text = await transcribe(window)
        if (text) return { text, final: false }
      }
      return null
    },
    async flush(): Promise<SttResult | null> {
      if (utterance.length === 0) return null
      const window = Buffer.concat(utterance)
      utterance = []
      bytesSincePartial = 0
      const text = await transcribe(window)
      if (!text) return null
      return { text, final: true }
    },
    reset() {
      utterance = []
      bytesSincePartial = 0
    },
  }
}
