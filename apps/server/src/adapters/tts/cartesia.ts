import type { TtsAdapter } from './registry.js'
import { splitSentences } from '../audio.js'

const API_KEY = process.env.CARTESIA_API_KEY || ''
const VERSION = process.env.CARTESIA_VERSION || '2024-11-13'
const MODEL = process.env.CARTESIA_MODEL || 'sonic-2'
const VOICE = process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091'

/**
 * Cartesia Sonic TTS adapter.
 *
 * Sonic is a hosted low-latency streaming model. Its `/tts/bytes` endpoint
 * returns raw PCM for a span of text, so this adapter synthesises sentence by
 * sentence (mirroring the OpenTTS adapter) to keep time-to-first-audio low.
 * Configure the sample rate to 16kHz so the bytes drop straight into the
 * pipeline. Without a key the adapter yields nothing so the pipeline still runs.
 */
export function cartesiaTts(): TtsAdapter {
  let pending = ''
  let ended = false

  async function synth(text: string, signal: AbortSignal): Promise<Buffer | null> {
    if (!API_KEY) return null
    try {
      const res = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'Cartesia-Version': VERSION,
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          model_id: MODEL,
          transcript: text,
          voice: { mode: 'id', id: VOICE },
          output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 },
        }),
      })
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      return null
    }
  }

  return {
    id: `cartesia:${MODEL}`,
    feed(text) {
      pending += text
    },
    end() {
      ended = true
    },
    async *stream({ signal }) {
      while (!signal.aborted) {
        const { spans, rest } = splitSentences(pending)
        if (spans.length > 0) {
          pending = rest
          for (const span of spans) {
            if (signal.aborted) return
            const pcm = await synth(span, signal)
            if (pcm && pcm.length > 0) yield pcm
          }
          continue
        }
        if (ended) {
          const tail = pending.trim()
          pending = ''
          if (tail) {
            const pcm = await synth(tail, signal)
            if (pcm && pcm.length > 0) yield pcm
          }
          return
        }
        await new Promise((r) => setTimeout(r, 25))
      }
    },
    reset() {
      pending = ''
      ended = false
    },
  }
}
