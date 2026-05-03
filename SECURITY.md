# Security Policy

## Reporting a vulnerability

If you have found a security issue in this project, please report it privately. Do not open a public GitHub issue.

**Email:** replysarma@outlook.com

Please include:
- A clear description of the issue
- Steps to reproduce
- The version (commit SHA) you tested against
- Any proof-of-concept code or output

You should expect an acknowledgement within 5 working days. Confirmed issues will be patched on `main` and released as a tagged version; reporters are credited in the release notes unless they request otherwise.

## Supported versions

Only the latest commit on `main` receives security fixes. Pin to a tagged release if you need a stable version surface.

## Scope

This policy covers the code in this repository. Bugs in upstream dependencies should be reported to those projects directly.

## Out of scope

- Issues in third-party services (Vercel, Supabase, GitHub, Cloudflare, etc.)
- Findings that require physical access to a developer machine
- Theoretical risks without a working proof of concept
- Denial of service against demo / hosted instances
