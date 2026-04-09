# hubi-tracker

Drop-in JS SDK for Hubi landing pages. One script tag — captures pageviews, UTM attribution, and leads from any HTML form.

**~5.5 KB gzip · zero dependencies · works with any framework**

---

## Quick start

```html
<script src="https://cdn.jsdelivr.net/gh/beHubi/hubi-tracker@v1/dist/index.global.js" async></script>
<script>
  window.HubiTracker = window.HubiTracker || [];
  HubiTracker.push(['init', {
    publicKey: 'hubi_pk_xxx',          // generated in Hubi backoffice → Sites
    site:      'lp-blackfriday-2026',  // site slug
    apiBase:   'https://app.hubi.com.br/api/public/v1',
    autoBindForms: true,
    consent: { marketing: true, analytics: true },
  }]);
</script>
```

The second `<script>` block can run **before** the SDK loads — queued commands are replayed automatically.

---

## What happens on `init`

1. Creates (or reads) an `anonymous_id` cookie — stable for 1 year.
2. Parses UTMs and click IDs (`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`) from the URL.
3. Persists **first-touch** (never overwritten) and **last-touch** (updated every visit) in `localStorage`.
4. Sends a `pageview` event (only if `analytics` consent is granted — see [Consent](#consent)).
5. Hooks `history.pushState` / `popstate` for SPA pageview tracking.
6. Binds forms if `autoBindForms: true` (see below).

---

## Form binding

### Automatic — `autoBindForms: true`

Any form with the `data-hubi-form` attribute is bound automatically. A `MutationObserver` picks up forms that mount later (great for SPAs and modals).

```html
<form data-hubi-form id="contact">
  <input name="nome"     type="text"  />
  <input name="email"    type="email" />
  <input name="telefone" type="tel"   />
  <input name="empresa"  type="text"  />
  <button type="submit">Enviar</button>
</form>
```

You can also name the form via the attribute: `data-hubi-form="contact-home"`.

### Manual — `Hubi.bindForm(el, options?)`

```js
Hubi.bindForm(document.querySelector('#my-form'), {
  formId: 'contact',
  fieldMap: { name: 'nome_responsavel', phone: 'contato_celular' },
});
```

### Letting the form submit normally

By default the SDK calls `preventDefault()` on submit (it handles the POST). To keep the browser's native submit (e.g. you want to redirect after), set `data-hubi-intercept="false"` on the form — the SDK will still capture the lead but won't block the submission.

### Feedback hooks

```html
<form data-hubi-form>
  ...
  <div data-hubi-success hidden>Obrigado! Entraremos em contato.</div>
  <div data-hubi-error   hidden>Ops, algo deu errado.</div>
</form>
```

On submit, the SDK shows the matching element (`hidden` attribute is removed).

---

## Field mapping

The SDK maps form field names to canonical fields automatically, stripping accents and ignoring case.

| Canonical      | Recognized variants                                                         |
|----------------|-----------------------------------------------------------------------------|
| `name`         | name, nome, full_name, fullname, nome_completo                              |
| `email`        | email, e-mail, e_mail, mail                                                 |
| `phone`        | phone, telefone, tel, celular, whatsapp, fone, mobile                       |
| `company`      | company, empresa, companhia, organizacao, organização, organization         |
| `job_title`    | job_title, cargo, funcao, função, role, position                            |
| `message`      | message, mensagem, msg, texto, observacao, observação, comments, comentarios|
| `mql_question` | mql, mql_question, qualificacao, qualificação, interesse                    |

Fields that don't match any variant are forwarded inside `extra` (see [Payload shape](#payload-shape)).

> **Note:** `name`, `email`, `phone`, `company` and `job_title` currently land in dedicated columns on the `leads` table in hubi-web. `message` and `mql_question` are sent but stored only inside `raw_payload` — they're visible on the lead detail page (JSON view) and will get dedicated columns in a future release.

### Force a mapping with `data-hubi-field`

```html
<input name="nome_responsavel" data-hubi-field="name" />
```

### Custom `fieldMap`

```js
Hubi.bindForm(form, {
  fieldMap: {
    name:         'nome_responsavel',
    phone:        'contato_celular',
    mql_question: 'interesse_produto',
  },
});
```

---

## Payload shape

Every lead POST looks like this:

```json
{
  "form_id": "contact",
  "external_id": "uuid",
  "hubi_hp": "",
  "fields": {
    "name": "Maria",
    "email": "maria@acme.com",
    "phone": "...",
    "company": "Acme",
    "job_title": "CEO"
  },
  "extra": {
    "numero_funcionarios": "51-200",
    "qualquer_campo_custom": "valor"
  },
  "context": {
    "anonymous_id": "...",
    "session_id": "...",
    "page_url": "...",
    "landing_url": "...",
    "referrer_url": "...",
    "utm": { "source": "google", "medium": "cpc", "campaign": "bf26" },
    "click_ids": { "gclid": "..." },
    "ad_cookies": { "fbp": "...", "fbc": "..." },
    "device": { "type": "mobile", "ua": "...", "timezone": "America/Sao_Paulo" },
    "consent": { "marketing": true, "analytics": true },
    "first_touch": { ... },
    "last_touch": { ... }
  }
}
```

`hubi_hp` is the honeypot field — the SDK injects a hidden `input[name="hubi_hp"]` on every bound form. If a bot fills it, the API silently discards the submission.

---

## Consent

The SDK ships with LGPD-friendly defaults: **nothing is tracked until consent is explicitly granted**.

```ts
interface ConsentState {
  marketing: boolean;  // required to send leads
  analytics: boolean;  // required to send pageviews
}
```

- `init({ consent: { marketing: true, analytics: true } })` grants on boot.
- `Hubi.setConsent({ analytics: true })` updates later (e.g. after the user clicks "Accept" on your banner).
- `Hubi.getConsent()` reads the current state.
- State is persisted in `localStorage` under `hubi_consent`.

Until `analytics` is granted, `pageview` events are dropped client-side. Until `marketing` is granted, the Hubi API will reject `lead` POSTs for sites configured to require consent (returns `422 { error: "consent_required" }`).

---

## Identify (late-binding)

```js
Hubi.identify('maria@acme.com');
```

Stores the email in `localStorage` so subsequent submissions on other pages include it automatically. `Hubi.clearIdentity()` removes it (call this on logout).

---

## Debug mode

Add `debug: true` to see every mapping decision and event in the browser console:

```js
HubiTracker.push(['init', {
  publicKey: 'hubi_pk_xxx',
  site: 'my-lp',
  apiBase: '...',
  debug: true,
}]);
```

### What you'll see

**On init:**
```
[hubi] init { site: "my-lp", anonymous_id: "uuid...", consent: { marketing: true, analytics: true }, first_touch: null }
```

**When a form is bound:**
```
▶ [hubi] form bound: contact
    name               ←  "nome"              (auto-mapped)
    email              ←  "email"             (auto-mapped)
    phone              ←  "whatsapp"          (auto-mapped)
    company            ←  "empresa"           (auto-mapped)
    numero_funcionarios →  "numero_funcion..." (extra — passthrough)
```

**On pageview:**
```
[hubi] pageview → https://example.com/lp
```

**On submit:**
```
[hubi] lead → { formId: "contact", fields: { name, email, phone }, extra: { ... } }
```

If you forgot to call `init`, every command warns you:
```
[hubi] pageview ignored — Hubi.init() was not called
```

---

## Full API

```ts
Hubi.init(opts: InitOptions): void
Hubi.pageview(url?: string): void
Hubi.identify(email: string): void             // late-binding after opt-in
Hubi.clearIdentity(): void
Hubi.bindForm(el, { fieldMap?, formId? }): void
Hubi.submit({ formId, fields }): Promise<boolean>  // imperative submit (no form element)
Hubi.setConsent({ marketing?, analytics? }): void
Hubi.getConsent(): ConsentState
Hubi.extractFields(form): ExtractedFields        // useful for custom flows / debugging
```

Types are shipped alongside the bundle — IDE autocomplete works out of the box when installed via npm.

---

## Offline resilience

Events are queued in **IndexedDB** when the browser is offline (or when the request fails due to a network error / 5xx). The queue is drained automatically on:

- `online` event (browser reconnects)
- Next successful `init()` on a subsequent page load

Retry policy:

- Up to **5 attempts** per event, with exponential backoff (1s, 2s, 4s, 8s, 16s).
- **4xx responses are NOT retried** — they indicate a caller problem (invalid public key, malformed payload, consent rejection). The event is dropped.
- Queue is capped at **200 events** — older entries are evicted on overflow to prevent IndexedDB growth.

---

## Authentication

The SDK sends only the **public key** via `X-Hubi-Public-Key`. No secret ever reaches the browser.

The Hubi API authenticates browser requests via public key + `Origin` header validation — the site must register its allowed domains in the backoffice (Site → Tokens → Allowed origins).

Server-to-server integrations use HMAC-SHA256 signing. See [`docs/adr/marketing-api-auth.md`](docs/adr/marketing-api-auth.md).

---

## Development

```bash
npm install
npm test          # Vitest (94 tests)
npm run build     # tsup → ESM + CJS + IIFE + d.ts
npm run size      # gzip size of IIFE bundle
npm run typecheck # TypeScript strict check
```
