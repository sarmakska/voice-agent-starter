import type { LlmAdapter } from './registry.js'

const API_KEY = process.env.OPENAI_API_KEY || ''
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export function openaiLlm(): LlmAdapter {
  return {
    async *stream({ messages, signal }) {
      if (!API_KEY) {
        yield 'OpenAI key not set. Set OPENAI_API_KEY.'
        return
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages,
          stream: true,
          max_tokens: 200,
        }),
      })
      if (!res.ok || !res.body) {
        yield `(error ${res.status})`
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const evt = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          for (const line of evt.split('\n')) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const payload = t.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              const tok = parsed.choices?.[0]?.delta?.content
              if (tok) yield tok
            } catch { /* ignore */ }
          }
        }
      }
    },
  }
}
