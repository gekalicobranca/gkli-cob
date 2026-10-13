import { normalizarTelefone } from "@/lib/core/telefone";

/** Regra autorizada para conversões: números locais válidos recebem DDD 11. */
export function aplicarDddPadraoConversao(value: string | undefined): string {
  return (value ?? "").split(/[|;/,\r\n]+/).map((raw) => {
    const phone = raw.trim();
    if (normalizarTelefone(phone).motivo !== "sem_ddd") return phone;
    const digits = phone.replace(/\D/g, "");
    return /^(?:[2-5]\d{7}|9\d{8})$/.test(digits) ? `11${digits}` : phone;
  }).filter(Boolean).join(" | ");
}
