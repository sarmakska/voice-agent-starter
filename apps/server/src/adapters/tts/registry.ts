import { opentts } from './opentts.js'
import { cartesiaTts } from './cartesia.js'
import { elevenlabsTts } from './elevenlabs.js'

export interface TtsAdapter {
  /** Human-readable provider id, used in logs and the /health payload. */
  readonly id: string
  /** Queue a span of text to be synthesised. */
  feed(text: string): void
  /**
   * Stream PCM16 mono 16kHz audio for the queued text. Yields chunks as they
   * are synthesised and ends when the queue drains and `end()` has been called,
   * or when the abort signal fires (barge-in).
   */
  stream(opts: { signal: AbortSignal }): AsyncGenerator<Buffer, void, unknown>
  /** Mark the end of input so the stream can complete once drained. */
  end(): void
  /** Drop any queued text, used when a turn is cancelled. */
  reset(): void
}

export function getTtsAdapter(provider = process.env.TTS_PROVIDER): TtsAdapter {
  switch (provider) {
    case 'elevenlabs':
      return elevenlabsTts()
    case 'cartesia':
      return cartesiaTts()
    case 'opentts':
    default:
      return opentts()
  }
}
