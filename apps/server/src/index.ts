import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { Orchestrator } from './pipeline/orchestrator.js'

const PORT = Number(process.env.SERVER_PORT || 3001)

const fastify = Fastify({ logger: { level: 'info' } })
await fastify.register(websocket)

fastify.get('/health', async () => ({ ok: true, version: '1.0.0' }))

fastify.get('/voice', { websocket: true }, (socket, _req) => {
  const orchestrator = new Orchestrator()
  orchestrator.attach(socket)
  socket.on('close', () => orchestrator.dispose())
})

fastify.listen({ host: '0.0.0.0', port: PORT }).then(() => {
  fastify.log.info(`voice-agent-server listening on :${PORT}`)
})
