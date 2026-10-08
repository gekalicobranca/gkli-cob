import assert from 'node:assert/strict'
import { montarPropostaKeila, solicitarBoletosKeila } from '../features/keila/acordos'

const hoje = new Date('2026-10-06T12:00:00Z')
const condicoes = { despesas_acordo_avista_percentual: 10, despesas_acordo_parcelado_percentual: 20, parcelas_acordo_sem_aprovacao_sindico: 6 }
const cobrancas = [
  { id: 'elegivel', vencimento: '2026-08-10', valor_atualizado: 100.01, status_financeiro: 'em_aberto', status_operacional: 'em_cobranca_ativa' },
  { id: 'fora', vencimento: '2026-09-10', valor_atualizado: 1000, status_financeiro: 'em_aberto', status_operacional: 'novo' },
  { id: 'humano', vencimento: '2026-08-10', valor_atualizado: 1000, status_financeiro: 'em_aberto', status_operacional: 'suspenso' },
]
const p = montarPropostaKeila(cobrancas, 30, 3, '2026-10-15', hoje, condicoes)
assert.equal(p.base, 100.01)
assert.equal(p.total, 120.01)
assert.deepEqual(p.parcelas.map(p => p.valor), [40.01, 40, 40])
assert.deepEqual(p.parcelas.map(p => p.vencimento), ['2026-10-15', '2026-11-15', '2026-12-15'])
const fimMes = montarPropostaKeila(cobrancas, 30, 3, '2027-01-31', hoje, condicoes)
assert.deepEqual(fimMes.parcelas.map(p => p.vencimento), ['2027-01-31', '2027-02-28', '2027-03-31'])
const quatro = montarPropostaKeila(cobrancas, 30, 4, '2026-10-15', hoje, { ...condicoes, despesas_acordo_parcelado_percentual: 10 })
assert.equal(quatro.percentual, 10)
assert.equal(quatro.total, 110.01)
assert.equal(quatro.exige_aprovacao, false)
assert.equal(quatro.parcelas.reduce((s,p) => s+Math.round(p.valor*100),0), 11001)
assert.equal(montarPropostaKeila(cobrancas, 30, 7, '2026-10-15', hoje, condicoes).exige_aprovacao, true)
assert.equal(montarPropostaKeila(cobrancas, 30, 7, '2026-10-15', hoje, { ...condicoes, parcelas_acordo_sem_aprovacao_sindico: 0 }).exige_aprovacao, false)
assert.equal(montarPropostaKeila(cobrancas, 30, 2, '2026-10-15', hoje, { ...condicoes, despesas_acordo_parcelado_percentual: 0 }).total, 100.01)
assert.equal(montarPropostaKeila(cobrancas, 30, 3, '2026-10-15', hoje).percentual, 20)
assert.equal(montarPropostaKeila(cobrancas, 30, 1, '2026-10-15', hoje).percentual, 10)
assert.throws(() => montarPropostaKeila(cobrancas, 30, 3.5, '2026-10-15', hoje, condicoes))
assert.throws(() => montarPropostaKeila(cobrancas, 30, 121, '2026-10-15', hoje, condicoes))
assert.throws(() => montarPropostaKeila(cobrancas, 30, 1, '2026-02-30', hoje, condicoes), /Vencimento inválido/)
assert.throws(() => montarPropostaKeila(cobrancas, 30, 1, '2026-10-05', hoje, condicoes), /passado/)
const texto = solicitarBoletosKeila({ ...p, id: 'ID-ACORDO', unidade_id: 'u', unidade: '1', etapa: 'acordo_firmado', cc: ['condomino@example.com'], destinatario: null, assunto: '' }, 'Safira', 'equipe de cobrança')
assert.match(texto, /cadastro do acordo ID-ACORDO/)
assert.match(texto, /15\/10\/2026/)
assert.equal((texto.match(/Atenciosamente/g) ?? []).length, 1)
console.log('Keila: régua, bloqueios, centavos, vencimentos mensais e solicitação de boletos conferidos.')
