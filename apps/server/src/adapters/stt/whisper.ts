import type { SttAdapter, SttResult } from './registry.js'
import { pcm16ToWav, sampleCount } from '../audio.js'

const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const API_KEY = process.env.OPENAI_API_KEY || ''
const MODEL = process.env.WHISPER_MODEL || 'whisper-1'
const SAMPLE_RATE = 16000

/**
 * OpenAI Whisper STT adapter.
 *
 * Whisper does not support true streaming, so this adapter buffers the active
 * utterance and transcribes it in one request when the caller flushes. It is
 * slower to first transcript than the streaming providers but cheap and simple
 * at low volume. Without a key the adapter returns null so the pipeline still
 * runs end-to-end.
 */
export function whisperStt(): SttAdapter {
  let utterance: Buffer[] = []

  return {
    id: `openai-whisper:${MODEL}`,
    async feed(pcm) {
      utterance.push(pcm)
      return null // no partials: Whisper transcribes on flush
    },
    async flush(): Promise<SttResult | null> {
      if (!API_KEY || utterance.length === 0) {
        utterance = []
        return null
      }
      const window = Buffer.concat(utterance)
      utterance = []
      if (sampleCount(window) < SAMPLE_RATE / 4) return null
      const wav = pcm16ToWav(window, SAMPLE_RATE)
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
      form.append('model', MODEL)
      form.append('response_format', 'json')
      try {
        const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${API_KEY}` },
          body: form,
        })
        if (!res.ok) return null
        const json = (await res.json()) as { text?: string }
        const text = (json.text || '').trim()
        return text ? { text, final: true } : null
      } catch {
        return null
      }
    },
    reset() {
      utterance = []
    },
  }
}
