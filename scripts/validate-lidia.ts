import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENTES_VIRTUAIS, escopoLidia, validarCondominioLidia, formatarEmailAgente } from '../features/agentes-virtuais/perfis'
import { casoId } from '../features/keila/casos-service'
import { aplicarPrioridadeHumana } from '../features/keila/prioridade-humana'
import type { DecisaoObservacaoKeila } from '../features/keila/observacao'
import { montarPropostaKeila, solicitarBoletosKeila } from '../features/keila/acordos'

test('Lidia restringe administradores e usuários à carteira Genske', () => {
  const carteira = AGENTES_VIRTUAIS.lidia.carteiraId
  assert.deepEqual(escopoLidia(null), [carteira])
  assert.deepEqual(escopoLidia([carteira, 'outra']), [carteira])
  assert.deepEqual(escopoLidia(['outra']), [])
  assert.deepEqual(escopoLidia([]), [])
  assert.throws(() => validarCondominioLidia({ id: AGENTES_VIRTUAIS.lidia.pilotoCondominioId, carteira_id: 'outra' }))
  assert.throws(() => validarCondominioLidia({ id: 'outro', carteira_id: carteira }))
  assert.doesNotThrow(() => validarCondominioLidia({ id: AGENTES_VIRTUAIS.lidia.pilotoCondominioId, carteira_id: carteira }))
})
test('A mesma conversa não colide entre agentes e o id legado da Keila se mantém', () => {
  assert.equal(casoId('condominio', ['unidade'], 'email'), casoId('condominio', ['unidade'], 'email', 'keila'))
  assert.notEqual(casoId('condominio', ['unidade'], 'email'), casoId('condominio', ['unidade'], 'email', 'lidia'))
})
test('Lidia mantém prioridade humana com assinatura e saudação corretas', () => {
  const agora = new Date('2026-10-07T15:30:00Z')
  const decisao: DecisaoObservacaoKeila = { negociacao_humana_outro_canal: true, classificacao: 'proposta', evidencias: ['já negocia com humano'], proxima_acao_simulada: 'abrir acordo', dados_faltantes: ['unidade'], nao_deve_fazer: [], resposta_simulada: 'envie unidade' }
  const resultado = aplicarPrioridadeHumana(decisao, 'Pedro', agora, 'lidia')
  assert.equal(resultado.classificacao, 'prioridade_humana')
  assert.deepEqual(resultado.dados_faltantes, [])
  assert.equal(resultado.resposta_simulada, 'Boa tarde, Pedro\n\n\nObrigada pelo retorno! Seguimos à disposição.\n\nAtenciosamente,\nLidia | Genske Advogados')
  assert.ok(!resultado.resposta_simulada?.includes('Keila'))
  assert.ok(formatarEmailAgente('keila', 'Pedro', 'Texto', agora).endsWith('Keila | GEKALI'))
})

test('Lidia compartilha cálculos e solicita boletos com sua identidade', () => {
  const cobrancas = [{ id: 'c', vencimento: '2026-07-01', valor_atualizado: 100, status_operacional: 'em_cobranca_ativa', status_financeiro: 'em_aberto' }]
  const hoje = new Date('2026-10-07T15:00:00Z')
  const proposta = montarPropostaKeila(cobrancas, 30, 3, '2026-10-15', hoje)
  assert.equal(proposta.percentual, 20)
  assert.deepEqual(proposta.parcelas.map(p => p.valor), [40, 40, 40])
  const semDespesas = montarPropostaKeila(cobrancas, 30, 3, '2026-10-15', hoje, { despesas_acordo_avista_percentual: 0, despesas_acordo_parcelado_percentual: 0, parcelas_acordo_sem_aprovacao_sindico: 3 })
  assert.equal(semDespesas.total, 100)
  const email = solicitarBoletosKeila({ ...proposta, id: 'ACORDO-TESTE', unidade_id: 'u', unidade: '1', etapa: 'acordo_firmado', destinatario: null, cc: ['condomino@example.com'], assunto: '[Acordo ACORDO-TESTE]' }, 'Residencial das Ilhas', 'equipe de cobrança', 'lidia')
  assert.match(email, /cadastro do acordo ACORDO-TESTE/)
  assert.match(email, /15\/10\/2026/)
  assert.match(email, /Lidia \| Genske Advogados$/)
  assert.doesNotMatch(email, /Keila|GEKALI/)
  assert.equal((email.match(/Atenciosamente/g) ?? []).length, 1)
})
