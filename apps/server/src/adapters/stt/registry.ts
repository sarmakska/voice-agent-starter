import { whispercppStt } from './whispercpp.js'
import { deepgramStt } from './deepgram.js'
import { whisperStt } from './whisper.js'

export interface SttResult {
  text: string
  final: boolean
}

export interface SttAdapter {
  /** Human-readable provider id, used in logs and the /health payload. */
  readonly id: string
  /**
   * Feed one frame of PCM16 mono 16kHz audio. Returns a partial or final
   * transcript when one is available, or null when more audio is needed.
   */
  feed(pcm: Buffer): Promise<SttResult | null>
  /** Signal end of utterance, flushing any buffered audio to a final result. */
  flush(): Promise<SttResult | null>
  reset(): void
}

export function getSttAdapter(provider = process.env.STT_PROVIDER): SttAdapter {
  switch (provider) {
    case 'deepgram':
      return deepgramStt()
    case 'whisper':
      return whisperStt()
    case 'whispercpp':
    default:
      return whispercppStt()
  }
}
