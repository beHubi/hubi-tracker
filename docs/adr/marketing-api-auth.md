# ADR: Marketing API Authentication — Browser vs Server-to-Server

**Status:** Accepted
**Date:** 2026-04-08 (revised)
**Context:** Issue #08 (API security — shipped), #21 (API browser auth mode — proposed), #09 (hubi-tracker SDK)

## Context

The Public Leads API (`POST /api/public/v1/leads` and `POST /api/public/v1/events/pageview`) must be callable from:

1. **Browser JS SDK** (`hubi-tracker`) — runs on landing pages, no secrets available.
2. **Server-to-server** — trusted backend integrations (e.g., CRMs, Zapier, internal services).

The existing `Api::Public::ApplicationController#authenticate_public_api!` (shipped in #08, commit #645) requires every request to carry an HMAC-SHA256 signature computed with `token.signing_key`. That secret cannot ship in a browser bundle — anyone could inspect the page and extract it.

## Decision

We authenticate browser and server flows **on the same endpoints** but with **different trust anchors**, selected at runtime based on request headers.

### Browser mode (selected automatically)
**Trigger:** request carries a valid `Origin` header that matches an entry in `token.allowed_origins`.

**Trust anchors:**
- `X-Hubi-Public-Key` — identifies the token/site.
- `X-Hubi-Timestamp` — 5-minute window; prevents clock-skew abuse.
- `Origin` header — validated against `token.allowed_origins` (cannot be forged by non-browser clients; browsers send it automatically and won't let JS override it).
- Rate limits (600/min per IP, 60/min per public key, 5/min per IP+form_id for leads).
- Body size cap (16 KB leads / 4 KB pageview).
- Honeypot field (`hubi_hp`) checked by `Marketing::Leads::Ingest`.
- HMAC and nonce checks are **skipped** in browser mode.

**Scope:** only the whitelisted POST routes (`/leads` and `/events/pageview`). Any other route still requires HMAC.

### Server mode (default)
**Trigger:** any request that isn't in browser mode (no matching Origin, missing Origin, or non-whitelisted route).

**Trust anchors:**
- `X-Hubi-Public-Key`
- `X-Hubi-Signature` (HMAC-SHA256 of raw body with `token.signing_key`)
- `X-Hubi-Timestamp`
- Nonce replay protection (signature cached for 10 minutes).
- All the same rate limits, body caps, and honeypot.

## Why `Origin` is enough for browser trust

- The `Origin` header is set by the browser on every cross-origin request and **cannot** be overridden by JavaScript (the Fetch spec explicitly forbids it).
- Server-side tools like `curl` can forge `Origin`, but they would need to know the target token's registered allow-list anyway, and they're still subject to rate limits + honeypot + body caps. For meaningful abuse they'd be better off just signing requests in server mode.
- This is the same posture used by Segment, PostHog, Plausible, Mixpanel, and Amplitude for browser SDKs.

## SDK implementation

`hubi-tracker` sends:
```
POST /api/public/v1/leads
Content-Type: application/json
X-Hubi-Public-Key: hubi_pk_xxx
X-Hubi-Timestamp: 1712602800
```
No signature. No secrets in the bundle.

## Server implementation

Issue **#21** tracks the Rails-side work:
- Extract auth into `Marketing::SiteTokens::Authenticator`.
- Add `browser_mode?` predicate.
- Skip HMAC/nonce when in browser mode AND route is whitelisted.
- Log `auth_mode: "browser" | "server"` per request.
- Full test coverage for both modes.

## Consequences

- SDK bundle stays tiny (no crypto library).
- Zero new infrastructure (no Cloudflare Worker edge proxy needed).
- Server-to-server callers keep their HMAC guarantees unchanged.
- Browser trust is defense-in-depth: Origin + rate limit + honeypot + consent + body cap.
- Compromising one site token's public key does not allow posting from unauthorized origins.

## Rejected alternative: Cloudflare Worker signing proxy

We considered a Worker that would hold the signing key and sign requests before forwarding to the API. Rejected because:
- New infra to deploy, monitor, and pay for.
- Extra hop of latency per event.
- Origin-based trust achieves the same security posture without any of that.
