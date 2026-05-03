'use client'

import { useState, useRef, useEffect } from 'react'

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001'

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle')
  const [transcript, setTranscript] = useState<string[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  async function start() {
    setStatus('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ws = new WebSocket(SERVER_URL.replace('http', 'ws') + '/voice')
      wsRef.current = ws
      ws.onopen = () => setStatus('live')
      ws.onerror = () => setStatus('error')
      ws.onclose = () => setStatus('idle')
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'text' && msg.data?.text) {
            setTranscript((t) => [...t.slice(-20), msg.data.text])
          }
        } catch {}
      }
      // Wire microphone PCM frames to ws (real impl would resample to 16kHz mono)
      const ctx = new AudioContext({ sampleRate: 16000 })
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(2048, 1, 1)
      source.connect(processor)
      processor.connect(ctx.destination)
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== 1) return
        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
        }
        const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)))
        ws.send(JSON.stringify({ type: 'audio', payload: b64 }))
      }
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => () => { wsRef.current?.close() }, [])

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Voice Agent Starter</h1>
      <p style={{ opacity: 0.6, marginBottom: 32 }}>Click start, grant microphone access, talk to the agent.</p>

      <button
        onClick={start}
        disabled={status === 'connecting' || status === 'live'}
        style={{
          padding: '12px 24px',
          background: '#a78bfa',
          color: '#0a0a14',
          border: 0,
          borderRadius: 8,
          fontWeight: 600,
          cursor: 'pointer',
          opacity: status === 'connecting' || status === 'live' ? 0.5 : 1,
        }}
      >
        {status === 'idle' ? 'Start' : status === 'connecting' ? 'Connecting…' : status === 'live' ? 'Live' : 'Error'}
      </button>

      <div style={{ marginTop: 48, opacity: 0.85 }}>
        {transcript.map((t, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>{t}</div>
        ))}
      </div>

      <footer style={{ marginTop: 80, fontSize: 12, opacity: 0.4, textAlign: 'center' }}>
        Open source · MIT · <a href="https://github.com/sarmakska/voice-agent-starter">GitHub</a> · built by <a href="https://sarmalinux.com">Sarma Linux</a>
      </footer>
    </main>
  )
}
