# Security Policy

## Reporting a vulnerability

If you have found a security issue in this project, please report it privately by emailing security@sarmalinux.com. Do not open a public GitHub issue, and do not disclose the issue elsewhere until it has been addressed. Include a clear description, steps to reproduce, the commit SHA you tested against, and any proof-of-concept output that helps me confirm the problem quickly.

## Response policy

I respond to every disclosure within 7 days of receipt with an acknowledgement and an initial assessment. Confirmed issues are patched on `main` and released as a tagged version, and I will credit you in the release notes unless you ask me not to.

## Supported versions

I ship security fixes for the latest minor release line. Older lines do not receive backports, so pin to a current tagged release if you need a stable surface.

| Version | Supported |
|---|---|
| 1.1.x | Yes |
| 1.0.x | No |
| < 1.0 | No |

## Scope notes

This is a starter, not a hosted service. The adapters call out to the STT, LLM, and TTS providers you configure, so treat your provider API keys as the primary secret to protect: keep them in `.env`, never commit them, and rotate them if they leak. The function-call passthrough executes server-side tool handlers that you register, so audit any tool you add before exposing it to model-driven calls.
