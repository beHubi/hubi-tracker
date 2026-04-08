# hubi-tracker

Drop-in JS SDK for Hubi landing pages. One script tag — captures pageviews, UTM attribution, and leads from any HTML form.

**< 8 KB gzip · zero dependencies · works with any framework**

---

## Quick start

```html
<script src="https://cdn.jsdelivr.net/gh/seu-usuario/hubi-tracker@v1/dist/hubi-tracker.iife.js" async></script>
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
2. Parses UTMs and click IDs (`gclid`, `fbclid`, `ttclid`, `msclkid`) from the URL.
3. Persists **first-touch** (never overwritten) and **last-touch** (updated every visit) in `localStorage`.
4. Sends a `pageview` event.
5. Hooks `history.pushState` / `popstate` for SPA navigation.
6. Binds forms if `autoBindForms: true` (see below).

---

## Form binding

### Automatic — `autoBindForms: true`

Any form with the `data-hubi-form` attribute is bound automatically:

```html
<form data-hubi-form id="contact">
  <input name="nome"     type="text"  />
  <input name="email"    type="email" />
  <input name="telefone" type="tel"   />
  <input name="empresa"  type="text"  />
  <button type="submit">Enviar</button>
</form>
```

### Manual — `Hubi.bindForm(el, options?)`

```js
Hubi.bindForm(document.querySelector('#my-form'), {
  formId: 'contact',
  fieldMap: { name: 'nome_responsavel', phone: 'contato_celular' },
});
```

---

## Field mapping

The SDK maps form field names to canonical fields automatically, stripping accents and ignoring case.

| Canonical     | Recognized variants                                               |
|---------------|-------------------------------------------------------------------|
| `name`        | name, nome, full_name, fullname, nome_completo                    |
| `email`       | email, e-mail, e_mail, mail                                       |
| `phone`       | phone, telefone, tel, celular, whatsapp, fone                     |
| `company`     | company, empresa, companhia, organizacao, organização             |
| `job_title`   | job_title, cargo, funcao, função, role, position                  |
| `message`     | message, mensagem, msg, texto, observacao, observação             |
| `mql_question`| mql, mql_question, qualificacao, qualificação, interesse          |

Fields that don't match any variant are forwarded as-is in `properties`.

### Force a mapping with `data-hubi-field`

```html
<input name="nome_responsavel" data-hubi-field="name" />
```

### Custom `fieldMap`

```js
Hubi.bindForm(form, {
  fieldMap: {
    name:      'nome_responsavel',
    phone:     'contato_celular',
    mql_question: 'interesse_produto',
  },
});
```

---

## Debug mode

Add `debug: true` to see every mapping decision and event in the browser console:

```js
HubiTracker.push(['init', {
  publicKey: 'hubi_pk_xxx',
  site: 'my-lp',
  apiBase: '...',
  debug: true,  // ← enable
}]);
```

### What you'll see

**On init:**
```
[hubi] init { site: "my-lp", anonymous_id: "uuid...", first_touch: null }
```

**When a form is bound (`autoBindForms` or `bindForm`):**
```
▶ [hubi] form bound: contact
    name               ←  "nome"              (auto-mapped)
    email              ←  "email"             (auto-mapped)
    phone              ←  "whatsapp"          (auto-mapped)
    company            ←  "empresa"           (auto-mapped)
    numero_funcionarios →  "numero_funcio..."  (passthrough — not recognized)
```

**On every pageview:**
```
[hubi] pageview → https://example.com/lp
```

**On form submit:**
```
[hubi] lead fields → { name: "João", email: "joao@x.com", phone: "11999999999", company: "Acme" }
```

If you forgot to call `init`, the console shows:
```
⚠ [hubi] Hubi.init() was not called. Did you forget to add the init snippet?
```

---

## Full API

```ts
Hubi.init(opts: InitOptions): void
Hubi.pageview(url?: string): void
Hubi.identify(email: string): void           // late-binding after opt-in
Hubi.bindForm(el, { fieldMap?, formId? }): void
Hubi.submit({ formId, fields }): void        // imperative submit (no form element)
Hubi.setConsent({ marketing, analytics }): void
```

---

## Offline resilience

Events are queued in IndexedDB when the browser is offline. The queue is drained automatically when connectivity is restored, with exponential backoff (up to 5 attempts per event).

---

## Authentication

The SDK sends only the **public key**. No secret ever reaches the browser.

The API authenticates browser requests via public key + `Origin` header validation (the site must register its allowed domains in the Hubi backoffice).

Server-to-server integrations use HMAC-SHA256 signing. See [`docs/adr/marketing-api-auth.md`](docs/adr/marketing-api-auth.md).

---

## Development

```bash
npm install
npm test          # Vitest — 60 tests
npm run build     # Rollup → ESM + CJS + IIFE
npm run size      # gzip size of IIFE bundle
npm run typecheck # TypeScript strict check
```
