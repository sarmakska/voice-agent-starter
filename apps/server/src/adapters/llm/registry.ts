import { groqLlm } from './groq.js'
import { sarmalinkLlm } from './sarmalink.js'
import { openaiLlm } from './openai.js'

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  /** Set on assistant turns that requested tool calls. */
  toolCalls?: ToolCall[]
  /** Set on tool-result turns so the model can read the output. */
  toolCallId?: string
  name?: string
}

export interface ToolCall {
  id: string
  name: string
  /** Raw JSON arguments string as emitted by the model. */
  arguments: string
}

/** A tool the model may call, declared to the provider in OpenAI function format. */
export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>
}

/**
 * One unit of output from a streaming completion. Adapters yield text tokens as
 * they arrive and a single tool-call event once a function call is assembled.
 */
export type LlmEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; call: ToolCall }

export interface LlmStreamOptions {
  messages: ChatMessage[]
  signal: AbortSignal
  /** Tools advertised to the model for function-call passthrough. */
  tools?: ToolDefinition[]
}

export interface LlmAdapter {
  /** Human-readable provider id, used in logs and the /health payload. */
  readonly id: string
  stream(opts: LlmStreamOptions): AsyncGenerator<LlmEvent, void, unknown>
}

export function getLlmAdapter(provider = process.env.LLM_PROVIDER): LlmAdapter {
  switch (provider) {
    case 'openai':
      return openaiLlm()
    case 'sarmalink':
      return sarmalinkLlm()
    case 'groq':
    default:
      return groqLlm()
  }
}
