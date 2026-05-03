/**
 * Voice agent orchestrator.
 *
 * Owns the duplex state machine for one voice session. States:
 *   IDLE  -> user not speaking, no LLM in flight
 *   LISTEN -> user speech detected, partial transcripts streaming
 *   THINK -> final transcript handed off to LLM, tokens incoming
 *   SPEAK -> TTS playing back to user
 *
 * Barge-in: if user starts speaking while in THINK or SPEAK, abort both
 * the LLM stream and the TTS stream and return to LISTEN.
 */

import type { WebSocket } from 'ws'
import { getSttAdapter } from '../adapters/stt/registry.js'
import { getLlmAdapter } from '../adapters/llm/registry.js'
import { getTtsAdapter } from '../adapters/tts/registry.js'
import { detectVoice } from './vad.js'

type State = 'IDLE' | 'LISTEN' | 'THINK' | 'SPEAK'

interface PipelineMessage {
  type: 'audio' | 'text' | 'control'
  data?: unknown
  payload?: string
}

export class Orchestrator {
  private state: State = 'IDLE'
  private socket: WebSocket | null = null
  private llmAbort: AbortController | null = null
  private ttsAbort: AbortController | null = null
  private stt = getSttAdapter()
  private llm = getLlmAdapter()
  private tts = getTtsAdapter()
  private partialTranscript = ''
  private history: { role: 'user' | 'assistant'; content: string }[] = []

  attach(socket: WebSocket) {
    this.socket = socket
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as PipelineMessage
        this.handle(msg)
      } catch {
        // ignore malformed
      }
    })
  }

  private async handle(msg: PipelineMessage) {
    if (msg.type === 'audio' && msg.payload) {
      const buf = Buffer.from(msg.payload, 'base64')
      const isVoice = detectVoice(buf)

      // Barge-in: voice mid-output cancels everything.
      if (isVoice && (this.state === 'THINK' || this.state === 'SPEAK')) {
        this.llmAbort?.abort()
        this.ttsAbort?.abort()
        this.state = 'LISTEN'
        this.send({ type: 'control', data: 'barge-in' })
      }

      if (isVoice && this.state === 'IDLE') {
        this.state = 'LISTEN'
        this.send({ type: 'control', data: 'listening' })
      }

      if (this.state === 'LISTEN') {
        const partial = await this.stt.feed(buf)
        if (partial) {
          this.partialTranscript = partial.text
          this.send({ type: 'text', data: { kind: 'partial', text: partial.text } })
          if (partial.final) {
            this.beginThink(partial.text)
          }
        }
      }
    }
  }

  private async beginThink(finalTranscript: string) {
    this.state = 'THINK'
    this.history.push({ role: 'user', content: finalTranscript })
    this.partialTranscript = ''

    this.llmAbort = new AbortController()
    let response = ''
    try {
      for await (const token of this.llm.stream({ messages: this.history, signal: this.llmAbort.signal })) {
        response += token
        this.send({ type: 'text', data: { kind: 'token', text: token } })
        // Hand off to TTS once we have a meaningful chunk
        if (this.state === 'THINK' && response.length > 30) {
          this.beginSpeak(response)
          break
        }
      }
      // Stream the rest into TTS
      for await (const token of this.llm.stream({ messages: this.history, signal: this.llmAbort.signal })) {
        response += token
        this.tts.feed(token)
        this.send({ type: 'text', data: { kind: 'token', text: token } })
      }
      this.history.push({ role: 'assistant', content: response })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        this.send({ type: 'control', data: 'error' })
      }
    }
  }

  private async beginSpeak(initialText: string) {
    this.state = 'SPEAK'
    this.ttsAbort = new AbortController()
    this.tts.feed(initialText)
    try {
      for await (const audioChunk of this.tts.stream({ signal: this.ttsAbort.signal })) {
        this.send({ type: 'audio', payload: audioChunk.toString('base64') })
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        this.send({ type: 'control', data: 'tts-error' })
      }
    }
    if (this.state === 'SPEAK') {
      this.state = 'IDLE'
      this.send({ type: 'control', data: 'idle' })
    }
  }

  private send(msg: PipelineMessage) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(msg))
    }
  }

  dispose() {
    this.llmAbort?.abort()
    this.ttsAbort?.abort()
    this.socket = null
  }
}
