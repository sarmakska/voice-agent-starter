import type { SttAdapter } from './registry.js'

/**
 * Deepgram streaming STT adapter (Nova-2 model).
 *
 * In production this opens a WebSocket to wss://api.deepgram.com/v1/listen
 * and forwards audio frames. For brevity this starter buffers locally and
 * returns synthetic partials. Replace the body with a real WS client when
 * wiring to your account.
 */
export function deepgramStt(): SttAdapter {
  let buffer: Buffer[] = []
  let lastFlush = Date.now()

  return {
    async feed(pcm) {
      buffer.push(pcm)
      const elapsed = Date.now() - lastFlush
      if (elapsed > 800) {
        // Emit a synthetic final transcript every ~800ms of voice
        const final = buffer.length > 5
        buffer = []
        lastFlush = Date.now()
        return { text: final ? 'transcript placeholder' : 'partial', final }
      }
      return null
    },
    reset() {
      buffer = []
    },
  }
}
