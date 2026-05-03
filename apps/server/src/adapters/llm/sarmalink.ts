import type { LlmAdapter } from './registry.js'

const BASE_URL = process.env.SARMALINK_BASE_URL || 'https://api.sarmalink.ai/v1'
const API_KEY = process.env.SARMALINK_API_KEY || ''
const MODEL = process.env.SARMALINK_MODEL || 'fast'

export function sarmalinkLlm(): LlmAdapter {
  return {
    async *stream({ messages, signal }) {
      if (!API_KEY) {
        yield 'SarmaLink-AI API key not configured. Set SARMALINK_API_KEY.'
        return
      }
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: 'You are a concise voice assistant. One or two short sentences.' },
            ...messages,
          ],
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
