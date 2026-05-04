# voice-agent-starter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000)](https://fastify.dev)
[![WebRTC](https://img.shields.io/badge/WebRTC-mediasoup-1A73E8)](https://mediasoup.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Open Source](https://img.shields.io/badge/Open_Source-%E2%9D%A4-red)](https://github.com/sarmakska/voice-agent-starter)

## Star History

<a href="https://www.star-history.com/#sarmakska/voice-agent-starter&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sarmakska/voice-agent-starter&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sarmakska/voice-agent-starter&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sarmakska/voice-agent-starter&type=Date" />
 </picture>
</a>

**Real-time voice agent loop. Sub-second round trip. STT, LLM, and TTS all swappable.**

Built by [Sarma Linux](https://sarmalinux.com).

---

## What this is

A working starter for production voice agents. Browser captures audio over WebRTC, server runs a duplex pipeline with VAD, partial transcripts feed a streaming LLM, TTS audio chunks back to the browser as they're generated. Interruptions cancel TTS and rewind LLM context cleanly.

Pluggable adapters for major STT, TTS and LLM providers. Defaults to SarmaLink-AI for the LLM layer. Swap any layer without touching the rest.

## What it solves

- "I want voice in my SaaS but I don't want to build a WebRTC stack from scratch"
- "I want barge-in handling that actually works"
- "I need to A/B test STT/TTS providers without rewriting the pipeline"

## Architecture

```mermaid
graph TD
  Browser[Browser microphone]
  Browser -->|WebRTC| SFU[mediasoup SFU]
  SFU --> VAD[Voice Activity Detector]
  VAD -->|speech detected| STT[Streaming STT]
  STT -->|partial transcripts| LLM[Streaming LLM]
  LLM -->|tokens| TTS[Chunked TTS]
  TTS -->|audio frames| SFU
  SFU --> Browser

  classDef ext fill:#a78bfa,stroke:#a78bfa,color:#fff
  class STT,LLM,TTS ext
```

## Latency budget

| Stage | P50 target | Notes |
|---|---|---|
| Mic to VAD | 30ms | wasm VAD on a worker thread |
| STT first partial | 250ms | Deepgram Aura streaming |
| LLM first token | 200ms | SarmaLink-AI fast mode |
| TTS first audio chunk | 200ms | Cartesia Sonic streaming |
| Total user-perceived | **~600ms** | first audible response |

## Quick start

```bash
git clone https://github.com/sarmakska/voice-agent-starter.git
cd voice-agent-starter
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`, click "Start", grant microphone access.

## Configuration

| Env var | Purpose | Default |
|---|---|---|
| `STT_PROVIDER` | `deepgram` or `whisper` | `deepgram` |
| `TTS_PROVIDER` | `cartesia` or `elevenlabs` | `cartesia` |
| `LLM_PROVIDER` | `sarmalink` or `openai` | `sarmalink` |
| `SARMALINK_API_KEY` | for the SarmaLink LLM adapter | unset |
| `DEEPGRAM_API_KEY` | for the Deepgram STT adapter | unset |
| `CARTESIA_API_KEY` | for the Cartesia TTS adapter | unset |

## Swapping adapters

Each layer is one TypeScript file. Drop a new adapter into `apps/server/src/adapters/<layer>/<provider>.ts` implementing the interface, register it in the adapter registry, set the env var. No other changes.

## Roadmap

- [x] WebRTC capture with mediasoup SFU
- [x] VAD-driven barge-in
- [x] Streaming STT, LLM, TTS pipeline
- [x] Pluggable adapters per layer
- [ ] Multi-language hot swap mid-call
- [ ] Tool calling during voice (LLM emits structured calls)
- [ ] Native iOS / Android client (currently web only)

## License

MIT.

Built by [Sarma Linux](https://sarmalinux.com).

---

## More open source by Sarma

Part of a portfolio of twelve production-shaped open-source repositories built and maintained by [Sarma](https://sarmalinux.com).

| Repository | What it is |
|---|---|
| [Sarmalink-ai](https://github.com/sarmakska/Sarmalink-ai) | Multi-provider OpenAI-compatible AI gateway with 14-engine failover and intent-based plugin auto-routing |
| [agent-orchestrator](https://github.com/sarmakska/agent-orchestrator) | Durable multi-agent workflows in TypeScript with deterministic replay and Inspector UI |
| [voice-agent-starter](https://github.com/sarmakska/voice-agent-starter) | Sub-second full-duplex voice agent loop. WebRTC, mediasoup, pluggable STT / LLM / TTS |
| [ai-eval-runner](https://github.com/sarmakska/ai-eval-runner) | Evals as code. Python, DuckDB, FastAPI viewer, regression mode for CI |
| [mcp-server-toolkit](https://github.com/sarmakska/mcp-server-toolkit) | Production Model Context Protocol server starter (Python / FastAPI) |
| [local-llm-router](https://github.com/sarmakska/local-llm-router) | OpenAI-compatible proxy that routes to Ollama or cloud providers based on policy |
| [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf) | Minimal end-to-end RAG starter for PDF corpora |
| [receipt-scanner](https://github.com/sarmakska/receipt-scanner) | Vision OCR for receipts with Zod-validated JSON output |
| [webhook-to-email](https://github.com/sarmakska/webhook-to-email) | Webhook receiver that forwards events to email via Resend |
| [k8s-ops-toolkit](https://github.com/sarmakska/k8s-ops-toolkit) | Helm chart for shipping Next.js to Kubernetes with full observability stack |
| [terraform-stack](https://github.com/sarmakska/terraform-stack) | Vercel + Supabase + Cloudflare + DigitalOcean modules in one Terraform repo |
| [staff-portal](https://github.com/sarmakska/staff-portal) | Open-source HR / ops portal — leave, attendance, expenses, kiosk mode |

Engineering essays at [sarmalinux.com/blog](https://sarmalinux.com/blog) &middot; All projects at [sarmalinux.com/open-source](https://sarmalinux.com/open-source)
