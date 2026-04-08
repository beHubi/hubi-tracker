# ADR: Marketing API Authentication — Browser vs Server-to-Server

**Status:** Accepted  
**Date:** 2026-04-08  
**Context:** Issue #09 (hubi-tracker SDK) + Issue #07 (Public Leads API)

## Context

The Public Leads API (`POST /api/public/v1/events`) must be callable from:

1. **Browser JS SDK** — runs on anonymous landing pages, no secrets available.
2. **Server-to-server** — trusted backend integrations (e.g., Zapier, internal services).

## Decision

### Browser flows (SDK)
- The SDK sends only a **public key** (`hubi_pk_*`) — no HMAC secret in browser bundle.
- The API authenticates by:
  1. Looking up the public key to identify the site/tenant.
  2. Validating the `Origin` header against the site's registered domains.
  3. Applying rate limiting and IP hashing (already implemented in #08).
- No HMAC is required; secrets never leave the server.

### Server-to-server flows
- Callers present `X-Hubi-Key` (public key) **and** `X-Hubi-Signature` (HMAC-SHA256 of request body with shared secret).
- The API performs a constant-time comparison to prevent timing attacks.
- Shared secret is provisioned per-site and stored encrypted at rest.

### Optional edge proxy (Cloudflare Worker)
- For LPs that need signed requests from the browser (e.g., custom HMAC-required endpoints), a thin Cloudflare Worker can act as a signing proxy: browser → Worker (adds HMAC) → API.
- The Worker holds the shared secret via Workers Secrets.
- This path is **optional** and not required for standard SDK usage.

## Consequences

- SDK bundle stays small (no crypto library needed in browser).
- Origin validation is the primary browser-side trust mechanism — sites must register allowed domains.
- Server integrations remain strongly authenticated via HMAC.
- Edge proxy is an escape hatch for advanced scenarios, not the default.
