export const CANAIS_CONTATO_ACORDO = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  telefone: "Telefone",
  presencial: "Presencial",
  outro: "Outro",
} as const;

export function hojeOperacional() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function lerContatoRapido(form: FormData, hoje = hojeOperacional()) {
  if (form.get("registrar_contato") !== "on") return null;
  const canal = String(form.get("contato_canal") ?? "");
  const data = String(form.get("contato_data") ?? "");
  const resumo = String(form.get("contato_resumo") ?? "").trim();
  if (!Object.hasOwn(CANAIS_CONTATO_ACORDO, canal)) throw new Error("Selecione o canal do contato.");
  const parsed = new Date(`${data}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== data || data > hoje)
    throw new Error("Informe uma data de contato válida, até hoje.");
  if (resumo.length < 2 || resumo.length > 2000) throw new Error("Descreva o contato em 2 a 2.000 caracteres.");
  return { canal, data, resumo };
}
