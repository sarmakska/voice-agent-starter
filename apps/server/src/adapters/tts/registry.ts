import { cartesiaTts } from './cartesia.js'
import { elevenlabsTts } from './elevenlabs.js'

export interface TtsAdapter {
  feed(text: string): void
  stream(opts: { signal: AbortSignal }): AsyncGenerator<Buffer, void, unknown>
}

export function getTtsAdapter(): TtsAdapter {
  const provider = process.env.TTS_PROVIDER || 'cartesia'
  if (provider === 'elevenlabs') return elevenlabsTts()
  return cartesiaTts()
}
