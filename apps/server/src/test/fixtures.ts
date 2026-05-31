import type { SttAdapter, SttResult } from '../adapters/stt/registry.js'
import type { LlmAdapter, LlmEvent, ToolDefinition } from '../adapters/llm/registry.js'
import type { TtsAdapter } from '../adapters/tts/registry.js'
import type { Sink, PipelineMessage } from '../pipeline/orchestrator.js'

/** Build a PCM16 mono frame from float samples in [-1, 1]. */
export function pcm16Frame(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(s * 32767), i * 2))
  return buf
}

/** A loud frame that the RMS VAD treats as voice. */
export function voiceFrame(n = 256): Buffer {
  return pcm16Frame(new Array(n).fill(0).map((_, i) => (i % 2 === 0 ? 0.5 : -0.5)))
}

/** A silent frame below the VAD threshold. */
export function silenceFrame(n = 256): Buffer {
  return pcm16Frame(new Array(n).fill(0))
}

/** Captures every message the orchestrator sends, for assertions. */
export class FakeSink implements Sink {
  readyState = 1
  sent: PipelineMessage[] = []
  send(data: string): void {
    this.sent.push(JSON.parse(data) as PipelineMessage)
  }
  byType(type: PipelineMessage['type']): PipelineMessage[] {
    return this.sent.filter((m) => m.type === type)
  }
  controls(): unknown[] {
    return this.byType('control').map((m) => m.data)
  }
}

/**
 * STT stub that returns a final transcript when flushed. Lets a test drive the
 * full IDLE -> LISTEN -> THINK -> SPEAK path deterministically without audio.
 */
export function fakeStt(finalText = 'what time is it'): SttAdapter {
  return {
    id: 'fake-stt',
    async feed(): Promise<SttResult | null> {
      return null
    },
    async flush(): Promise<SttResult | null> {
      return { text: finalText, final: true }
    },
    reset(): void {},
  }
}

/**
 * LLM stub. Yields the scripted events for each successive call, so a test can
 * model a first turn that emits a tool call and a second turn that answers.
 */
export function fakeLlm(turns: LlmEvent[][]): LlmAdapter & { tools: ToolDefinition[][] } {
  let call = 0
  const tools: ToolDefinition[][] = []
  return {
    id: 'fake-llm',
    tools,
    async *stream({ signal, tools: advertised }) {
      tools.push(advertised ?? [])
      const events = turns[Math.min(call, turns.length - 1)]
      call++
      for (const e of events) {
        if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        yield e
        await new Promise((r) => setTimeout(r, 1))
      }
    },
  }
}

/** TTS stub that records fed text and yields one PCM chunk per non-empty feed. */
export function fakeTts(): TtsAdapter & { fedText: string[] } {
  let pending: string[] = []
  let ended = false
  const fedText: string[] = []
  return {
    id: 'fake-tts',
    fedText,
    feed(text) {
      pending.push(text)
      fedText.push(text)
    },
    end() {
      ended = true
    },
    async *stream({ signal }) {
      while (!signal.aborted) {
        if (pending.length > 0) {
          pending.shift()
          yield Buffer.alloc(320) // 10ms of PCM16 at 16kHz
          continue
        }
        if (ended) return
        await new Promise((r) => setTimeout(r, 2))
      }
    },
    reset() {
      pending = []
      ended = false
    },
  }
}
