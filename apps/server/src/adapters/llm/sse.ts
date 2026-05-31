import type { LlmEvent, ToolCall } from './registry.js'

/**
 * Parses an OpenAI-compatible chat-completions SSE stream into LlmEvents.
 *
 * Groq, OpenAI, and SarmaLink-AI all speak the same wire format, so the three
 * adapters share this reader. Text deltas are yielded immediately as `token`
 * events. Tool-call deltas arrive fragmented across chunks (the model streams
 * the function name first, then the JSON arguments a few characters at a time),
 * so we accumulate them by index and flush a single `tool_call` event per call
 * when the stream ends.
 */
export async function* parseChatSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<LlmEvent, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  // Accumulators keyed by the tool_calls array index from the provider.
  const partials = new Map<number, { id: string; name: string; args: string }>()

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const event = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        for (const line of event.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          let parsed: any
          try {
            parsed = JSON.parse(payload)
          } catch {
            continue
          }
          const delta = parsed.choices?.[0]?.delta
          if (!delta) continue

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            yield { type: 'token', text: delta.content }
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0
              const acc = partials.get(index) ?? { id: '', name: '', args: '' }
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name = tc.function.name
              if (tc.function?.arguments) acc.args += tc.function.arguments
              partials.set(index, acc)
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  for (const acc of partials.values()) {
    if (!acc.name) continue
    const call: ToolCall = {
      id: acc.id || `call_${acc.name}`,
      name: acc.name,
      arguments: acc.args || '{}',
    }
    yield { type: 'tool_call', call }
  }
}

/** Maps internal ChatMessages to the OpenAI-compatible wire shape. */
export function toWireMessages(
  messages: { role: string; content: string; toolCalls?: any[]; toolCallId?: string; name?: string }[],
): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

/** Maps ToolDefinitions to the OpenAI-compatible `tools` array. */
export function toWireTools(
  tools: { name: string; description: string; parameters: Record<string, unknown> }[],
): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}
