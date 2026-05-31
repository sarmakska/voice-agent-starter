import type { LlmAdapter } from './registry.js'
import { parseChatSse, toWireMessages, toWireTools } from './sse.js'

const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const API_KEY = process.env.OPENAI_API_KEY || ''
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

/**
 * OpenAI LLM adapter. OpenAI-compatible chat completions with streaming and
 * function-call passthrough, sharing the same SSE reader as the other adapters.
 */
export function openaiLlm(): LlmAdapter {
  return {
    id: `openai:${MODEL}`,
    async *stream({ messages, signal, tools }) {
      if (!API_KEY) {
        yield { type: 'token', text: 'OpenAI key not set. Set OPENAI_API_KEY.' }
        return
      }

      const body: Record<string, unknown> = {
        model: MODEL,
        messages: toWireMessages(messages),
        stream: true,
        max_tokens: 300,
      }
      if (tools && tools.length > 0) {
        body.tools = toWireTools(tools)
        body.tool_choice = 'auto'
      }

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        yield { type: 'token', text: `(openai error ${res.status})` }
        return
      }

      yield* parseChatSse(res.body)
    },
  }
}
