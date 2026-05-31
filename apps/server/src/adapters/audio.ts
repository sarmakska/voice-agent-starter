/** Shared audio helpers for the STT and TTS adapters. */

/**
 * Wrap raw PCM16 mono samples in a minimal RIFF/WAVE header. Whisper.cpp and
 * most HTTP STT endpoints accept a WAV body, so this lets the streaming adapters
 * post buffered audio windows without pulling in a codec dependency.
 */
export function pcm16ToWav(pcm: Buffer, sampleRate = 16000, channels = 1): Buffer {
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

/** Number of PCM16 mono samples represented by a buffer. */
export function sampleCount(pcm: Buffer, bytesPerSample = 2): number {
  return Math.floor(pcm.length / bytesPerSample)
}

/**
 * Extract the raw PCM data chunk from a RIFF/WAVE buffer. Walks the chunk list
 * rather than assuming a fixed 44-byte header, because some encoders insert a
 * LIST or fact chunk before `data`. Returns the whole buffer unchanged if it is
 * not a recognisable WAV (already raw PCM).
 */
export function wavToPcm16(wav: Buffer): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF') return wav
  let offset = 12
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4)
    const chunkSize = wav.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    if (chunkId === 'data') {
      const end = Math.min(dataStart + chunkSize, wav.length)
      return wav.subarray(dataStart, end)
    }
    offset = dataStart + chunkSize + (chunkSize % 2) // chunks are word-aligned
  }
  return wav
}

/**
 * Split streamed LLM text into speakable spans on sentence boundaries. Returns
 * the complete spans found in `buffer` plus the trailing remainder that is not
 * yet a full sentence, so a TTS adapter can synthesise sentence-by-sentence for
 * low time-to-first-audio without cutting words mid-stream.
 */
export function splitSentences(buffer: string): { spans: string[]; rest: string } {
  const spans: string[] = []
  const regex = /[^.!?]*[.!?]+[\s]*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(buffer)) !== null) {
    const span = match[0].trim()
    if (span) spans.push(span)
    lastIndex = regex.lastIndex
  }
  return { spans, rest: buffer.slice(lastIndex) }
}
