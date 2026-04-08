import type { BindFormOptions, FieldMap, LeadFields } from "./types";
import { group, log, pad } from "./logger";

// ---------------------------------------------------------------------------
// Canonical field mapping
// ---------------------------------------------------------------------------

const CANONICAL_MAP: Record<string, string[]> = {
  name: ["name", "nome", "full_name", "fullname", "nome_completo"],
  email: ["email", "e-mail", "e_mail", "mail"],
  phone: ["phone", "telefone", "tel", "celular", "whatsapp", "fone", "mobile"],
  company: ["company", "empresa", "companhia", "organizacao", "organização", "organization"],
  job_title: ["job_title", "cargo", "funcao", "função", "role", "position"],
  message: ["message", "mensagem", "msg", "texto", "observacao", "observação", "comments", "comentarios"],
  mql_question: ["mql", "mql_question", "qualificacao", "qualificação", "interesse"],
};

const HONEYPOT_NAME = "hubi_hp";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "_");
}

type ResolveResult = { canonical: string; via: "data-attr" | "custom" | "auto" | "passthrough" };

function resolve(rawName: string, dataAttr: string | null, customMap?: FieldMap): ResolveResult {
  if (dataAttr) {
    return { canonical: dataAttr, via: "data-attr" };
  }

  if (customMap) {
    for (const [canonical, alias] of Object.entries(customMap)) {
      if (normalize(alias) === normalize(rawName)) {
        return { canonical, via: "custom" };
      }
    }
  }

  const normalizedInput = normalize(rawName);
  for (const [canonical, variants] of Object.entries(CANONICAL_MAP)) {
    for (const variant of variants) {
      if (normalize(variant) === normalizedInput) {
        return { canonical, via: "auto" };
      }
    }
  }

  return { canonical: rawName, via: "passthrough" };
}

// Exported for tests
export function resolveCanonicalName(rawName: string, customMap?: FieldMap): string {
  return resolve(rawName, null, customMap).canonical;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

type FormInput = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isSubmittable(el: Element): el is FormInput {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

// Use querySelectorAll to reliably iterate *every* input, including multiple
// same-named checkboxes/radios. form.elements collapses those into
// RadioNodeList in some DOM implementations (including happy-dom).
function allInputs(form: HTMLFormElement): FormInput[] {
  const nodes = form.querySelectorAll<FormInput>("input, select, textarea");
  return Array.from(nodes).filter(isSubmittable);
}

function valueOf(el: FormInput): string | null {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      if (!el.checked) return null;
      return el.value && el.value !== "on" ? el.value : "true";
    }
    if (el.type === "file" || el.type === "submit" || el.type === "button" || el.type === "reset") {
      return null;
    }
    if (el.name === HONEYPOT_NAME) return el.value; // honeypot passthrough
    return el.value ?? "";
  }

  if (el instanceof HTMLSelectElement) {
    if (el.multiple) {
      return Array.from(el.selectedOptions).map((o) => o.value).join(",");
    }
    return el.value;
  }

  return el.value ?? "";
}

export interface ExtractedFields {
  fields: LeadFields;
  extra: Record<string, string>;
  honeypot: string;
}

export function extractFields(form: HTMLFormElement, customMap?: FieldMap): ExtractedFields {
  const fields: LeadFields = {};
  const extra: Record<string, string> = {};
  let honeypot = "";

  const seen = new Map<string, string[]>();

  for (const el of allInputs(form)) {
    const rawName = el.name || el.id;
    if (!rawName) continue;

    if (rawName === HONEYPOT_NAME) {
      honeypot = valueOf(el) || "";
      continue;
    }

    const value = valueOf(el);
    if (value === null || value === "") continue;

    // Handle repeated checkboxes / radios with same name
    const dataAttr = el.getAttribute("data-hubi-field");
    const { canonical } = resolve(rawName, dataAttr, customMap);

    const prev = seen.get(canonical);
    if (prev) {
      prev.push(value);
    } else {
      seen.set(canonical, [value]);
    }
  }

  for (const [canonical, values] of seen) {
    const joined = values.join(", ").trim();
    if (!joined) continue;

    if (canonical in CANONICAL_MAP || ["name", "email", "phone", "company", "job_title", "message", "mql_question"].includes(canonical)) {
      (fields as Record<string, string>)[canonical] = joined;
    } else {
      extra[canonical] = joined;
    }
  }

  return { fields, extra, honeypot };
}

// ---------------------------------------------------------------------------
// Honeypot injection
// ---------------------------------------------------------------------------

export function injectHoneypot(form: HTMLFormElement): void {
  if (form.querySelector(`input[name="${HONEYPOT_NAME}"]`)) return;
  const input = document.createElement("input");
  input.type = "text";
  input.name = HONEYPOT_NAME;
  input.autocomplete = "off";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  input.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
  form.appendChild(input);
}

// ---------------------------------------------------------------------------
// Feedback hooks
// ---------------------------------------------------------------------------

function showFeedback(form: HTMLFormElement, kind: "success" | "error"): void {
  const el = form.querySelector<HTMLElement>(`[data-hubi-${kind}]`);
  if (el) {
    el.removeAttribute("hidden");
    el.style.display = "";
  }
}

// ---------------------------------------------------------------------------
// Debug log: field mapping table
// ---------------------------------------------------------------------------

function logFormBind(form: HTMLFormElement, formId: string, customMap?: FieldMap): void {
  group(`form bound: ${formId}`, () => {
    const inputs = allInputs(form);

    if (inputs.length === 0) {
      log("(no inputs)");
      return;
    }

    for (const el of inputs) {
      const raw = el.name || el.id || "";
      if (!raw || raw === HONEYPOT_NAME) continue;

      const dataAttr = el.getAttribute("data-hubi-field");
      const { canonical, via } = resolve(raw, dataAttr, customMap);

      const viaLabel = {
        "data-attr": "data-hubi-field",
        custom: "custom map",
        auto: "auto-mapped",
        passthrough: "extra (passthrough)",
      }[via];

      const arrow = via === "passthrough" ? "→" : "←";
      // eslint-disable-next-line no-console
      console.log(`  ${pad(canonical, 18)} ${arrow}  ${pad(`"${raw}"`, 22)} (${viaLabel})`);
    }
  });
}

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

export type FormSubmitHandler = (
  result: ExtractedFields,
  formId: string,
  form: HTMLFormElement,
) => Promise<boolean>;

function resolveFormId(form: HTMLFormElement, override?: string): string {
  if (override) return override;
  const dataId = form.getAttribute("data-hubi-form");
  if (dataId && dataId !== "true" && dataId !== "") return dataId;
  return form.id || form.getAttribute("name") || "unknown";
}

export function bindForm(
  form: HTMLFormElement,
  options: BindFormOptions,
  handler: FormSubmitHandler,
): void {
  if (form.hasAttribute("data-hubi-bound")) return;
  form.setAttribute("data-hubi-bound", "1");

  injectHoneypot(form);

  const formId = resolveFormId(form, options.formId);
  logFormBind(form, formId, options.fieldMap);

  // data-hubi-intercept defaults to "true"
  const interceptAttr = form.getAttribute("data-hubi-intercept");
  const intercept = interceptAttr === null || interceptAttr === "true" || interceptAttr === "";

  form.addEventListener("submit", async (e) => {
    if (intercept) e.preventDefault();

    const result = extractFields(form, options.fieldMap);
    log("lead →", { formId, fields: result.fields, extra: result.extra });

    const ok = await handler(result, formId, form);
    showFeedback(form, ok ? "success" : "error");
  });
}

export function autoBindForms(handler: FormSubmitHandler): void {
  const tryBind = (form: HTMLFormElement) => bindForm(form, {}, handler);

  const selector = "form[data-hubi-form]";

  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLFormElement>(selector).forEach(tryBind);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.querySelectorAll<HTMLFormElement>(selector).forEach(tryBind);
}
