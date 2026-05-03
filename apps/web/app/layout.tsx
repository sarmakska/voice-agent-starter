import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Voice Agent Starter',
  description: 'Real-time voice agent demo over WebRTC + streaming LLM.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body style={{ background: '#0a0a14', color: '#f5f5f7', fontFamily: 'system-ui, sans-serif' }}>{children}</body></html>
  )
}
