import type { SttAdapter } from './registry.js'

/**
 * OpenAI Whisper streaming STT adapter.
 *
 * Whisper does not support true streaming. This adapter accumulates 1-second
 * chunks and submits them sequentially. Slower than Deepgram but cheaper at
 * low volumes.
 */
export function whisperStt(): SttAdapter {
  let buffer: Buffer[] = []
  return {
    async feed(_pcm) {
      buffer.push(_pcm)
      // Real impl: wait for ~1s of audio, POST to whisper, return result.
      return null
    },
    reset() {
      buffer = []
    },
  }
}
