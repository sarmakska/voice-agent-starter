import type { TtsAdapter } from './registry.js'

export function elevenlabsTts(): TtsAdapter {
  let pending: string[] = []
  return {
    feed(text) { pending.push(text) },
    async *stream({ signal }) {
      while (!signal.aborted) {
        if (pending.length === 0) {
          await new Promise((r) => setTimeout(r, 50))
          continue
        }
        pending.shift()
        yield Buffer.alloc(960 * 2)
      }
    },
  }
}
