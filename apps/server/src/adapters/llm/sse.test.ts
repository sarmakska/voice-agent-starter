import { describe, it, expect } from 'vitest'
import { parseChatSse, toWireMessages, toWireTools } from './sse.js'
import type { LlmEvent } from './registry.js'

/** Build a ReadableStream of UTF-8 bytes from string chunks. */
function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]))
      else controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = []
  for await (const e of parseChatSse(stream)) out.push(e)
  return out
}

describe('parseChatSse', () => {
  it('yields text tokens in order, including across split chunks', async () => {
    const events = await collect(
      sseStream([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
        '\ndata: [DONE]\n\n',
      ]),
    )
    expect(events).toEqual([
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
    ])
  })

  it('assembles a fragmented tool call into a single tool_call event', async () => {
    const events = await collect(
      sseStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_time"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"timezone\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"UTC\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    expect(events).toEqual([
      { type: 'tool_call', call: { id: 'call_1', name: 'get_time', arguments: '{"timezone":"UTC"}' } },
    ])
  })

  it('ignores malformed data lines without throwing', async () => {
    const events = await collect(
      sseStream(['data: not json\n\n', 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']),
    )
    expect(events).toEqual([{ type: 'token', text: 'ok' }])
  })
})

describe('toWireMessages', () => {
  it('maps tool results and assistant tool calls to the OpenAI shape', () => {
    const wire = toWireMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'f', arguments: '{}' }] },
      { role: 'tool', content: '42', toolCallId: 'c1', name: 'f' },
    ])
    expect(wire[0]).toEqual({ role: 'user', content: 'hi' })
    expect(wire[1]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', type: 'function' }] })
    expect(wire[2]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '42' })
  })
})

describe('toWireTools', () => {
  it('wraps tool definitions in the function envelope', () => {
    const wire = toWireTools([{ name: 'f', description: 'd', parameters: { type: 'object' } }])
    expect(wire).toEqual([{ type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object' } } }])
  })
})
