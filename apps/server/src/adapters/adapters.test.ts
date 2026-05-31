import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { pcm16ToWav } from './audio.js'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.unstubAllEnvs()
  vi.resetModules()
})

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]))
      else c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('groq adapter', () => {
  beforeEach(() => vi.stubEnv('GROQ_API_KEY', 'test-key'))

  it('streams tokens from an OpenAI-compatible SSE response', async () => {
    globalThis.fetch = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"there"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    ) as any

    const { groqLlm } = await import('./llm/groq.js')
    const out: string[] = []
    const ctrl = new AbortController()
    for await (const e of groqLlm().stream({ messages: [{ role: 'user', content: 'hi' }], signal: ctrl.signal })) {
      if (e.type === 'token') out.push(e.text)
    }
    expect(out.join('')).toBe('Hi there')

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.model).toContain('llama-4')
  })

  it('advertises tools when provided', async () => {
    globalThis.fetch = vi.fn(async () => sseResponse(['data: [DONE]\n\n'])) as any
    const { groqLlm } = await import('./llm/groq.js')
    const ctrl = new AbortController()
    const gen = groqLlm().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: ctrl.signal,
      tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
    })
    for await (const _ of gen) { /* drain */ }
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.tools[0].function.name).toBe('t')
    expect(body.tool_choice).toBe('auto')
  })

  it('yields a configuration token with no key set', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    vi.resetModules()
    const { groqLlm } = await import('./llm/groq.js')
    const ctrl = new AbortController()
    const events = []
    for await (const e of groqLlm().stream({ messages: [], signal: ctrl.signal })) events.push(e)
    expect(events[0]).toMatchObject({ type: 'token' })
  })
})

describe('whispercpp adapter', () => {
  it('posts buffered audio and returns the transcript on flush', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: ' hello world ' }), { status: 200 }),
    ) as any
    vi.stubEnv('WHISPERCPP_URL', 'http://localhost:8090')
    vi.resetModules()
    const { whispercppStt } = await import('./stt/whispercpp.js')
    const stt = whispercppStt()
    // 0.5s of audio so the window clears the minimum-length guard.
    await stt.feed(Buffer.alloc(16000 * 2 * 0.5))
    const result = await stt.flush()
    expect(result).toEqual({ text: 'hello world', final: true })
  })
})

describe('opentts adapter', () => {
  it('synthesises per sentence and extracts PCM from the WAV body', async () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0])
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array(pcm16ToWav(pcm)), { status: 200 }),
    ) as any
    vi.resetModules()
    const { opentts } = await import('./tts/opentts.js')
    const tts = opentts()
    tts.feed('Hello there.')
    tts.end()
    const ctrl = new AbortController()
    const chunks: Buffer[] = []
    for await (const c of tts.stream({ signal: ctrl.signal })) chunks.push(c)
    expect(Buffer.concat(chunks)).toEqual(pcm)
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain('xtts_v2')
  })
})
