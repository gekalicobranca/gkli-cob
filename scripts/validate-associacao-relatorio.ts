import assert from 'node:assert/strict'
import { consolidar, chaveUnidade, estadoProcesso, type AnaliseInadimplencia, type ProcessoRelatorio } from '../features/condominios/relatorio-inadimplencia/modelo'

const processo: ProcessoRelatorio = { numero: 'teste', parte: 'Condomínio Alfa x Empresa Teste Ltda', unidade: '', classe: 'Execução', assunto: '', polo: 'Autor', situacao: 'Encerrado', advogado: '', escritorio: '', origem: 'Teste', fonte: '', observacoes: '', cobrancaPropria: true, marcacaoAutomaticaPermitida: false }
const analise: AnaliseInadimplencia = { versao: 1, arquivo: 'teste', condominioFonte: '123 - COND. Alfa', dataBase: '2026-09-15', dataBaseInferida: false, qualidade: 'completa', itens: [], observacoes: [], encargosPorNatureza: false,
  recibos: [{ id: '1', bloco: 'B', unidade: '000504', responsavel: 'EMPRESA TESTE LTDA EPP', vencimento: '2026-03-05', principal: 100, multa: 0, correcaoJuros: 0, total: 100 }], totais: { principal: 100, multa: 0, correcaoJuros: 0, total: 100 } }
const original = JSON.stringify({ analise, processo })
const relacionar = (overrides: Partial<ProcessoRelatorio> = {}) => consolidar(analise, { processos: [{ ...processo, ...overrides }] })[0]
assert.equal(relacionar().processos.length, 1, 'Restrição de marcação de saldo não apaga associação nominal')
assert.equal(relacionar().processos[0].marcacaoAutomaticaPermitida, false)
assert.equal(relacionar().processos[0].vinculoNoRelatorio, 'nominal')
assert.equal(relacionar().total, 100)
assert.equal(estadoProcesso(processo), 'historico')
assert.equal(relacionar({ parte: 'Condomínio Beta x Empresa Teste Ltda' }).processos.length, 0)
assert.equal(relacionar({ parte: 'Empresa Teste Dois Ltda' }).processos.length, 0)
assert.equal(relacionar({ parte: 'Condomínio Alfa x Empresa Teste Ltda', cobrancaPropria: false }).processos.length, 0)
assert.equal(relacionar({ parte: 'CONDOMÍNIO ALFA - UNIDADE - 504 B' }).processos[0].vinculoNoRelatorio, 'unidade')
assert.equal(relacionar({ parte: 'CONDOMÍNIO BETA - UNIDADE - 504 B' }).processos.length, 0)
assert.equal(relacionar({ parte: 'CONDOMÍNIO ALFA - UNIDADE - 504 C' }).processos.length, 0)
assert.equal(relacionar({ parte: 'Outra parte', unidade: '504', bloco: '', unidadeConfirmada: true }).processos.length, 0, 'Número sem bloco não autoriza associação')
assert.equal(relacionar({ unidade: '703-A', bloco: '', unidadeConfirmada: true }).processos[0].vinculoNoRelatorio, 'nominal', 'Nome coincidente com unidade divergente nunca recebe marca U')
assert.equal(chaveUnidade('0', '208 C'), chaveUnidade('C', '000208'))
assert.notEqual(chaveUnidade('BUSS', '000208'), chaveUnidade('0', '208 C'))
assert.notEqual(chaveUnidade('VILA', '11'), chaveUnidade('E', '000011'))
const referencia = { bloco: 'B', unidade: '504', situacao: 'pre_distribuicao' as const, fonte: 'Conferência sintética', conferidoEm: '2026-09-15' }
const conferida = consolidar(analise, { processos: [processo], conferenciasUnidades: [referencia] })[0]
assert.equal(conferida.preJuridico, true, 'Pré-distribuição de cotas não desaparece por outro processo nominal')
assert.equal(conferida.processos.length, 1)
assert.equal(conferida.conferencia?.situacao, 'pre_distribuicao')
assert.equal(JSON.stringify({ analise, processo }), original, 'Fontes e saldo permanecem intactos')
console.log('Associação: nomes, títulos, blocos, restrição do Jur, conferências e preservação financeira aprovados.')
