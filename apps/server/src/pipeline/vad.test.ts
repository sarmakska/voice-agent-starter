import { describe, it, expect } from 'vitest'
import { detectVoice } from './vad.js'

/**
 * Smoke test for the voice activity detector. The detector computes RMS over a
 * PCM16 frame and compares it against a fixed threshold, so we can assert its
 * behaviour deterministically with synthetic buffers.
 */

function pcm16Frame(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(s * 32768), i * 2))
  return buf
}

describe('detectVoice', () => {
  it('returns false for an empty or sub-frame buffer', () => {
    expect(detectVoice(Buffer.alloc(0))).toBe(false)
    expect(detectVoice(Buffer.alloc(1))).toBe(false)
  })

  it('returns false for silence below the RMS threshold', () => {
    const silence = pcm16Frame(new Array(256).fill(0))
    expect(detectVoice(silence)).toBe(false)
  })

  it('returns true for a loud tone above the RMS threshold', () => {
    const loud = pcm16Frame(new Array(256).fill(0).map((_, i) => (i % 2 === 0 ? 0.5 : -0.5)))
    expect(detectVoice(loud)).toBe(true)
  })

  it('returns false for a quiet signal just under the threshold', () => {
    const quiet = pcm16Frame(new Array(256).fill(0.01))
    expect(detectVoice(quiet)).toBe(false)
  })
})
