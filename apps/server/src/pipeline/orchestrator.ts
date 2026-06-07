/**
 * Voice agent orchestrator.
 *
 * Owns the duplex state machine for one voice session. States:
 *   IDLE   user not speaking, no LLM in flight
 *   LISTEN user speech detected, partial transcripts streaming
 *   THINK  final transcript handed off to LLM, tokens incoming
 *   SPEAK  TTS playing back to user
 *
 * Barge-in: if the user starts speaking while in THINK or SPEAK, abort both the
 * LLM stream and the TTS stream, reset the adapters, and return to LISTEN so the
 * agent never talks over the user.
 *
 * Function-call passthrough: tools are advertised to the model on every turn.
 * When the model emits a tool call, the orchestrator runs the matching handler,
 * appends the result to the conversation, and re-streams so the model can
 * finish the turn with the tool output in context.
 */

import { getSttAdapter, type SttAdapter } from '../adapters/stt/registry.js'
import { getLlmAdapter, type LlmAdapter, type ChatMessage, type ToolCall } from '../adapters/llm/registry.js'
import { getTtsAdapter, type TtsAdapter } from '../adapters/tts/registry.js'
import { defaultTools, ToolRegistry } from './tools.js'
import { Vad, type VadOptions } from './vad.js'

export type State = 'IDLE' | 'LISTEN' | 'THINK' | 'SPEAK'

export interface PipelineMessage {
  type: 'audio' | 'text' | 'control'
  data?: unknown
  payload?: string
}

/** The slice of a WebSocket the orchestrator needs. Decoupled for testing. */
export interface Sink {
  send(data: string): void
  readonly readyState: number
}

export interface OrchestratorDeps {
  stt?: SttAdapter
  llm?: LlmAdapter
  tts?: TtsAdapter
  tools?: ToolRegistry
  /** Frames of trailing silence before the utterance is flushed to a final. */
  silenceFramesToFlush?: number
  /** Max tool-call rounds per turn before giving up, guards runaway loops. */
  maxToolRounds?: number
  /** Hysteresis and hangover tuning for the per-session voice detector. */
  vad?: VadOptions
}

const MAX_HISTORY = 20

export class Orchestrator {
  private state: State = 'IDLE'
  private sink: Sink | null = null
  private llmAbort: AbortController | null = null
  private ttsAbort: AbortController | null = null
  private readonly stt: SttAdapter
  private readonly llm: LlmAdapter
  private readonly tts: TtsAdapter
  private readonly tools: ToolRegistry
  private readonly silenceFramesToFlush: number
  private readonly maxToolRounds: number
  private readonly vad: Vad
  private silenceFrames = 0
  private history: ChatMessage[] = []

  constructor(deps: OrchestratorDeps = {}) {
    this.stt = deps.stt ?? getSttAdapter()
    this.llm = deps.llm ?? getLlmAdapter()
    this.tts = deps.tts ?? getTtsAdapter()
    this.tools = deps.tools ?? defaultTools()
    this.silenceFramesToFlush = deps.silenceFramesToFlush ?? 8
    this.maxToolRounds = deps.maxToolRounds ?? 3
    // speechFrames 1 keeps onset latency low; the hangover absorbs transients
    // so a single loud frame mid-output cannot trigger a false barge-in.
    this.vad = new Vad({ speechFrames: 1, ...deps.vad })
  }

  get currentState(): State {
    return this.state
  }

  get providerIds(): { stt: string; llm: string; tts: string } {
    return { stt: this.stt.id, llm: this.llm.id, tts: this.tts.id }
  }

  attach(sink: Sink): void {
    this.sink = sink
  }

  /** Entry point for an inbound pipeline message. Returns when handled. */
  async handle(msg: PipelineMessage): Promise<void> {
    if (msg.type !== 'audio' || !msg.payload) return
    const buf = Buffer.from(msg.payload, 'base64')
    const isVoice = this.vad.process(buf)

    if (isVoice) {
      this.silenceFrames = 0
      // Barge-in: speech mid-output cancels the in-flight turn.
      if (this.state === 'THINK' || this.state === 'SPEAK') {
        this.cancelTurn()
        this.state = 'LISTEN'
        this.send({ type: 'control', data: 'barge-in' })
      }
      if (this.state === 'IDLE') {
        this.state = 'LISTEN'
        this.send({ type: 'control', data: 'listening' })
      }
    } else if (this.state === 'LISTEN') {
      this.silenceFrames += 1
    }

    if (this.state !== 'LISTEN') return

    if (isVoice) {
      const partial = await this.stt.feed(buf)
      if (partial?.text) {
        this.send({ type: 'text', data: { kind: partial.final ? 'final' : 'partial', text: partial.text } })
        if (partial.final) {
          await this.beginThink(partial.text)
          return
        }
      }
    }

    // Trailing silence ends the utterance: flush STT for a final transcript.
    if (this.silenceFrames >= this.silenceFramesToFlush) {
      this.silenceFrames = 0
      const final = await this.stt.flush()
      if (final?.text) {
        this.send({ type: 'text', data: { kind: 'final', text: final.text } })
        await this.beginThink(final.text)
      } else {
        this.state = 'IDLE'
        this.vad.reset()
        this.send({ type: 'control', data: 'idle' })
      }
    }
  }

  private async beginThink(finalTranscript: string): Promise<void> {
    this.state = 'THINK'
    // The utterance is captured; clear the detector so the next onset (a
    // barge-in or the following turn) is judged from a clean baseline.
    this.vad.reset()
    this.pushHistory({ role: 'user', content: finalTranscript })

    this.llmAbort = new AbortController()
    this.ttsAbort = new AbortController()
    this.tts.reset()

    // Start the TTS reader now so audio flows the moment text is fed.
    const speakDone = this.pump()

    try {
      for (let round = 0; round < this.maxToolRounds; round++) {
        const { text, toolCalls } = await this.consumeLlm(this.llmAbort.signal)

        if (toolCalls.length === 0) {
          if (text) this.pushHistory({ role: 'assistant', content: text })
          break
        }

        // Function-call passthrough: record the request, run the tools, append
        // results, and loop so the model can answer with the tool output.
        this.pushHistory({ role: 'assistant', content: text, toolCalls })
        for (const call of toolCalls) {
          this.send({ type: 'control', data: { kind: 'tool_call', name: call.name } })
          const result = await this.tools.execute(call.name, call.arguments)
          this.pushHistory({ role: 'tool', content: result, toolCallId: call.id, name: call.name })
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.send({ type: 'control', data: 'error' })
      }
    } finally {
      this.tts.end()
    }

    await speakDone
  }

  /** Consume one LLM completion, routing text to TTS and collecting tool calls. */
  private async consumeLlm(signal: AbortSignal): Promise<{ text: string; toolCalls: ToolCall[] }> {
    let text = ''
    const toolCalls: ToolCall[] = []
    for await (const event of this.llm.stream({ messages: this.history, signal, tools: this.tools.definitions() })) {
      if (event.type === 'token') {
        text += event.text
        if (this.state === 'THINK') {
          this.state = 'SPEAK'
        }
        this.tts.feed(event.text)
        this.send({ type: 'text', data: { kind: 'token', text: event.text } })
      } else {
        toolCalls.push(event.call)
      }
    }
    return { text, toolCalls }
  }

  /** Drain TTS audio to the client until the turn ends or is aborted. */
  private async pump(): Promise<void> {
    if (!this.ttsAbort) return
    try {
      for await (const chunk of this.tts.stream({ signal: this.ttsAbort.signal })) {
        this.send({ type: 'audio', payload: chunk.toString('base64') })
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.send({ type: 'control', data: 'tts-error' })
      }
    }
    if (this.state === 'SPEAK' || this.state === 'THINK') {
      this.state = 'IDLE'
      this.send({ type: 'control', data: 'idle' })
    }
  }

  private cancelTurn(): void {
    this.llmAbort?.abort()
    this.ttsAbort?.abort()
    this.tts.reset()
    this.stt.reset()
    // The VAD has already confirmed speech for the barge-in; keep it in the
    // speaking state so the fresh utterance continues without a re-onset delay.
  }

  private pushHistory(msg: ChatMessage): void {
    this.history.push(msg)
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY)
    }
  }

  private send(msg: PipelineMessage): void {
    if (this.sink && this.sink.readyState === 1) {
      this.sink.send(JSON.stringify(msg))
    }
  }

  dispose(): void {
    this.cancelTurn()
    this.sink = null
  }
}
