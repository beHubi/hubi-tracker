import type {
  BindFormOptions,
  ConsentState,
  InitOptions,
  LeadContext,
  LeadFields,
  LeadPayload,
  SubmitOptions,
} from "./types";
import { initApi, sendLead } from "./api";
import { currentUtm } from "./attribution";
import { getConsent, initConsent, setConsent as storeConsent } from "./consent";
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

const CANONICAL_SET = new Set<string>(CANONICAL_FIELDS);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _initialized = false;

// ---------------------------------------------------------------------------
// Lead context — only what hubi-web keeps from a lead
// ---------------------------------------------------------------------------

function buildContext(): LeadContext {
  return {
    landing_url: ensureLandingUrl(location.href),
    referrer_url: document.referrer || "",
    utm: currentUtm(),
    consent: getConsent(),
  };
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
// Submit helpers
// ---------------------------------------------------------------------------

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
    ensureLandingUrl(location.href);
    initApi(opts.apiBase, opts.publicKey);
    _initialized = true;

    log("init", { site: opts.site, consent: getConsent() });

    if (opts.autoBindForms) autoBindForms(handleFormSubmit);
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
  // Pageviews are no longer sent (hubi-web dropped visitor tracking). Kept as
  // a no-op so snippets that still push ['pageview'] don't warn.
  pageview: () => {},
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
