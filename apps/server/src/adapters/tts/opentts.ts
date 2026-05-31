import type { TtsAdapter } from './registry.js'
import { wavToPcm16, splitSentences } from '../audio.js'

const BASE_URL = process.env.OPENTTS_URL || 'http://localhost:5500'
// OpenTTS voice id. The Coqui XTTS v2 multilingual voice is the default here.
const VOICE = process.env.OPENTTS_VOICE || 'coqui-tts:en_vctk#xtts_v2'

/**
 * OpenTTS adapter (Coqui XTTS v2 voices).
 *
 * OpenTTS is a self-hosted, open-source HTTP server that fronts several TTS
 * engines including Coqui XTTS v2, which gives natural multilingual voices with
 * zero per-character API cost. Its `/api/tts` endpoint returns a WAV body for a
 * piece of text.
 *
 * XTTS synthesises a whole utterance per request rather than token-by-token, so
 * to keep time-to-first-audio low this adapter splits the streamed LLM text on
 * sentence boundaries and synthesises sentence-by-sentence: the first sentence
 * is spoken while later sentences are still arriving from the model. PCM is
 * extracted from each WAV and yielded as it is produced. Without a reachable
 * server the adapter yields nothing so the rest of the pipeline still runs.
 */
export function opentts(): TtsAdapter {
  let pending = ''
  let ended = false

  async function synth(text: string, signal: AbortSignal): Promise<Buffer | null> {
    const url = `${BASE_URL}/api/tts?voice=${encodeURIComponent(VOICE)}&text=${encodeURIComponent(text)}`
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) return null
      const wav = Buffer.from(await res.arrayBuffer())
      return wavToPcm16(wav)
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      return null
    }
  }

  return {
    id: `opentts:${VOICE}`,
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
