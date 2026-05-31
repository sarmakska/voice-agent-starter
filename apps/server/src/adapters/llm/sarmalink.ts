import type { LlmAdapter } from './registry.js'
import { parseChatSse, toWireMessages, toWireTools } from './sse.js'

const BASE_URL = process.env.SARMALINK_BASE_URL || 'https://api.sarmalink.ai/v1'
const API_KEY = process.env.SARMALINK_API_KEY || ''
const MODEL = process.env.SARMALINK_MODEL || 'fast'

const SYSTEM_PROMPT = 'You are a concise voice assistant. One or two short sentences.'

/**
 * SarmaLink-AI LLM adapter. OpenAI-compatible gateway with streaming and
 * function-call passthrough, sharing the SSE reader with the other adapters.
 */
export function sarmalinkLlm(): LlmAdapter {
  return {
    id: `sarmalink:${MODEL}`,
    async *stream({ messages, signal, tools }) {
      if (!API_KEY) {
        yield { type: 'token', text: 'SarmaLink-AI API key not configured. Set SARMALINK_API_KEY.' }
        return
      }

      const body: Record<string, unknown> = {
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...toWireMessages(messages)],
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
        yield { type: 'token', text: `(sarmalink error ${res.status})` }
        return
      }

      yield* parseChatSse(res.body)
    },
  }
}
