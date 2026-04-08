import { describe, it, expect } from "vitest";
import { extractFields, injectHoneypot, resolveCanonicalName } from "./forms";

describe("resolveCanonicalName — field name mapping", () => {
  const cases: Array<[string, string]> = [
    // name
    ["name", "name"], ["nome", "name"], ["Nome", "name"], ["NOME", "name"],
    ["full_name", "name"], ["fullname", "name"], ["nome_completo", "name"],
    // email
    ["email", "email"], ["e-mail", "email"], ["e_mail", "email"], ["mail", "email"], ["Email", "email"],
    // phone
    ["phone", "phone"], ["telefone", "phone"], ["tel", "phone"], ["celular", "phone"],
    ["whatsapp", "phone"], ["Whatsapp", "phone"], ["fone", "phone"], ["mobile", "phone"],
    // company
    ["company", "company"], ["empresa", "company"], ["organizacao", "company"],
    ["organização", "company"], ["organization", "company"],
    // job_title
    ["job_title", "job_title"], ["cargo", "job_title"], ["funcao", "job_title"],
    ["função", "job_title"], ["role", "job_title"], ["position", "job_title"],
    // message
    ["message", "message"], ["mensagem", "message"], ["msg", "message"],
    ["comments", "message"], ["observação", "message"],
  ];

  it.each(cases)("maps '%s' → '%s'", (input, expected) => {
    expect(resolveCanonicalName(input)).toBe(expected);
  });

  it("passes through unrecognized field names", () => {
    expect(resolveCanonicalName("custom_field")).toBe("custom_field");
    expect(resolveCanonicalName("segmento")).toBe("segmento");
  });

  it("respects custom fieldMap (overrides defaults)", () => {
    expect(resolveCanonicalName("nome_usuario", { name: "nome_usuario" })).toBe("name");
  });
});

describe("extractFields", () => {
  function makeForm(html: string): HTMLFormElement {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.querySelector("form")!;
  }

  it("canonicalizes and splits into fields vs extra", () => {
    const form = makeForm(`
      <form>
        <input name="nome" value="João" />
        <input name="email" value="joao@example.com" />
        <input name="telefone" value="11999999999" />
        <input name="segmento" value="Saúde" />
        <input name="numero_funcionarios" value="50-200" />
      </form>
    `);
    const { fields, extra } = extractFields(form);
    expect(fields.name).toBe("João");
    expect(fields.email).toBe("joao@example.com");
    expect(fields.phone).toBe("11999999999");
    expect(extra.segmento).toBe("Saúde");
    expect(extra.numero_funcionarios).toBe("50-200");
  });

  it("honors data-hubi-field as highest-priority override", () => {
    const form = makeForm(`
      <form>
        <input name="resp_nome" data-hubi-field="name" value="Maria" />
      </form>
    `);
    const { fields } = extractFields(form);
    expect(fields.name).toBe("Maria");
  });

  it("applies custom fieldMap", () => {
    const form = makeForm(`<form><input name="user_name" value="Ana" /></form>`);
    const { fields } = extractFields(form, { name: "user_name" });
    expect(fields.name).toBe("Ana");
  });

  it("handles checkbox (single, checked → 'true')", () => {
    const form = makeForm(`
      <form>
        <input type="checkbox" name="newsletter" checked />
      </form>
    `);
    const { extra } = extractFields(form);
    expect(extra.newsletter).toBe("true");
  });

  it("handles checkbox unchecked (skipped)", () => {
    const form = makeForm(`<form><input type="checkbox" name="newsletter" /></form>`);
    const { extra } = extractFields(form);
    expect(extra.newsletter).toBeUndefined();
  });

  it("handles multiple checkboxes with same name", () => {
    const form = document.createElement("form");
    const values: Array<[string, boolean]> = [
      ["ads", true],
      ["seo", true],
      ["social", false],
    ];
    for (const [value, checked] of values) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = "canais";
      cb.value = value;
      cb.checked = checked;
      form.appendChild(cb);
    }
    const { extra } = extractFields(form);
    expect(extra.canais).toBe("ads, seo");
  });

  it("handles radio group", () => {
    const form = makeForm(`
      <form>
        <input type="radio" name="plano" value="pro" checked />
        <input type="radio" name="plano" value="basic" />
      </form>
    `);
    const { extra } = extractFields(form);
    expect(extra.plano).toBe("pro");
  });

  it("handles select multiple", () => {
    const form = makeForm(`
      <form>
        <select name="produtos" multiple>
          <option value="a" selected>A</option>
          <option value="b" selected>B</option>
          <option value="c">C</option>
        </select>
      </form>
    `);
    const { extra } = extractFields(form);
    expect(extra.produtos).toBe("a,b");
  });

  it("skips empty fields", () => {
    const form = makeForm(`<form><input name="nome" value="" /></form>`);
    const { fields } = extractFields(form);
    expect(fields.name).toBeUndefined();
  });

  it("captures honeypot value separately", () => {
    const form = makeForm(`
      <form>
        <input name="nome" value="Maria" />
        <input name="hubi_hp" value="bot-was-here" />
      </form>
    `);
    const { fields, honeypot } = extractFields(form);
    expect(fields.name).toBe("Maria");
    expect(honeypot).toBe("bot-was-here");
  });
});

describe("injectHoneypot", () => {
  it("adds a hidden hubi_hp input", () => {
    const form = document.createElement("form");
    injectHoneypot(form);
    const hp = form.querySelector('input[name="hubi_hp"]') as HTMLInputElement;
    expect(hp).not.toBeNull();
    expect(hp.type).toBe("text");
    expect(hp.tabIndex).toBe(-1);
  });

  it("is idempotent", () => {
    const form = document.createElement("form");
    injectHoneypot(form);
    injectHoneypot(form);
    expect(form.querySelectorAll('input[name="hubi_hp"]').length).toBe(1);
  });
});
