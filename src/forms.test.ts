import { describe, it, expect } from "vitest";
import { resolveCanonical, extractFields } from "./forms";

describe("resolveCanonical — field name mapping", () => {
  const cases: Array<[string, string]> = [
    // name
    ["name", "name"],
    ["nome", "name"],
    ["Nome", "name"],
    ["NOME", "name"],
    ["full_name", "name"],
    ["fullname", "name"],
    ["nome_completo", "name"],

    // email
    ["email", "email"],
    ["e-mail", "email"],
    ["e_mail", "email"],
    ["mail", "email"],
    ["Email", "email"],

    // phone
    ["phone", "phone"],
    ["telefone", "phone"],
    ["tel", "phone"],
    ["celular", "phone"],
    ["whatsapp", "phone"],
    ["Whatsapp", "phone"],
    ["fone", "phone"],

    // company
    ["company", "company"],
    ["empresa", "company"],
    ["companhia", "company"],
    ["organizacao", "company"],
    ["organização", "company"],

    // job_title
    ["job_title", "job_title"],
    ["cargo", "job_title"],
    ["funcao", "job_title"],
    ["função", "job_title"],
    ["role", "job_title"],
    ["position", "job_title"],

    // message
    ["message", "message"],
    ["mensagem", "message"],
    ["msg", "message"],
    ["texto", "message"],
    ["observacao", "message"],
    ["observação", "message"],
  ];

  it.each(cases)("maps '%s' → '%s'", (input, expected) => {
    expect(resolveCanonical(input)).toBe(expected);
  });

  it("passes through unrecognized field names", () => {
    expect(resolveCanonical("custom_field")).toBe("custom_field");
    expect(resolveCanonical("produto")).toBe("produto");
  });

  it("respects custom fieldMap (overrides defaults)", () => {
    const customMap = { name: "nome_usuario" };
    expect(resolveCanonical("nome_usuario", customMap)).toBe("name");
  });
});

describe("extractFields", () => {
  function makeForm(fields: Record<string, string>): HTMLFormElement {
    const form = document.createElement("form");
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    return form;
  }

  it("extracts and canonicalizes form fields", () => {
    const form = makeForm({ nome: "João Silva", email: "joao@example.com", telefone: "11999999999" });
    const fields = extractFields(form);
    expect(fields).toMatchObject({
      name: "João Silva",
      email: "joao@example.com",
      phone: "11999999999",
    });
  });

  it("skips empty fields", () => {
    const form = makeForm({ nome: "Maria", email: "" });
    const fields = extractFields(form);
    expect(fields).not.toHaveProperty("email");
    expect(fields.name).toBe("Maria");
  });

  it("applies custom field map", () => {
    const form = makeForm({ user_name: "Ana" });
    const fields = extractFields(form, { name: "user_name" });
    expect(fields.name).toBe("Ana");
  });
});
