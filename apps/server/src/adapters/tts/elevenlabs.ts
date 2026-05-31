import type { TtsAdapter } from './registry.js'
import { wavToPcm16, splitSentences } from '../audio.js'

const API_KEY = process.env.ELEVENLABS_API_KEY || ''
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5'
const VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'

/**
 * ElevenLabs TTS adapter.
 *
 * Uses the low-latency Flash model. The `/v1/text-to-speech/{voice}` endpoint
 * returns audio for a span of text, requested here as 16kHz PCM so the bytes
 * drop straight into the pipeline. Synthesises sentence by sentence to keep
 * time-to-first-audio low. Without a key the adapter yields nothing so the
 * pipeline still runs.
 */
export function elevenlabsTts(): TtsAdapter {
  let pending = ''
  let ended = false

  async function synth(text: string, signal: AbortSignal): Promise<Buffer | null> {
    if (!API_KEY) return null
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=pcm_16000`,
        {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json', 'xi-api-key': API_KEY },
          body: JSON.stringify({ text, model_id: MODEL }),
        },
      )
      if (!res.ok) return null
      // pcm_16000 returns raw PCM; wavToPcm16 is a no-op on non-RIFF buffers.
      return wavToPcm16(Buffer.from(await res.arrayBuffer()))
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      return null
    }
  }

  return {
    id: `elevenlabs:${MODEL}`,
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
