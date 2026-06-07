import { describe, it, expect } from 'vitest'
import { Orchestrator } from './orchestrator.js'
import { ToolRegistry } from './tools.js'
import {
  FakeSink,
  fakeStt,
  fakeLlm,
  fakeTts,
  voiceFrame,
  silenceFrame,
} from '../test/fixtures.js'

function audioMsg(buf: Buffer) {
  return { type: 'audio' as const, payload: buf.toString('base64') }
}

/** Feed n silence frames to trigger the trailing-silence flush. */
async function feedSilence(orc: Orchestrator, n: number) {
  for (let i = 0; i < n; i++) await orc.handle(audioMsg(silenceFrame()))
}

describe('Orchestrator end-to-end', () => {
  it('runs the full IDLE -> LISTEN -> THINK -> SPEAK loop and returns to IDLE', async () => {
    const sink = new FakeSink()
    const tts = fakeTts()
    const orc = new Orchestrator({
      stt: fakeStt('hello there'),
      llm: fakeLlm([[{ type: 'token', text: 'Hi! ' }, { type: 'token', text: 'How can I help?' }]]),
      tts,
      tools: new ToolRegistry(),
      silenceFramesToFlush: 3,
      vad: { hangoverFrames: 1 }, // one quiet frame ends the utterance in this test
    })
    orc.attach(sink)

    await orc.handle(audioMsg(voiceFrame())) // IDLE -> LISTEN
    expect(orc.currentState).toBe('LISTEN')
    expect(sink.controls()).toContain('listening')

    await feedSilence(orc, 3) // trailing silence flushes -> THINK -> SPEAK

    // The LLM text was spoken through TTS and the loop returned to IDLE.
    expect(tts.fedText.join('')).toBe('Hi! How can I help?')
    expect(sink.controls()).toContain('idle')
    expect(orc.currentState).toBe('IDLE')

    const finals = sink.byType('text').filter((m: any) => m.data?.kind === 'final')
    expect(finals[0]).toMatchObject({ data: { text: 'hello there' } })
    expect(sink.byType('audio').length).toBeGreaterThan(0)
  })

  it('handles function-call passthrough: executes the tool and answers with the result', async () => {
    const sink = new FakeSink()
    const tools = new ToolRegistry().register({
      definition: {
        name: 'add_numbers',
        description: 'sum',
        parameters: { type: 'object', properties: {} },
      },
      handler: (args) => String((args.numbers as number[]).reduce((a, b) => a + b, 0)),
    })

    const llm = fakeLlm([
      // Turn 1: model asks to call the tool.
      [{ type: 'tool_call', call: { id: 'c1', name: 'add_numbers', arguments: '{"numbers":[2,3]}' } }],
      // Turn 2: model answers using the tool result.
      [{ type: 'token', text: 'That is 5.' }],
    ])

    const orc = new Orchestrator({
      stt: fakeStt('add two and three'),
      llm,
      tts: fakeTts(),
      tools,
      silenceFramesToFlush: 2,
      vad: { hangoverFrames: 1 },
    })
    orc.attach(sink)

    await orc.handle(audioMsg(voiceFrame()))
    await feedSilence(orc, 2)

    const toolControls = sink.controls().filter((c: any) => c?.kind === 'tool_call')
    expect(toolControls).toEqual([{ kind: 'tool_call', name: 'add_numbers' }])

    const tokens = sink.byType('text').filter((m: any) => m.data?.kind === 'token')
    expect(tokens.map((t: any) => t.data.text).join('')).toBe('That is 5.')

    // Tools were advertised on every LLM call.
    expect(llm.tools[0].map((t) => t.name)).toContain('add_numbers')
    expect(orc.currentState).toBe('IDLE')
  })

  it('aborts the in-flight turn on barge-in and returns to LISTEN', async () => {
    const sink = new FakeSink()
    // A long-running LLM turn so we can interrupt mid-stream. fakeLlm waits 1ms
    // between tokens, so 200 tokens keeps the turn open long enough to barge in.
    const llm = fakeLlm([
      Array.from({ length: 200 }, (_, i) => ({ type: 'token' as const, text: `tok${i} ` })),
    ])
    const orc = new Orchestrator({
      stt: fakeStt('keep talking'),
      llm,
      tts: fakeTts(),
      tools: new ToolRegistry(),
      silenceFramesToFlush: 1,
      vad: { hangoverFrames: 1 },
    })
    orc.attach(sink)

    await orc.handle(audioMsg(voiceFrame())) // IDLE -> LISTEN
    // Fire the flush without awaiting, mirroring how the server dispatches
    // messages concurrently, so the turn streams while we interrupt it.
    const turn = orc.handle(audioMsg(silenceFrame()))

    await new Promise((r) => setTimeout(r, 10)) // let THINK/SPEAK start
    expect(['THINK', 'SPEAK']).toContain(orc.currentState)

    await orc.handle(audioMsg(voiceFrame())) // barge-in
    expect(sink.controls()).toContain('barge-in')
    expect(orc.currentState).toBe('LISTEN')

    await turn // in-flight turn unwinds cleanly after the abort
  })

  it('reports provider ids from the injected adapters', () => {
    const orc = new Orchestrator({ stt: fakeStt(), llm: fakeLlm([[]]), tts: fakeTts() })
    expect(orc.providerIds).toEqual({ stt: 'fake-stt', llm: 'fake-llm', tts: 'fake-tts' })
  })
})
