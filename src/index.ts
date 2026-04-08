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
import { autoBindForms, bindForm as bindFormEl, extractFields } from "./forms";
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _opts: InitOptions | null = null;
let _anonymousId = "";
let _initialized = false;

// ---------------------------------------------------------------------------
// Command dispatch (shared between initial queue flush and post-load push)
// ---------------------------------------------------------------------------

type CommandTuple = [string, ...unknown[]];

function dispatch(cmd: CommandTuple): void {
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
    case "clearIdentity":
      Hubi.clearIdentity();
      break;
    default:
      warn(`unknown command: ${String(name)}`);
  }
}

// ---------------------------------------------------------------------------
// Context builder — the heart of every payload
// ---------------------------------------------------------------------------

function buildContext(): EventContext {
  touchSession();
  const consent = getConsent();
  const url = location.href;

  const utm = currentUtm();
  const clickIds = currentClickIds();
  const adCookies = ensureFbc(clickIds, readAdCookies());

  return {
    anonymous_id: _anonymousId,
    session_id: getSessionId(),
    page_url: url,
    page_title: document.title || "",
    landing_url: ensureLandingUrl(url),
    referrer_url: currentReferrer(),
    consent,
    device: collectDevice(),
    utm,
    click_ids: clickIds,
    ad_cookies: adCookies,
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

function marketingAllowed(): boolean {
  return getConsent().marketing === true;
}

// ---------------------------------------------------------------------------
// Form submit handler
// ---------------------------------------------------------------------------

async function handleFormSubmit(
  result: ExtractedFields,
  formId: string,
): Promise<boolean> {
  if (!_initialized) {
    warn("form submit ignored — Hubi.init() was not called");
    return false;
  }

  // Honeypot tripped: silently succeed (do nothing, pretend it worked).
  if (result.honeypot) {
    log("honeypot tripped — dropping submission silently");
    return true;
  }

  // Persist identified email for late-binding across pages
  if (result.fields.email) {
    saveIdentifiedEmail(result.fields.email);
  } else if (loadIdentifiedEmail()) {
    result.fields.email = loadIdentifiedEmail() ?? undefined;
  }

  const payload: LeadPayload = {
    form_id: formId,
    external_id: uuid(),
    event_id: uuid(),
    hubi_hp: "",
    fields: result.fields,
    extra: result.extra,
    context: buildContext(),
  };

  return sendLead(payload);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const Hubi = {
  init(opts: InitOptions): void {
    if (_initialized) return;
    _opts = opts;

    if (opts.debug) enableDebug();

    initConsent(opts.consent);
    _anonymousId = getAnonymousId();

    primeReferrer(document.referrer || "");
    captureAttribution(location.href, document.referrer || "");
    ensureLandingUrl(location.href);

    initApi(opts.apiBase, opts.publicKey);

    _initialized = true;

    log("init", {
      site: opts.site,
      anonymous_id: _anonymousId,
      consent: getConsent(),
      first_touch: getFirstTouch(),
    });

    Hubi.pageview();

    initPageviewTracking((url) => {
      captureAttribution(url, currentReferrer());
      Hubi.pageview(url);
    });

    if (opts.autoBindForms) {
      autoBindForms(handleFormSubmit);
    }
  },

  pageview(url?: string): void {
    if (!_initialized) {
      warn("pageview ignored — Hubi.init() was not called");
      return;
    }
    if (!analyticsAllowed()) {
      log("pageview blocked — analytics consent not granted");
      return;
    }

    const payload: PageviewPayload = { context: buildContext() };
    if (url) payload.context.page_url = url;

    log("pageview →", url ?? location.href);
    sendPageview(payload);
  },

  identify(email: string): void {
    if (!_initialized) {
      warn("identify ignored — Hubi.init() was not called");
      return;
    }
    saveIdentifiedEmail(email);
    log("identify →", email);
    // identify does not send an event by itself — the email attaches
    // to the next lead/pageview automatically.
  },

  clearIdentity(): void {
    clearIdentifiedEmail();
    log("identity cleared");
  },

  bindForm(el: HTMLFormElement, options: BindFormOptions = {}): void {
    bindFormEl(el, options, handleFormSubmit);
  },

  async submit(options: SubmitOptions): Promise<boolean> {
    const CANONICAL = new Set([
      "name", "email", "phone", "company", "job_title", "message", "mql_question",
    ]);
    const fields: LeadFields = {};
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.fields)) {
      if (!value) continue;
      if (CANONICAL.has(key)) {
        (fields as Record<string, string>)[key] = value;
      } else {
        extra[key] = value;
      }
    }
    return handleFormSubmit({ fields, extra, honeypot: "" }, options.formId);
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
    for (const cmd of existing as CommandTuple[]) dispatch(cmd);
  }

  const liveQueue: unknown[] = [];
  (liveQueue as unknown as { push: (cmd: CommandTuple) => void }).push = dispatch;
  window.HubiTracker = liveQueue as unknown as CommandTuple[] & {
    push: (cmd: CommandTuple) => void;
  };
})();

