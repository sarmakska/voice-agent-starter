import { describe, it, expect } from 'vitest'
import { pcm16ToWav, wavToPcm16, splitSentences, sampleCount } from './audio.js'

describe('pcm16ToWav / wavToPcm16', () => {
  it('round-trips PCM through a WAV header', () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0])
    const wav = pcm16ToWav(pcm, 16000, 1)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wavToPcm16(wav)).toEqual(pcm)
  })

  it('returns a non-RIFF buffer unchanged', () => {
    const raw = Buffer.from([9, 9, 9, 9])
    expect(wavToPcm16(raw)).toEqual(raw)
  })

  it('counts PCM16 samples', () => {
    expect(sampleCount(Buffer.alloc(8))).toBe(4)
  })
})

describe('splitSentences', () => {
  it('returns full sentences and keeps the trailing fragment', () => {
    const { spans, rest } = splitSentences('Hello there. How are you? I am')
    expect(spans).toEqual(['Hello there.', 'How are you?'])
    expect(rest.trim()).toBe('I am')
  })

  it('returns no spans when there is no sentence boundary yet', () => {
    const { spans, rest } = splitSentences('still going')
    expect(spans).toEqual([])
    expect(rest).toBe('still going')
  })
})
