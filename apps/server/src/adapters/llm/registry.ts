import { sarmalinkLlm } from './sarmalink.js'
import { openaiLlm } from './openai.js'

export interface LlmAdapter {
  stream(opts: {
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
    signal: AbortSignal
  }): AsyncGenerator<string, void, unknown>
}

export function getLlmAdapter(): LlmAdapter {
  const provider = process.env.LLM_PROVIDER || 'sarmalink'
  if (provider === 'openai') return openaiLlm()
  return sarmalinkLlm()
}
