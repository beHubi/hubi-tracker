import type {
  BindFormOptions,
  ConsentState,
  InitOptions,
  SubmitOptions,
  TrackPayload,
} from "./types";
import { initApi, sendEvent } from "./api";
import { captureAttribution, getFirstTouch, getLastTouch } from "./attribution";
import { getConsent, initConsent, setConsent as storeConsent } from "./consent";
import { autoBindForms, bindForm as bindFormEl, extractFields } from "./forms";
import { enableDebug, log, warn } from "./logger";
import { initPageviewTracking } from "./pageview";
import { touchSession, getSessionId } from "./session";
import { getAnonymousId } from "./visitor";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _opts: InitOptions | null = null;
let _anonymousId = "";
let _email: string | null = null;

// ---------------------------------------------------------------------------
// Queue flush — supports `HubiTracker.push([...])` snippet pattern
// ---------------------------------------------------------------------------

type CommandTuple = [string, ...unknown[]];

function processQueue(queue: CommandTuple[]): void {
  for (const item of queue) {
    const [cmd, ...args] = item;
    switch (cmd) {
      case "init":
        Hubi.init(args[0] as InitOptions);
        break;
      case "pageview":
        Hubi.pageview(args[0] as string | undefined);
        break;
      case "identify":
        Hubi.identify(args[0] as string);
        break;
      case "setConsent":
        Hubi.setConsent(args[0] as Partial<ConsentState>);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function buildPayload(event: string, properties?: Record<string, unknown>): TrackPayload {
  if (!_opts) {
    warn("Hubi.init() was not called. Did you forget to add the init snippet?");
    throw new Error("hubi-tracker: call Hubi.init() first");
  }

  touchSession();

  return {
    event,
    anonymous_id: _anonymousId,
    session_id: getSessionId(),
    public_key: _opts.publicKey,
    site: _opts.site,
    url: location.href,
    referrer: document.referrer,
    first_touch: getFirstTouch(),
    last_touch: getLastTouch(),
    consent: getConsent(),
    properties: {
      ...properties,
      ...(event === "lead" && _email ? { email: _email } : {}),
    },
    ts: Date.now(),
  };
}

function handleFormSubmit(fields: Record<string, string>, formId: string): void {
  if (fields.email) _email = fields.email;

  const payload = buildPayload("lead", { formId, ...fields });
  sendEvent(payload);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const Hubi = {
  init(opts: InitOptions): void {
    if (_opts) return; // idempotent
    _opts = opts;

    if (opts.debug) enableDebug();

    initConsent(opts.consent);
    _anonymousId = getAnonymousId();

    captureAttribution(location.href);
    initApi(opts.apiBase);

    log("init", {
      site: opts.site,
      anonymous_id: _anonymousId,
      first_touch: getFirstTouch(),
    });

    // Initial pageview
    Hubi.pageview();

    // SPA routing
    initPageviewTracking((url) => {
      captureAttribution(url);
      Hubi.pageview(url);
    });

    if (opts.autoBindForms) {
      autoBindForms(handleFormSubmit);
    }
  },

  pageview(url?: string): void {
    const payload = buildPayload("pageview", { url: url ?? location.href });
    log("pageview →", url ?? location.href);
    sendEvent(payload);
  },

  identify(email: string): void {
    _email = email;
    const payload = buildPayload("identify", { email });
    log("identify →", email);
    sendEvent(payload);
  },

  bindForm(el: HTMLFormElement, options: BindFormOptions = {}): void {
    bindFormEl(el, options, handleFormSubmit);
  },

  submit(options: SubmitOptions): void {
    handleFormSubmit(options.fields, options.formId);
  },

  setConsent(state: Partial<ConsentState>): void {
    storeConsent(state);
  },

  extractFields,
};

// ---------------------------------------------------------------------------
// Global snippet bootstrap
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    HubiTracker?: CommandTuple[] & { push: (cmd: CommandTuple) => void };
    Hubi?: typeof Hubi;
  }
}

(function bootstrap() {
  if (typeof window === "undefined") return;

  window.Hubi = Hubi;

  const existing = window.HubiTracker;
  if (Array.isArray(existing) && existing.length > 0) {
    processQueue(existing as CommandTuple[]);
  }

  // Override push so future calls execute immediately
  const liveQueue: unknown[] = [];
  (liveQueue as unknown as { push: (cmd: CommandTuple) => void }).push = (cmd: CommandTuple) => {
    const [name, ...args] = cmd;
    switch (name) {
      case "init":
        Hubi.init(args[0] as InitOptions);
        break;
      case "pageview":
        Hubi.pageview(args[0] as string | undefined);
        break;
      case "identify":
        Hubi.identify(args[0] as string);
        break;
      case "setConsent":
        Hubi.setConsent(args[0] as Partial<ConsentState>);
        break;
    }
  };
  window.HubiTracker = liveQueue as unknown as CommandTuple[] & { push: (cmd: CommandTuple) => void };
})();

export default Hubi;
