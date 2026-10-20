import assert from 'node:assert/strict'
import { competenciasOperacao, montarOperacaoSindico, type FonteOperacao } from '../features/sindico-v2/operacao'
import { resolverPeriodo } from '../features/sindico-v2/periodos'

const agora = new Date('2026-10-20T12:00:00Z')
const periodo = resolverPeriodo({ competencia: '2026-10' }, agora)
const base = { id: '1', condominio_id: 'condominio', unidade_id: 'u1', created_at: '2026-09-20T12:00:00Z', unidades: { identificacao: '101', bloco: 'A', responsavel_nome: 'NAO EXPOR' } }
const acordo = { ...base, data_acordo: '2026-09-10', valor_acordado: '100.10', quantidade_parcelas: 2, status: 'ativo', exige_aprovacao_sindico: true, sindico_aprovado_em: null }
const fonte: FonteOperacao = {
  cobrancas: [
    { ...base, valor_atualizado: '100.10', valor_original: 90, status: 'novo', status_operacional: 'em_cobranca_ativa', status_financeiro: 'em_aberto', vencimento: '2026-08-01' },
    { ...base, id: '2', valor_atualizado: 500, valor_original: 500, status: 'regular', status_operacional: 'regular', status_financeiro: 'quitado', vencimento: '2026-08-01' },
    { ...base, id: '3', valor_atualizado: 900, valor_original: 900, status: 'acordo_firmado', status_operacional: 'acordo_efetivado', status_financeiro: 'renegociado', vencimento: '2026-08-01' },
    { ...base, id: 'estranha', condominio_id: 'outro', valor_atualizado: 9999, valor_original: 9999, status: 'novo', status_operacional: 'novo', status_financeiro: 'em_aberto', vencimento: '2026-08-01' },
  ],
  acordos: [acordo, { ...acordo, id: 'outro', condominio_id: 'outro' }, { ...acordo, id: 'antigo', status: 'quitado', data_acordo: '2026-01-01' }],
  parcelas: [
    { id: 'p1', acordo_id: '1', numero: 1, valor: '40.10', vencimento: '2026-09-15', status: 'paga', data_pagamento: '2026-09-10' },
    { id: 'p2', acordo_id: '1', numero: 2, valor: 60, vencimento: '2026-10-01', status: 'aberta', data_pagamento: null },
    { id: 'p3', acordo_id: 'antigo', numero: 1, valor: 10, vencimento: '2026-09-10', status: 'paga', data_pagamento: '2026-10-09' },
    { id: 'p4', acordo_id: '1', numero: 3, valor: 999, vencimento: '2026-10-10', status: 'paga', data_pagamento: '2026-10-10' },
    { id: 'p5', acordo_id: '1', numero: 4, valor: 999, vencimento: '2026-10-01', status: 'cancelada', data_pagamento: '2026-10-01' },
    { id: 'p6', acordo_id: 'outro', numero: 1, valor: 9999, vencimento: '2026-10-01', status: 'paga', data_pagamento: '2026-10-01' },
  ],
  pendencias: [
    { ...base, tipo: 'emissao_boletos_acordo', origem: 'administradora', status: 'aberta', prioridade: 'alta', prazo_limite: null },
    { ...base, id: 'resolvida', tipo: 'manual', origem: 'manual', status: 'resolvida', prioridade: 'alta', prazo_limite: null },
    { ...base, id: 'outro', condominio_id: 'outro', tipo: 'manual', origem: 'manual', status: 'aberta', prioridade: 'alta', prazo_limite: null },
  ],
  procuracoes: [{ ...base, procuracao_status: 'enviada', etapa: 'documentacao', prazo_etapa: null }],
  erros: [],
}
const areas = montarOperacaoSindico(fonte, 'condominio', periodo, agora)
const valor = (area: number, titulo: string) => areas[area].indicadores.find((item) => item.titulo === titulo)?.valor.replace(/\s/g, '')
assert.equal(areas[0].linhas.length, 1, 'Excluir cobranças encerradas, acordadas e de outro condomínio')
assert.equal(valor(0, 'Saldo atual em cobrança'), 'R$100,10')
assert.equal(valor(1, 'Valor negociado no período'), 'R$100,10')
assert.equal(valor(1, 'Recebimentos registrados no período'), 'R$50,10', 'Incluir pagamento de acordo antigo e excluir o dia final, cancelamentos e outro condomínio')
assert.equal(valor(1, 'Saldo atual de parcelas em aberto'), 'R$60,00')
assert.equal(valor(1, 'Parcelas atualmente vencidas'), '1')
assert.equal(areas[2].linhas.length, 3)
assert.equal(valor(2, 'Aprovações do síndico'), '1')
assert.ok(!JSON.stringify(areas).includes('NAO EXPOR'), 'Não expor dados de responsáveis nas unidades')
assert.ok(areas.every((area) => area.aviso.includes('Situação atual')))
const anual = montarOperacaoSindico(fonte, 'condominio', resolverPeriodo({ modo: 'anual', ano: '2026' }, agora), agora)
assert.equal(anual[1].indicadores[1].valor.replace(/\s/g, ''), 'R$50,10', 'Consolidado anual respeita o último ciclo encerrado')
assert.deepEqual(competenciasOperacao(fonte, 'condominio', agora), ['2026-10', '2026-01'])
assert.deepEqual(competenciasOperacao(fonte, 'sem-acesso', agora), [])
const erro = montarOperacaoSindico({ ...fonte, erros: ['parcelas'] }, 'condominio', periodo, agora)
assert.equal(erro[1].erro, true)
assert.equal(erro[0].erro, false)
assert.equal(erro[2].erro, false)
assert.ok(montarOperacaoSindico({ cobrancas: [], acordos: [], parcelas: [], pendencias: [], procuracoes: [], erros: [] }, 'condominio', periodo, agora).every((area) => !area.erro && area.linhas.length === 0))
console.log('Operação do síndico validada: isolamento, períodos, recebimentos, saldos, pendências, minimização e falhas por área.')
