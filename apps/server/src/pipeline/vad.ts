/**
 * Voice activity detection.
 *
 * `detectVoice` is the stateless primitive: RMS energy of a PCM16 frame against
 * a fixed threshold. It is exact and side-effect free, which makes it easy to
 * test and to reuse as the energy term inside a fuller detector.
 *
 * `Vad` is the stateful detector the pipeline actually runs. A single RMS gate
 * is too jittery for barge-in: one loud transient frame flips it to speech and
 * triggers a false interruption, while a brief intra-word dip flips it back to
 * silence and cuts the utterance short. `Vad` smooths both failure modes with
 * two standard techniques:
 *
 *   Hysteresis    separate enter and exit thresholds, so the level needed to
 *                 start speech is higher than the level needed to sustain it.
 *                 Energy that hovers around one boundary cannot rattle the
 *                 state back and forth frame by frame.
 *
 *   Hangover      a run of consecutive frames must agree before the state flips.
 *                 A single transient above the enter threshold will not declare
 *                 speech, and a single dip below the exit threshold will not end
 *                 it. This is the classic "hangover" used in telephony VADs.
 *
 * Replace the energy term with webrtcvad-wasm or silero-vad-onnx for real
 * workloads; the hysteresis and hangover logic stays useful on top of either.
 */

/** Default enter threshold: RMS must exceed this to begin counting toward speech. */
const ENTER_THRESHOLD = 0.025
/** Default exit threshold: RMS must drop below this to begin counting toward silence. */
const EXIT_THRESHOLD = 0.015
/** Frames above enter required before declaring speech. */
const SPEECH_FRAMES = 2
/** Frames below exit required before declaring silence. */
const HANGOVER_FRAMES = 3

/** Root-mean-square energy of a PCM16 little-endian mono frame, in [0, 1]. */
export function frameRms(pcm16le: Buffer): number {
  if (pcm16le.length < 2) return 0
  let sumSquares = 0
  const samples = pcm16le.length / 2
  for (let i = 0; i < pcm16le.length; i += 2) {
    const sample = pcm16le.readInt16LE(i) / 32768
    sumSquares += sample * sample
  }
  return Math.sqrt(sumSquares / samples)
}

/**
 * Stateless single-threshold detector. Kept for callers that want a pure
 * frame-by-frame energy gate with no memory.
 */
export function detectVoice(pcm16le: Buffer, threshold = 0.02): boolean {
  return frameRms(pcm16le) > threshold
}

export interface VadOptions {
  enterThreshold?: number
  exitThreshold?: number
  speechFrames?: number
  hangoverFrames?: number
}

/**
 * Stateful VAD with hysteresis and hangover. Construct one per voice session and
 * feed it frames in order. `process` returns the debounced speech decision for
 * the current frame, which is what the orchestrator should act on.
 */
export class Vad {
  private readonly enterThreshold: number
  private readonly exitThreshold: number
  private readonly speechFrames: number
  private readonly hangoverFrames: number
  private speaking = false
  private aboveRun = 0
  private belowRun = 0

  constructor(options: VadOptions = {}) {
    this.enterThreshold = options.enterThreshold ?? ENTER_THRESHOLD
    this.exitThreshold = options.exitThreshold ?? EXIT_THRESHOLD
    this.speechFrames = Math.max(1, options.speechFrames ?? SPEECH_FRAMES)
    this.hangoverFrames = Math.max(1, options.hangoverFrames ?? HANGOVER_FRAMES)
    if (this.exitThreshold > this.enterThreshold) {
      throw new Error('VAD exit threshold must not exceed the enter threshold')
    }
  }

  /** True once the current frame and its predecessors have confirmed speech. */
  get isSpeaking(): boolean {
    return this.speaking
  }

  /**
   * Feed one frame and return the debounced speech decision. The decision only
   * flips after `speechFrames` confirming frames (silence to speech) or
   * `hangoverFrames` confirming frames (speech to silence).
   */
  process(pcm16le: Buffer): boolean {
    const rms = frameRms(pcm16le)
    if (this.speaking) {
      // Sustain speech until enough quiet frames clear the hangover.
      if (rms < this.exitThreshold) {
        this.belowRun += 1
        if (this.belowRun >= this.hangoverFrames) {
          this.speaking = false
          this.belowRun = 0
          this.aboveRun = 0
        }
      } else {
        this.belowRun = 0
      }
    } else {
      // Require a sustained run above enter before declaring speech.
      if (rms > this.enterThreshold) {
        this.aboveRun += 1
        if (this.aboveRun >= this.speechFrames) {
          this.speaking = true
          this.aboveRun = 0
          this.belowRun = 0
        }
      } else {
        this.aboveRun = 0
      }
    }
    return this.speaking
  }

  /** Clear all counters and return to the not-speaking state for a new turn. */
  reset(): void {
    this.speaking = false
    this.aboveRun = 0
    this.belowRun = 0
  }
}
