import { normalizarTelefone } from "@/lib/core/telefone";

/** Regras autorizadas: DDD 11 para números locais e 9 inicial para celulares antigos. */
export function aplicarDddPadraoConversao(value: string | undefined): string {
  return (value ?? "").split(/[|;/,\r\n]+/).map((raw) => {
    const phone = raw.trim();
    const normalized = normalizarTelefone(phone);
    if (normalized.numero || !/^(?:\+\s*)?[\d\s().-]+$/.test(phone)) return phone;
    const digits = phone.replace(/\D/g, "");
    if (normalized.motivo === "sem_ddd" && !phone.startsWith("+")) {
      if (/^(?:[2-5]\d{7}|9\d{8})$/.test(digits)) return `11${digits}`;
      if (/^[6-9]\d{7}$/.test(digits)) return `119${digits}`;
    }
    // Comprimento distingue DDD 55 de código de país; valida o DDD antes de aceitar.
    const national = /^\d{2}[6-9]\d{7}$/.test(digits) && !phone.startsWith("+") ? digits
      : /^55\d{2}[6-9]\d{7}$/.test(digits) ? digits.slice(2)
      : /^0\d{2}[6-9]\d{7}$/.test(digits) && !phone.startsWith("+") ? digits.slice(1)
      : /^0055\d{2}[6-9]\d{7}$/.test(digits) && !phone.startsWith("+") ? digits.slice(4)
      : "";
    const updated = national ? `${national.slice(0, 2)}9${national.slice(2)}` : "";
    return updated && normalizarTelefone(updated).numero ? updated : phone;
  }).filter(Boolean).join(" | ");
}
