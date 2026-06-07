import { describe, it, expect } from 'vitest'
import { detectVoice, frameRms, Vad } from './vad.js'

/**
 * The detector has two layers. `detectVoice` and `frameRms` are the stateless
 * energy primitives, asserted against synthetic buffers. `Vad` is the stateful
 * detector with hysteresis and hangover, asserted by feeding ordered frames and
 * checking that single transients do not flip the debounced decision.
 */

function pcm16Frame(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(s * 32768), i * 2))
  return buf
}

/** A frame whose RMS equals the given level, in [0, 1]. */
function level(rms: number, n = 256): Buffer {
  return pcm16Frame(new Array(n).fill(0).map((_, i) => (i % 2 === 0 ? rms : -rms)))
}

describe('detectVoice', () => {
  it('returns false for an empty or sub-frame buffer', () => {
    expect(detectVoice(Buffer.alloc(0))).toBe(false)
    expect(detectVoice(Buffer.alloc(1))).toBe(false)
  })

  it('returns false for silence below the RMS threshold', () => {
    expect(detectVoice(pcm16Frame(new Array(256).fill(0)))).toBe(false)
  })

  it('returns true for a loud tone above the RMS threshold', () => {
    expect(detectVoice(level(0.5))).toBe(true)
  })

  it('returns false for a quiet signal just under the threshold', () => {
    expect(detectVoice(pcm16Frame(new Array(256).fill(0.01)))).toBe(false)
  })
})

describe('frameRms', () => {
  it('is zero for silence and matches the constant amplitude of a square wave', () => {
    expect(frameRms(pcm16Frame(new Array(256).fill(0)))).toBe(0)
    expect(frameRms(level(0.5))).toBeCloseTo(0.5, 3)
  })
})

describe('Vad hysteresis and hangover', () => {
  it('requires a sustained run above enter before declaring speech', () => {
    const vad = new Vad({ enterThreshold: 0.1, exitThreshold: 0.05, speechFrames: 3, hangoverFrames: 2 })
    expect(vad.process(level(0.5))).toBe(false) // 1 of 3
    expect(vad.process(level(0.5))).toBe(false) // 2 of 3
    expect(vad.process(level(0.5))).toBe(true) //  3 of 3, speech confirmed
  })

  it('ignores a single loud transient so it cannot trigger a false barge-in', () => {
    const vad = new Vad({ enterThreshold: 0.1, exitThreshold: 0.05, speechFrames: 2, hangoverFrames: 2 })
    expect(vad.process(level(0.6))).toBe(false) // lone spike, run resets next frame
    expect(vad.process(level(0))).toBe(false)
    expect(vad.isSpeaking).toBe(false)
  })

  it('holds speech through a brief dip thanks to the hangover', () => {
    const vad = new Vad({ enterThreshold: 0.1, exitThreshold: 0.05, speechFrames: 1, hangoverFrames: 3 })
    expect(vad.process(level(0.5))).toBe(true) // speech onset
    expect(vad.process(level(0))).toBe(true) //  dip 1 of 3, still speaking
    expect(vad.process(level(0))).toBe(true) //  dip 2 of 3
    expect(vad.process(level(0.5))).toBe(true) // voice returns, hangover cleared
    expect(vad.process(level(0))).toBe(true) //  dip 1 of 3 again
  })

  it('ends speech only after the hangover of quiet frames elapses', () => {
    const vad = new Vad({ enterThreshold: 0.1, exitThreshold: 0.05, speechFrames: 1, hangoverFrames: 3 })
    vad.process(level(0.5))
    expect(vad.process(level(0))).toBe(true) // 1 of 3
    expect(vad.process(level(0))).toBe(true) // 2 of 3
    expect(vad.process(level(0))).toBe(false) // 3 of 3, silence declared
  })

  it('treats energy in the hysteresis band as a continuation, not an onset', () => {
    const vad = new Vad({ enterThreshold: 0.1, exitThreshold: 0.05, speechFrames: 1, hangoverFrames: 2 })
    // 0.07 sits between exit (0.05) and enter (0.1): not loud enough to start.
    expect(vad.process(level(0.07))).toBe(false)
    expect(vad.process(level(0.07))).toBe(false)
    // Once speaking, the same 0.07 is above exit so it sustains speech.
    vad.process(level(0.5))
    expect(vad.process(level(0.07))).toBe(true)
  })

  it('rejects an exit threshold above the enter threshold', () => {
    expect(() => new Vad({ enterThreshold: 0.05, exitThreshold: 0.1 })).toThrow(/exit threshold/)
  })

  it('reset returns the detector to the not-speaking baseline', () => {
    const vad = new Vad({ enterThreshold: 0.1, exitThreshold: 0.05, speechFrames: 1 })
    vad.process(level(0.5))
    expect(vad.isSpeaking).toBe(true)
    vad.reset()
    expect(vad.isSpeaking).toBe(false)
  })
})
