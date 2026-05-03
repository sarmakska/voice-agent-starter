/**
 * Naive voice activity detection.
 *
 * Computes RMS over a frame and compares against a threshold. Good enough for
 * a starter. Replace with webrtcvad-wasm or silero-vad-onnx for real workloads.
 */

const RMS_THRESHOLD = 0.02

export function detectVoice(pcm16le: Buffer): boolean {
  if (pcm16le.length < 2) return false
  let sumSquares = 0
  const samples = pcm16le.length / 2
  for (let i = 0; i < pcm16le.length; i += 2) {
    const sample = pcm16le.readInt16LE(i) / 32768
    sumSquares += sample * sample
  }
  const rms = Math.sqrt(sumSquares / samples)
  return rms > RMS_THRESHOLD
}
