import type { BindFormOptions, FieldMap } from "./types";
import { group, log } from "./logger";

// Maps canonical field names → known label/name variants (case+accent insensitive)
const CANONICAL_MAP: Record<string, string[]> = {
  name: ["name", "nome", "full_name", "fullname", "nome_completo"],
  email: ["email", "e-mail", "e_mail", "mail"],
  phone: ["phone", "telefone", "tel", "celular", "whatsapp", "fone"],
  company: ["company", "empresa", "companhia", "organizacao", "organização"],
  job_title: ["job_title", "cargo", "funcao", "função", "role", "position"],
  message: ["message", "mensagem", "msg", "texto", "observacao", "observação"],
  mql_question: ["mql", "mql_question", "qualificacao", "qualificação", "interesse"],
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "_");
}

function resolveCanonical(
  fieldName: string,
  customMap?: FieldMap,
): { canonical: string; via: "custom" | "auto" | "passthrough" } {
  if (customMap) {
    for (const [canonical, alias] of Object.entries(customMap)) {
      if (normalize(alias) === normalize(fieldName)) {
        return { canonical, via: "custom" };
      }
    }
  }

  const normalizedInput = normalize(fieldName);

  for (const [canonical, variants] of Object.entries(CANONICAL_MAP)) {
    for (const variant of variants) {
      if (normalize(variant) === normalizedInput) {
        return { canonical, via: "auto" };
      }
    }
  }

  return { canonical: fieldName, via: "passthrough" };
}

// Exported for testing — returns just the canonical string
export function resolveCanonicalName(fieldName: string, customMap?: FieldMap): string {
  return resolveCanonical(fieldName, customMap).canonical;
}

export function extractFields(
  form: HTMLFormElement,
  customMap?: FieldMap,
): Record<string, string> {
  const data: Record<string, string> = {};
  const formData = new FormData(form);

  formData.forEach((value, key) => {
    if (typeof value === "string" && value.trim()) {
      const { canonical } = resolveCanonical(key, customMap);
      data[canonical] = value.trim();
    }
  });

  return data;
}

function logFormBind(form: HTMLFormElement, formId: string, customMap?: FieldMap): void {
  group(`form bound: ${formId || "#" + (form.id || "unknown")}`, () => {
    const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea",
    );

    if (inputs.length === 0) {
      log("  (no inputs found)");
      return;
    }

    inputs.forEach((el) => {
      const raw = el.name || el.id || "";
      if (!raw) return;

      const { canonical, via } = resolveCanonical(raw, customMap);
      const tag =
        via === "custom"
          ? "custom map"
          : via === "auto"
            ? "auto-mapped"
            : "passthrough — not recognized";

      const arrow = via === "passthrough" ? "→" : "←";
      // eslint-disable-next-line no-console
      console.log(`  %-18s ${arrow}  %-20s (%s)`, canonical, `"${raw}"`, tag);
    });
  });
}

export function bindForm(
  form: HTMLFormElement,
  options: BindFormOptions,
  onSubmit: (fields: Record<string, string>, formId: string) => void,
): void {
  const formId = options.formId ?? form.id ?? form.getAttribute("name") ?? "unknown";

  logFormBind(form, formId, options.fieldMap);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = extractFields(form, options.fieldMap);
    log("lead fields →", fields);
    onSubmit(fields, formId);
  });
}

export function autoBindForms(
  onSubmit: (fields: Record<string, string>, formId: string) => void,
): void {
  const tryBind = (form: HTMLFormElement) => {
    if (form.hasAttribute("data-hubi-bound")) return;
    form.setAttribute("data-hubi-bound", "1");
    bindForm(form, {}, onSubmit);
  };

  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLFormElement>("form[data-hubi-form]").forEach(tryBind);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll<HTMLFormElement>("form[data-hubi-form]").forEach(tryBind);
}
