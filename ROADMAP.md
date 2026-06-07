# Roadmap

## Shipped (1.1.0)

- [x] Full-duplex orchestrator with an IDLE / LISTEN / THINK / SPEAK state machine
- [x] Stateful VAD with hysteresis and hangover and a trailing-silence flush
- [x] Streaming STT, LLM, and TTS pipeline with token-to-audio handoff on the first token
- [x] Self-hosted default stack: Groq Llama 4, Whisper.cpp, OpenTTS Coqui XTTS v2
- [x] Pluggable adapters per layer (Groq, SarmaLink-AI, OpenAI, Whisper.cpp, Deepgram, OpenAI Whisper, OpenTTS, Cartesia, ElevenLabs)
- [x] Barge-in handling that aborts the in-flight LLM and TTS streams and resets the adapters
- [x] Function-call passthrough with a server-side tool registry
- [x] Conversation history retained across turns, bounded to the recent window
- [x] End-to-end tests with fixtures, plus per-adapter unit tests
- [x] Lint, typecheck, build, and test in CI
- [x] Next.js web client

## Planned

- [ ] Production VAD (silero-vad-onnx) behind the existing `frameRms` seam, keeping the hysteresis and hangover layer on top
- [ ] Word-level interim results via the Deepgram streaming WebSocket SDK
- [ ] Multi-language hot swap mid-call
- [ ] Per-adapter latency dashboards
- [ ] mediasoup or LiveKit transport adapter at the edge for SFU fan-out
- [ ] Native iOS and Android clients

## Will not ship

- Voice cloning marketplace (use the TTS provider directly)
- Hosted SaaS layer (this is open-source infrastructure)
- A LiveKit replacement (this works alongside LiveKit, not against it)

## Contributing

Pick from Planned, open an issue, fork, branch, push, PR. Keep changes small and conventional.

I will not merge:

- Framework swaps (Fastify and Next.js stay)
- Sync handlers (everything is async and streaming)
- Adapters for paid-only providers with no free-tier or self-hosted path

Releases: see [GitHub Releases](https://github.com/sarmakska/voice-agent-starter/releases).
