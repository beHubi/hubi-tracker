import type {
  BindFormOptions,
  ConsentState,
  EventContext,
  InitOptions,
  LeadFields,
  LeadPayload,
  PageviewPayload,
  SubmitOptions,
} from "./types";
import { initApi, sendLead, sendPageview } from "./api";
import {
  captureAttribution,
  currentClickIds,
  currentUtm,
  getFirstTouch,
  getLastTouch,
} from "./attribution";
import { ensureFbc, readAdCookies } from "./cookies";
import { getConsent, initConsent, setConsent as storeConsent } from "./consent";
import { collectDevice } from "./device";
import {
  CANONICAL_FIELDS,
  autoBindForms,
  bindForm as bindFormEl,
  extractFields,
} from "./forms";
import type { ExtractedFields } from "./forms";
import {
  clearIdentifiedEmail,
  ensureLandingUrl,
  loadIdentifiedEmail,
  saveIdentifiedEmail,
  uuid,
} from "./identity";
import { enableDebug, log, warn } from "./logger";
import { currentReferrer, initPageviewTracking, primeReferrer } from "./pageview";
import { getSessionId, touchSession } from "./session";
import { getAnonymousId } from "./visitor";

const CANONICAL_SET = new Set<string>(CANONICAL_FIELDS);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _anonymousId = "";
let _initialized = false;

// ---------------------------------------------------------------------------
// Context builder — the heart of every payload
// ---------------------------------------------------------------------------

function buildAttributionContext() {
  const utm = currentUtm();
  const click_ids = currentClickIds();
  const ad_cookies = ensureFbc(click_ids, readAdCookies());
  return { utm, click_ids, ad_cookies };
}

function buildContext(): EventContext {
  touchSession();
  const url = location.href;
  const attribution = buildAttributionContext();

  return {
    anonymous_id: _anonymousId,
    session_id: getSessionId(),
    page_url: url,
    page_title: document.title || "",
    landing_url: ensureLandingUrl(url),
    referrer_url: currentReferrer(),
    consent: getConsent(),
    device: collectDevice(),
    ...attribution,
    first_touch: getFirstTouch(),
    last_touch: getLastTouch(),
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Consent enforcement
// ---------------------------------------------------------------------------

function analyticsAllowed(): boolean {
  return getConsent().analytics === true;
}

// ---------------------------------------------------------------------------
// Form submit handler
// ---------------------------------------------------------------------------

function attachIdentifiedEmail(fields: LeadFields): void {
  if (fields.email) {
    saveIdentifiedEmail(fields.email);
    return;
  }
  const stored = loadIdentifiedEmail();
  if (stored) fields.email = stored;
}

function buildLeadPayload(result: ExtractedFields, formId: string): LeadPayload {
  return {
    form_id: formId,
    external_id: uuid(),
    hubi_hp: "",
    fields: result.fields,
    extra: result.extra,
    context: buildContext(),
  };
}

async function handleFormSubmit(result: ExtractedFields, formId: string): Promise<boolean> {
  if (!_initialized) {
    warn("form submit ignored — Hubi.init() was not called");
    return false;
  }

  // Honeypot tripped: silently succeed (do nothing, pretend it worked).
  if (result.honeypot) {
    log("honeypot tripped — dropping submission silently");
    return true;
  }

  attachIdentifiedEmail(result.fields);
  return sendLead(buildLeadPayload(result, formId));
}

// ---------------------------------------------------------------------------
// Init helpers
// ---------------------------------------------------------------------------

function primeAttribution(): void {
  const referrer = document.referrer || "";
  primeReferrer(referrer);
  captureAttribution(location.href, referrer);
  ensureLandingUrl(location.href);
}

function startSpaTracking(): void {
  initPageviewTracking((url) => {
    captureAttribution(url, currentReferrer());
    Hubi.pageview(url);
  });
}

function partitionSubmitFields(input: Record<string, string>): ExtractedFields {
  const fields: LeadFields = {};
  const extra: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!value) continue;
    if (CANONICAL_SET.has(key)) (fields as Record<string, string>)[key] = value;
    else extra[key] = value;
  }

  return { fields, extra, honeypot: "" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const Hubi = {
  init(opts: InitOptions): void {
    if (_initialized) return;

    if (opts.debug) enableDebug();
    initConsent(opts.consent);
    _anonymousId = getAnonymousId();

    primeAttribution();
    initApi(opts.apiBase, opts.publicKey);
    _initialized = true;

    log("init", {
      site: opts.site,
      anonymous_id: _anonymousId,
      consent: getConsent(),
      first_touch: getFirstTouch(),
    });

    Hubi.pageview();
    startSpaTracking();

    if (opts.autoBindForms) autoBindForms(handleFormSubmit);
  },

  pageview(url?: string): void {
    if (!_initialized) return warn("pageview ignored — Hubi.init() was not called");
    if (!analyticsAllowed()) return log("pageview blocked — analytics consent not granted");

    const payload: PageviewPayload = { context: buildContext() };
    if (url) payload.context.page_url = url;

    log("pageview →", url ?? location.href);
    sendPageview(payload);
  },

  identify(email: string): void {
    if (!_initialized) return warn("identify ignored — Hubi.init() was not called");
    saveIdentifiedEmail(email);
    log("identify →", email);
  },

  clearIdentity(): void {
    clearIdentifiedEmail();
    log("identity cleared");
  },

  bindForm(el: HTMLFormElement, options: BindFormOptions = {}): void {
    bindFormEl(el, options, handleFormSubmit);
  },

  async submit(options: SubmitOptions): Promise<boolean> {
    return handleFormSubmit(partitionSubmitFields(options.fields), options.formId);
  },

  setConsent(state: Partial<ConsentState>): void {
    storeConsent(state);
    log("consent updated →", getConsent());
  },

  getConsent,
  extractFields,
};

// ---------------------------------------------------------------------------
// Global snippet bootstrap
// ---------------------------------------------------------------------------

type CommandTuple = [string, ...unknown[]];

const COMMAND_HANDLERS: Record<string, (args: unknown[]) => void> = {
  init: (args) => Hubi.init(args[0] as InitOptions),
  pageview: (args) => Hubi.pageview(args[0] as string | undefined),
  identify: (args) => Hubi.identify(args[0] as string),
  setConsent: (args) => Hubi.setConsent(args[0] as Partial<ConsentState>),
  clearIdentity: () => Hubi.clearIdentity(),
};

function dispatch(cmd: CommandTuple): void {
  const [name, ...args] = cmd;
  const handler = COMMAND_HANDLERS[name];
  if (handler) handler(args);
  else warn(`unknown command: ${String(name)}`);
}

declare global {
  interface Window {
    HubiTracker?: CommandTuple[] & { push: (cmd: CommandTuple) => void };
    Hubi?: typeof Hubi;
  }
}

function flushExistingQueue(): void {
  const existing = window.HubiTracker;
  if (!Array.isArray(existing) || existing.length === 0) return;
  for (const cmd of existing as CommandTuple[]) dispatch(cmd);
}

function installLiveQueue(): void {
  const liveQueue: unknown[] = [];
  (liveQueue as unknown as { push: (cmd: CommandTuple) => void }).push = dispatch;
  window.HubiTracker = liveQueue as unknown as CommandTuple[] & {
    push: (cmd: CommandTuple) => void;
  };
}

(function bootstrap() {
  if (typeof window === "undefined") return;
  window.Hubi = Hubi;
  flushExistingQueue();
  installLiveQueue();
})();
