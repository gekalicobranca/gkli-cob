import assert from 'node:assert/strict'
import { acompanhamento, avancarPrazo, cobrancaSimulada, correspondeConversa, validarPrazo, type PendenciaKeila } from '../features/keila/acompanhamento'
import type { KeilaCasoPayload } from '../features/keila/casos'
const caso: KeilaCasoPayload = { versao: 1, estado: 'aguardando_administradora', intencao: 'debitos', unidade_ids: [], emails: [], atividades: [], proxima_acao: '', envio_permitido: false, modo: 'supervisionado' }
const p: PendenciaKeila = { id: 'p', tipo: 'boletos', aguardando: 'Administradora', criada_em: '', prazo: '2026-10-06', intervalo_dias: 3, proxima_acao: 'Pode nos retornar sobre os boletos?', simulacoes: [] }
assert.deepEqual(acompanhamento(caso), { conversas: [], pendencias: [] })
assert.match(cobrancaSimulada(caso, p, '2026-10-06'), /boletos/)
assert.throws(() => cobrancaSimulada({ ...caso, estado: 'atendimento_humano' }, p, '2026-10-06'), /suspenso/)
assert.throws(() => cobrancaSimulada(caso, { ...p, resolvida_em: 'agora' }, '2026-10-06'), /resolvida/)
assert.throws(() => cobrancaSimulada(caso, p, '2026-10-05'), /ainda/)
assert.equal(avancarPrazo('2026-09-30', 3, '2026-10-06'), '2026-10-09')
assert.equal(avancarPrazo('2026-12-31', 1, '2026-12-31'), '2027-01-01')
assert.throws(() => validarPrazo('2026-02-30'))
const v = { conta: 'keila@gekali.com.br', conversation_id: 'c', message_id: 'm', interlocutor: 'adm' }
assert.equal(correspondeConversa(v, { ...v, message_id: 'outra' }), true)
assert.equal(correspondeConversa(v, { ...v, conta: 'outra@gekali.com.br' }), false)
console.log('Acompanhamento Keila: validações aprovadas.')
