import assert from "node:assert/strict";
import { test } from "node:test";
import { lerContatoRapido } from "../features/acordos/contato-rapido";
import { formatarVencimentoAcordo } from "../features/acordos/formatar-vencimento";

function form(values: Record<string, string>) { const f = new FormData(); Object.entries(values).forEach(([k,v]) => f.set(k,v)); return f; }
const valido = { registrar_contato: "on", contato_canal: "whatsapp", contato_data: "2026-10-27", contato_resumo: "  Proposta confirmada pelo responsável.  " };
test("vencimento mantém o dia do calendário, independente do fuso", () => {
  assert.equal(formatarVencimentoAcordo("2026-11-03"), "03/11/2026");
  assert.equal(formatarVencimentoAcordo("2026-10-10"), "10/10/2026");
  assert.equal(formatarVencimentoAcordo(null), "-");
});
test("contato é opcional e não registra campos residuais quando desmarcado", () => {
  assert.equal(lerContatoRapido(form({ ...valido, registrar_contato: "" })), null);
});
test("preserva canal e data do contato, removendo espaços do resumo", () => {
  assert.deepEqual(lerContatoRapido(form(valido), "2026-10-27"), { canal: "whatsapp", data: "2026-10-27", resumo: valido.contato_resumo.trim() });
});
test("rejeita canal inválido, data inexistente ou futura e resumo incompleto", () => {
  for (const patch of [{ contato_canal: "sms" }, { contato_canal: "toString" }, { contato_data: "2026-02-30" }, { contato_data: "2026-10-28" }, { contato_data: "" }, { contato_resumo: " " }, { contato_resumo: "x".repeat(2001) }]) {
    assert.throws(() => lerContatoRapido(form({ ...valido, ...patch }), "2026-10-27"));
  }
});
