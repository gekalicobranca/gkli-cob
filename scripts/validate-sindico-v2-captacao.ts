import assert from 'node:assert/strict'
import {
  montarCaptacao,
  montarCaptacaoComHistorico,
  competenciaDoRegistro,
  type RegistroCaptacao,
  type RegistroCaptacaoHistorica,
} from '../features/sindico-v2/captacao'
import { resolverPeriodo } from '../features/sindico-v2/periodos'

const now = new Date('2026-10-11T12:00:00Z')
const mensal = resolverPeriodo({ competencia: '2026-09' }, now)
function registro(overrides: Partial<RegistroCaptacao> = {}): RegistroCaptacao {
  return { id: '1', condominio_id: 'condominio', status: 'concluido', criado_em: '2026-09-01T10:00:00Z', atualizado_em: '2026-09-01T10:02:00Z', gerado_em: '2026-09-01T10:01:59Z', total_unidades: 1, valor_total_ranking: 100, unidades_ranking: [{ unidade: '01', bloco: 'A', valor: 100, status: 'Extrajudicial', responsavel: 'NÃO EXPOR', andamento: 'OBSERVAÇÃO INTERNA' }], ...overrides }
}
assert.equal(competenciaDoRegistro('2026-09-10T02:59:59Z'), '2026-09')
assert.equal(competenciaDoRegistro('2026-09-10T03:00:00Z'), '2026-10')
assert.equal(competenciaDoRegistro('inválido'), null)
const valido = montarCaptacao([registro()], 'condominio', mensal)
assert.equal(valido.estado, 'disponivel')
assert.equal(valido.ciclos[0].valor, 100)
assert.equal(JSON.stringify(valido).includes('NÃO EXPOR'), false)
assert.equal(JSON.stringify(valido).includes('OBSERVAÇÃO INTERNA'), false)
assert.equal(montarCaptacao([registro()], 'outro', mensal).estado, 'indisponivel')
assert.equal(montarCaptacao([registro({ status: 'aguardando_validacao' })], 'condominio', mensal).estado, 'indisponivel')
const novo = registro({ id: '2', gerado_em: '2026-09-02T10:01:59Z', atualizado_em: '2026-09-02T10:02:00Z' })
assert.equal(montarCaptacao([registro(), novo], 'condominio', mensal).ciclos[0].valor, 100, 'Relatórios repetidos não se somam')
assert.equal(montarCaptacao([registro(), { ...novo, unidades_ranking: null }], 'condominio', mensal).estado, 'indisponivel', 'Não esconder falha do último relatório usando um anterior')
for (const overrides of [
  { valor_total_ranking: 101 }, { total_unidades: 2 }, { gerado_em: null },
  { gerado_em: '2026-09-01T10:03:00Z' }, { gerado_em: '2026-08-09T10:01:00Z' },
  { unidades_ranking: [{ unidade: '1', valor: -10 }] },
  { unidades_ranking: [{ unidade: '1', valor: 50 }, { unidade: '1', valor: 50 }], total_unidades: 2 },
]) assert.equal(montarCaptacao([registro(overrides)], 'condominio', mensal).estado, 'indisponivel')
const anual = resolverPeriodo({ modo: 'anual', ano: '2026' }, now)
const resumo = montarCaptacao([registro(), novo], 'condominio', anual)
assert.equal(resumo.estado, 'parcial')
assert.equal(resumo.ciclosDisponiveis, 1)
assert.equal(resumo.ciclos.find(c => c.competencia === '2026-09')?.valor, 100)
assert.equal(resumo.ciclos.at(-1)?.valor, null, 'Não transportar saldo antigo para o último ciclo')
const zero = montarCaptacao([registro({ total_unidades: 0, valor_total_ranking: 0, unidades_ranking: [] })], 'condominio', mensal)
assert.equal(zero.estado, 'disponivel')
assert.equal(zero.ciclos[0].valor, 0)
const historico: RegistroCaptacaoHistorica = {
  id: 'h1',
  condominio_id: 'condominio',
  unidade_id: 'unidade',
  competencia: '2026-09',
  referencia_em: '2026-09-02T13:00:00Z',
  data_entrada: '2026-09-02',
  valor: 90,
  debito_descricao: '09/2026',
  debito_inicial: '10/08/2026',
  debito_final: '10/09/2026',
  situacao: 'Extrajudicial',
  unidade_identificacao: '12',
  bloco: 'A',
}
const fallbackHistorico = montarCaptacaoComHistorico([], [historico], 'condominio', mensal)
assert.equal(fallbackHistorico.estado, 'disponivel')
assert.equal(fallbackHistorico.ciclos[0].fonte, 'historico')
assert.equal(fallbackHistorico.ciclos[0].valor, 90)
assert.equal(fallbackHistorico.ciclos[0].unidades[0].situacao, 'Extrajudicial')
assert.equal(fallbackHistorico.ciclos[0].unidades[0].debitoFinal, '10/09/2026')
const preferirRelatorio = montarCaptacaoComHistorico([registro()], [historico], 'condominio', mensal)
assert.equal(preferirRelatorio.ciclos[0].fonte, 'relatorio')
assert.equal(preferirRelatorio.ciclos[0].valor, 100)
const historicoIncompleto = montarCaptacaoComHistorico([], [{ ...historico, unidade_identificacao: '' }], 'condominio', mensal)
assert.equal(historicoIncompleto.estado, 'indisponivel')
console.log('Captação validada: fronteiras, deduplicação, conciliação, cobertura anual e minimização dos dados.')
