import type { BindFormOptions, FieldMap } from "./types";

// Maps canonical field names → known label/name variants (case+accent insensitive)
const CANONICAL_MAP: Record<string, string[]> = {
  name: ["name", "nome", "full_name", "fullname", "nome_completo"],
  email: ["email", "e-mail", "e_mail", "mail"],
  phone: ["phone", "telefone", "tel", "celular", "whatsapp", "fone"],
  company: ["company", "empresa", "companhia", "organizacao", "organização"],
  job_title: ["job_title", "cargo", "funcao", "função", "role", "position"],
  message: ["message", "mensagem", "msg", "texto", "observacao", "observação"],
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "_");
}

function resolveCanonical(fieldName: string, customMap?: FieldMap): string {
  // Custom map takes priority
  if (customMap) {
    for (const [canonical, alias] of Object.entries(customMap)) {
      if (normalize(alias) === normalize(fieldName)) return canonical;
    }
  }

  const normalizedInput = normalize(fieldName);

  for (const [canonical, variants] of Object.entries(CANONICAL_MAP)) {
    for (const variant of variants) {
      if (normalize(variant) === normalizedInput) return canonical;
    }
  }

  return fieldName; // passthrough if not recognized
}

export function extractFields(
  form: HTMLFormElement,
  customMap?: FieldMap,
): Record<string, string> {
  const data: Record<string, string> = {};
  const formData = new FormData(form);

  formData.forEach((value, key) => {
    if (typeof value === "string" && value.trim()) {
      const canonical = resolveCanonical(key, customMap);
      data[canonical] = value.trim();
    }
  });

  return data;
}

// Exported for testing
export { resolveCanonical };

export function bindForm(
  form: HTMLFormElement,
  options: BindFormOptions,
  onSubmit: (fields: Record<string, string>, formId: string) => void,
): void {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = extractFields(form, options.fieldMap);
    const formId = options.formId ?? form.id ?? form.getAttribute("name") ?? "unknown";
    onSubmit(fields, formId);
  });
}

export function autoBindForms(
  onSubmit: (fields: Record<string, string>, formId: string) => void,
): void {
  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLFormElement>("form[data-hubi-form]:not([data-hubi-bound])").forEach((form) => {
      form.setAttribute("data-hubi-bound", "1");
      bindForm(form, {}, onSubmit);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Bind forms already in DOM
  document.querySelectorAll<HTMLFormElement>("form[data-hubi-form]:not([data-hubi-bound])").forEach((form) => {
    form.setAttribute("data-hubi-bound", "1");
    bindForm(form, {}, onSubmit);
  });
}
