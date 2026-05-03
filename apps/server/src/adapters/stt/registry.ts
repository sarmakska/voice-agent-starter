import { deepgramStt } from './deepgram.js'
import { whisperStt } from './whisper.js'

export interface SttAdapter {
  feed(pcm: Buffer): Promise<{ text: string; final: boolean } | null>
  reset(): void
}

export function getSttAdapter(): SttAdapter {
  const provider = process.env.STT_PROVIDER || 'deepgram'
  if (provider === 'whisper') return whisperStt()
  return deepgramStt()
}
