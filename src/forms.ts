import type { BindFormOptions, FieldMap, LeadFields } from "./types";
import { group, log, pad } from "./logger";

// ---------------------------------------------------------------------------
// Canonical field mapping
// ---------------------------------------------------------------------------

// Keys that map to dedicated Lead columns in hubi-web. Anything not in this
// set goes to `extra` and is preserved inside `raw_payload` on the lead.
export const CANONICAL_FIELDS = [
  "name",
  "email",
  "phone",
  "company",
  "job_title",
  "message",
  "mql_question",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_FIELDS);

const CANONICAL_MAP: Record<CanonicalField, string[]> = {
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

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

type ResolveVia = "data-attr" | "custom" | "auto" | "passthrough";
type ResolveResult = { canonical: string; via: ResolveVia };

function fromCustomMap(rawName: string, customMap: FieldMap): ResolveResult | null {
  const target = normalize(rawName);
  for (const [canonical, alias] of Object.entries(customMap)) {
    if (normalize(alias) === target) return { canonical, via: "custom" };
  }
  return null;
}

function fromCanonicalMap(rawName: string): ResolveResult | null {
  const target = normalize(rawName);
  for (const [canonical, variants] of Object.entries(CANONICAL_MAP)) {
    if (variants.some((v) => normalize(v) === target)) {
      return { canonical, via: "auto" };
    }
  }
  return null;
}

function resolve(rawName: string, dataAttr: string | null, customMap?: FieldMap): ResolveResult {
  if (dataAttr) return { canonical: dataAttr, via: "data-attr" };
  if (customMap) {
    const hit = fromCustomMap(rawName, customMap);
    if (hit) return hit;
  }
  return fromCanonicalMap(rawName) ?? { canonical: rawName, via: "passthrough" };
}

// Exported for tests
export function resolveCanonicalName(rawName: string, customMap?: FieldMap): string {
  return resolve(rawName, null, customMap).canonical;
}

// ---------------------------------------------------------------------------
// Input iteration
// ---------------------------------------------------------------------------

type FormInput = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const NON_VALUE_TYPES = new Set(["file", "submit", "button", "reset"]);

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

// ---------------------------------------------------------------------------
// Value extraction
// ---------------------------------------------------------------------------

function checkboxOrRadioValue(el: HTMLInputElement): string | null {
  if (!el.checked) return null;
  return el.value && el.value !== "on" ? el.value : "true";
}

function inputValue(el: HTMLInputElement): string | null {
  if (el.type === "checkbox" || el.type === "radio") return checkboxOrRadioValue(el);
  if (NON_VALUE_TYPES.has(el.type)) return null;
  return el.value ?? "";
}

function selectValue(el: HTMLSelectElement): string {
  if (!el.multiple) return el.value;
  return Array.from(el.selectedOptions).map((o) => o.value).join(",");
}

function valueOf(el: FormInput): string | null {
  if (el instanceof HTMLInputElement) return inputValue(el);
  if (el instanceof HTMLSelectElement) return selectValue(el);
  return el.value ?? "";
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

export interface ExtractedFields {
  fields: LeadFields;
  extra: Record<string, string>;
  honeypot: string;
}

type FieldBuckets = Map<string, string[]>;

function collectField(el: FormInput, buckets: FieldBuckets, customMap?: FieldMap): void {
  const rawName = el.name || el.id;
  if (!rawName || rawName === HONEYPOT_NAME) return;

  const value = valueOf(el);
  if (value === null || value === "") return;

  const dataAttr = el.getAttribute("data-hubi-field");
  const { canonical } = resolve(rawName, dataAttr, customMap);

  const existing = buckets.get(canonical);
  if (existing) existing.push(value);
  else buckets.set(canonical, [value]);
}

function readHoneypot(form: HTMLFormElement): string {
  const el = form.querySelector<HTMLInputElement>(`input[name="${HONEYPOT_NAME}"]`);
  return el?.value ?? "";
}

function splitBuckets(buckets: FieldBuckets): { fields: LeadFields; extra: Record<string, string> } {
  const fields: LeadFields = {};
  const extra: Record<string, string> = {};

  for (const [canonical, values] of buckets) {
    const joined = values.join(", ").trim();
    if (!joined) continue;

    if (CANONICAL_SET.has(canonical)) {
      (fields as Record<string, string>)[canonical] = joined;
    } else {
      extra[canonical] = joined;
    }
  }

  return { fields, extra };
}

export function extractFields(form: HTMLFormElement, customMap?: FieldMap): ExtractedFields {
  const buckets: FieldBuckets = new Map();
  for (const el of allInputs(form)) collectField(el, buckets, customMap);

  const { fields, extra } = splitBuckets(buckets);
  return { fields, extra, honeypot: readHoneypot(form) };
}

// ---------------------------------------------------------------------------
// Honeypot injection
// ---------------------------------------------------------------------------

const HONEYPOT_STYLE = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";

function buildHoneypotInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.name = HONEYPOT_NAME;
  input.autocomplete = "off";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  input.style.cssText = HONEYPOT_STYLE;
  return input;
}

export function injectHoneypot(form: HTMLFormElement): void {
  if (form.querySelector(`input[name="${HONEYPOT_NAME}"]`)) return;
  form.appendChild(buildHoneypotInput());
}

// ---------------------------------------------------------------------------
// Feedback hooks
// ---------------------------------------------------------------------------

function showFeedback(form: HTMLFormElement, kind: "success" | "error"): void {
  const el = form.querySelector<HTMLElement>(`[data-hubi-${kind}]`);
  if (!el) return;
  el.removeAttribute("hidden");
  el.style.display = "";
}

// ---------------------------------------------------------------------------
// Debug log: field mapping table
// ---------------------------------------------------------------------------

const VIA_LABELS: Record<ResolveVia, string> = {
  "data-attr": "data-hubi-field",
  custom: "custom map",
  auto: "auto-mapped",
  passthrough: "extra (passthrough)",
};

function logFieldMapping(el: FormInput, customMap?: FieldMap): void {
  const raw = el.name || el.id || "";
  if (!raw || raw === HONEYPOT_NAME) return;

  const dataAttr = el.getAttribute("data-hubi-field");
  const { canonical, via } = resolve(raw, dataAttr, customMap);
  const arrow = via === "passthrough" ? "→" : "←";
  // eslint-disable-next-line no-console
  console.log(`  ${pad(canonical, 18)} ${arrow}  ${pad(`"${raw}"`, 22)} (${VIA_LABELS[via]})`);
}

function logFormBind(form: HTMLFormElement, formId: string, customMap?: FieldMap): void {
  group(`form bound: ${formId}`, () => {
    const inputs = allInputs(form);
    if (inputs.length === 0) return log("(no inputs)");
    for (const el of inputs) logFieldMapping(el, customMap);
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

// data-hubi-intercept defaults to "true"
function shouldIntercept(form: HTMLFormElement): boolean {
  const attr = form.getAttribute("data-hubi-intercept");
  return attr === null || attr === "true" || attr === "";
}

function markBound(form: HTMLFormElement): boolean {
  if (form.hasAttribute("data-hubi-bound")) return false;
  form.setAttribute("data-hubi-bound", "1");
  return true;
}

function attachSubmitListener(
  form: HTMLFormElement,
  options: BindFormOptions,
  handler: FormSubmitHandler,
): void {
  const formId = resolveFormId(form, options.formId);
  const intercept = shouldIntercept(form);

  form.addEventListener("submit", async (e) => {
    if (intercept) e.preventDefault();
    const result = extractFields(form, options.fieldMap);
    log("lead →", { formId, fields: result.fields, extra: result.extra });
    const ok = await handler(result, formId, form);
    showFeedback(form, ok ? "success" : "error");
  });
}

export function bindForm(
  form: HTMLFormElement,
  options: BindFormOptions,
  handler: FormSubmitHandler,
): void {
  if (!markBound(form)) return;
  injectHoneypot(form);
  logFormBind(form, resolveFormId(form, options.formId), options.fieldMap);
  attachSubmitListener(form, options, handler);
}

const AUTO_BIND_SELECTOR = "form[data-hubi-form]";

function bindAllMatching(handler: FormSubmitHandler): void {
  document.querySelectorAll<HTMLFormElement>(AUTO_BIND_SELECTOR).forEach((f) => {
    bindForm(f, {}, handler);
  });
}

export function autoBindForms(handler: FormSubmitHandler): void {
  if (document.body) {
    new MutationObserver(() => bindAllMatching(handler)).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
  bindAllMatching(handler);
}
