# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Groq Llama 4 LLM adapter, now the default LLM. Runs on the Groq LPU inference stack for a sub-300ms first-token target. OpenAI-compatible streaming through the shared SSE reader.
- Whisper.cpp streaming STT adapter, now the default STT. Self-hosted, no per-minute cost. Approximates streaming by transcribing a growing window for live partials and finalising on trailing silence.
- OpenTTS adapter with Coqui XTTS v2 voices, now the default TTS. Self-hosted, open-source, natural multilingual speech. Synthesises sentence by sentence to keep time-to-first-audio low.
- Function-call passthrough across all LLM adapters. The model is advertised the registered tools, the server executes the matching handler, appends the result to the conversation, and re-streams so the model can answer with grounded data.
- Tool registry (`apps/server/src/pipeline/tools.ts`) with two self-contained default tools (`get_time`, `add_numbers`) and a clean seam for registering your own.
- Shared OpenAI-compatible SSE reader (`apps/server/src/adapters/llm/sse.ts`) handling token deltas and fragmented tool-call assembly.
- Shared audio helpers (`apps/server/src/adapters/audio.ts`): PCM/WAV conversion and sentence splitting for low-latency TTS chunking.
- End-to-end orchestrator tests with fixtures exercising the full IDLE to LISTEN to THINK to SPEAK loop, barge-in cancellation, and function-call passthrough. Unit tests for the SSE reader, tool registry, audio helpers, and the Groq, Whisper.cpp, and OpenTTS adapters.
- ESLint flat config and a `pnpm lint` script, wired into CI ahead of typecheck, build, and test.
- Root `ARCHITECTURE.md`, `ROADMAP.md`, and this `CHANGELOG.md`.

### Changed

- Rewrote the orchestrator. Fixed a defect where the LLM stream was consumed twice per turn. The single completion now routes tokens into TTS as they arrive, handles tool-call rounds, and bounds tool recursion. Barge-in now resets the STT and TTS adapters in addition to aborting the in-flight streams, and a trailing-silence flush ends the utterance cleanly.
- Decoupled the orchestrator from the `ws` socket behind a small `Sink` interface and made the adapters injectable, so the full pipeline is testable without a live socket or provider keys.
- Reworked the STT adapter interface to add `flush()` (final transcript on end of utterance) and a provider `id`. Reworked the TTS adapter interface to add `end()` and `reset()` and a provider `id`.
- Turned the Deepgram, OpenAI Whisper, Cartesia, and ElevenLabs adapters into real HTTP integrations rather than stubs returning placeholder data.
- `/health` now reports the active STT, LLM, and TTS provider ids.
- Updated `.env.example` to match the actual configuration surface, defaulting to the self-hosted stack.
- Bumped `@types/node` to 25 to match the Node 25 runtime.

### Removed

- Dropped the unused `mediasoup` dependency and the WebRTC SFU claims that the code never implemented. The transport is a plain WebSocket carrying PCM frames, and the docs now say so.

### Fixed

- Web client no longer has an empty catch block (lint clean).
