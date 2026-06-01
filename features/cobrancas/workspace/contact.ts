export function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

export function getContactLabel(value?: string | null) {
  return value && value.trim().length > 0 ? value : "Não informado";
}

export function buildWhatsappHref(params: {
  telefone?: string | null;
  responsavel?: string | null;
  condominio?: string | null;
  unidade?: string | null;
}) {
  const digits = onlyDigits(params.telefone);
  if (!digits) return null;

  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const message = [
    `Olá${params.responsavel ? `, ${params.responsavel}` : ""}.`,
    "Aqui é da GKLI Cobrança.",
    `Estou entrando em contato sobre a unidade ${params.unidade ?? "-"} do ${params.condominio ?? "condomínio"}.`,
    "Podemos conversar para regularizar essa pendência?",
  ].join(" ");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
