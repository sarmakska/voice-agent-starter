import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import type { WebSocket } from 'ws'
import { Orchestrator, type PipelineMessage } from './pipeline/orchestrator.js'

const PORT = Number(process.env.SERVER_PORT || 3001)
const VERSION = '1.1.0'

const fastify = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } })
await fastify.register(websocket)

fastify.get('/health', async () => {
  const providers = new Orchestrator().providerIds
  return { ok: true, version: VERSION, providers }
})

fastify.get('/voice', { websocket: true }, (socket: WebSocket) => {
  const orchestrator = new Orchestrator()
  orchestrator.attach({
    send: (data) => socket.send(data),
    get readyState() {
      return socket.readyState
    },
  })
  socket.on('message', (raw) => {
    let msg: PipelineMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return // ignore malformed frames
    }
    void orchestrator.handle(msg).catch((err) => fastify.log.error(err))
  })
  socket.on('close', () => orchestrator.dispose())
})

fastify.listen({ host: '0.0.0.0', port: PORT }).then(() => {
  fastify.log.info(`voice-agent-server listening on :${PORT}`)
})
