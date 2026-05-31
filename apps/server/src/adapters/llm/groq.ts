import type { LlmAdapter } from './registry.js'
import { parseChatSse, toWireMessages, toWireTools } from './sse.js'

const BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
const API_KEY = process.env.GROQ_API_KEY || ''
const MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'

const SYSTEM_PROMPT =
  'You are a concise voice assistant. Reply in one or two short spoken sentences. ' +
  'When a tool is available and relevant, call it rather than guessing.'

/**
 * Groq LLM adapter.
 *
 * Groq runs Llama 4 on its LPU inference stack, which is what gives this starter
 * its sub-300ms first-token target on the default `fast` path. The API is
 * OpenAI-compatible, so completions and function-call passthrough both stream
 * through the shared SSE reader. Without a key the adapter yields a single
 * configuration token so the pipeline still exercises end-to-end.
 */
export function groqLlm(): LlmAdapter {
  return {
    id: `groq:${MODEL}`,
    async *stream({ messages, signal, tools }) {
      if (!API_KEY) {
        yield { type: 'token', text: 'Groq API key not configured. Set GROQ_API_KEY.' }
        return
      }

      const body: Record<string, unknown> = {
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...toWireMessages(messages)],
        stream: true,
        temperature: 0.4,
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
        yield { type: 'token', text: `(groq error ${res.status})` }
        return
      }

      yield* parseChatSse(res.body)
    },
  }
}
