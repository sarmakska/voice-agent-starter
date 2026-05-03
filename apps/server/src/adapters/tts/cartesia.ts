import type { TtsAdapter } from './registry.js'

/**
 * Cartesia Sonic TTS — streaming, low-latency. The adapter accumulates text
 * fed by the orchestrator and yields raw 16-bit PCM frames as Cartesia returns
 * them. Replace stub body with the real Cartesia WS client.
 */
export function cartesiaTts(): TtsAdapter {
  let pending: string[] = []
  return {
    feed(text) {
      pending.push(text)
    },
    async *stream({ signal }) {
      // Real impl: open Cartesia WS, send pending text, stream PCM back.
      while (!signal.aborted) {
        if (pending.length === 0) {
          await new Promise((r) => setTimeout(r, 50))
          continue
        }
        const chunk = pending.shift()!
        // Synthetic silent frame as placeholder
        yield Buffer.alloc(960 * 2)
      }
    },
  }
}
