import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { criarExcelRelatorioAcordos } from '../features/acordos/exportacao-excel'
import { criarExcelAdministradoras } from '../features/administradoras/exportacao-excel'
import { criarExcelRelatorioCobrancas } from '../features/cobrancas/exportacao-excel'
import { criarExcelExportacaoCondominio } from '../features/condominios/exportacao-cadastro-excel'
import { criarExcelCondominios } from '../features/condominios/exportacao-excel'
import { criarExcelUnidades } from '../features/unidades/exportacao-excel'

async function loadWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)
  return workbook
}

async function validateCondominios(outputDir: string) {
  const rows = [
    { nome: 'CONDOMÍNIO RESIDENCIAL JARDINS DO IPIRANGA', cnpj: '00123456000109', administradora: 'Administradora São Paulo', carteiras: { nome: 'Carteira Paulista' }, sindico_email: 'sindico@example.com', sindico_celular: '011900000000', gerente_email: 'gerente@example.com', gerente_celular: '(11) 90000-0001', endereco_logradouro: 'Avenida das Acácias', endereco_numero: '1200', endereco_complemento: 'Torre A', endereco_bairro: 'Ipiranga', endereco_cidade: 'São Paulo', endereco_uf: 'SP', endereco_cep: '01234000', vencimento_cota_dia: 10, valor_cota_condominial: '850.25', inicio_cobranca_dias: 30, dias_expiracao_regua_pre_juridico: 60 },
    { nome: 'CONDOMÍNIO PRAÇA DAS ÁRVORES', administradora: 'Gestão & Administração', carteiras: [{ nome: 'Carteira Central' }], valor_cota_condominial: 0, inicio_cobranca_dias: 0 },
    { nome: '=Nome literal', administradora: null },
  ]
  const bytes = await criarExcelCondominios(rows, new Date('2026-09-11T15:00:00Z'))
  const workbook = await loadWorkbook(bytes)
  const sheet = workbook.getWorksheet('DADOS')!
  assert.equal(sheet.getCell('C5').value, 'Administradora')
  assert.equal(sheet.getCell('C6').value, rows[0].administradora)
  assert.equal(sheet.getCell('B6').value, '00123456000109')
  assert.equal(sheet.getCell('O6').value, '01234000')
  assert.equal(sheet.getCell('D7').value, 'Carteira Central')
  assert.equal(sheet.getCell('Q6').value, 850.25)
  assert.equal(sheet.getCell('Q7').value, 0)
  assert.equal(sheet.getCell('Q8').value, null)
  assert.equal(sheet.getCell('Q6').numFmt, '"R$" #,##0.00')
  assert.equal(sheet.getCell('A8').type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('A8').value, '=Nome literal')
  assert.equal(sheet.views[0].state, 'frozen')
  assert.equal(sheet.autoFilter, 'A5:S8')
  assert.equal(sheet.rowCount, 8)
  const empty = await loadWorkbook(await criarExcelCondominios([]))
  assert.match(String(empty.getWorksheet('DADOS')!.getCell('A3').value), /Nenhum condomínio/)
  assert.equal(empty.getWorksheet('DADOS')!.getCell('S5').value, 'Expiração da régua pré-jurídica (dias)')
  writeFileSync(`${outputDir}/condominios.xlsx`, bytes)
}

async function validateUnidades(outputDir: string) {
  const rows = [{
    identificacao: '001',
    bloco: 'A',
    responsavel_nome: 'Maria de Souza',
    responsavel_documento: '00011122233',
    telefone: '011900000000',
    email: 'maria@example.com',
    status: 'ativa',
    credito_administradora: '125.5',
    acao_judicial: true,
    observacoes: 'Cadastro revisado',
    condominios: { nome: 'Condomínio São José', cnpj: '00123456000109', administradora: 'Administradora São Paulo' },
    carteiras: { nome: 'Carteira Paulista' },
  }]
  const bytes = await criarExcelUnidades(rows, new Date('2026-09-11T15:00:00Z'))
  const sheet = (await loadWorkbook(bytes)).getWorksheet('DADOS')!
  assert.equal(sheet.getCell('A5').value, 'Condomínio')
  assert.equal(sheet.getCell('B6').value, '00123456000109')
  assert.equal(sheet.getCell('E6').value, '001')
  assert.equal(sheet.getCell('L6').value, 125.5)
  assert.equal(sheet.getCell('L6').numFmt, '"R$" #,##0.00')
  assert.equal(sheet.getCell('M6').value, 'Sim')
  assert.equal(sheet.autoFilter, 'A5:N6')
  writeFileSync(`${outputDir}/unidades.xlsx`, bytes)
}

async function validateAdministradoras(outputDir: string) {
  const rows = [{
    id: 'adm-1',
    nome: 'ADMINISTRADORA SÃO PAULO LTDA',
    nome_operacional: 'Adm São Paulo',
    cnpj: '00999888000177',
    status: 'ativo',
    acesso_gerar_acordo: false,
    email: 'contato@example.com',
    telefone: '(11) 3000-0000',
    site: 'https://example.com',
    responsavel_interno: 'Operação',
    observacoes: 'Contato geral',
  }]
  const bytes = await criarExcelAdministradoras(rows, new Date('2026-09-11T15:00:00Z'))
  const sheet = (await loadWorkbook(bytes)).getWorksheet('DADOS')!
  assert.equal(sheet.getCell('A5').value, 'Nome operacional')
  assert.equal(sheet.getCell('C6').value, '00999888000177')
  assert.equal(sheet.getCell('E6').value, 'Não')
  assert.equal(sheet.autoFilter, 'A5:J6')
  writeFileSync(`${outputDir}/administradoras.xlsx`, bytes)
}

async function validateCobrancas(outputDir: string) {
  const rows = [{
    id: 'cob-1',
    carteira_id: 'cart-1',
    condominio_id: 'cond-1',
    unidade_id: 'und-1',
    competencia: '2026-08',
    vencimento: '2026-08-10',
    valor_original: 1000,
    valor_atualizado: '1125.75',
    juros: 25,
    multa: 20,
    correcao: 80.75,
    desconto: 0,
    status: 'novo',
    status_operacional: 'em_cobranca_ativa',
    status_financeiro: 'aberto',
    ultima_interacao_at: '2026-09-01',
    unidade_bloqueada_por_judicializacao: false,
    carteiras: { nome: 'Carteira Paulista' },
    condominios: { nome: 'Condomínio São José', administradora: 'Administradora São Paulo' },
    unidades: { identificacao: '001', bloco: 'A', responsavel_nome: 'Maria de Souza' },
  }]
  const bytes = await criarExcelRelatorioCobrancas({
    search: '',
    condominioId: '',
    unidadeId: '',
    status: '',
    vencimentoDe: '',
    vencimentoAte: '',
    judicializacaoUnidade: 'nao',
    ordenar: 'vencimento_asc',
  }, rows, new Date('2026-09-11T15:00:00Z'))
  const workbook = await loadWorkbook(bytes)
  const resumo = workbook.getWorksheet('RESUMO')!
  const agrupado = workbook.getWorksheet('AGRUPADO')!
  const detalhado = workbook.getWorksheet('DETALHADO')!
  assert.equal(resumo.getCell('B18').value, 1125.75)
  assert.equal(resumo.getCell('B18').numFmt, '"R$" #,##0.00')
  assert.equal(agrupado.getCell('K6').value, 1125.75)
  assert.equal(agrupado.getCell('K6').numFmt, '"R$" #,##0.00')
  assert.equal(detalhado.getCell('G6').value instanceof Date, true)
  assert.equal(detalhado.getCell('R6').value, 'cob-1')
  assert.equal(detalhado.autoFilter, 'A5:R6')
  writeFileSync(`${outputDir}/cobrancas.xlsx`, bytes)
}

async function validateAcordosCondominio(outputDir: string) {
  const rows = [{
    condominio_cnpj: '00123456000109',
    unidade: '001',
    bloco: 'A',
    responsavel_nome: 'Maria de Souza',
    data_acordo: new Date('2026-09-10T00:00:00'),
    valor_original: 1000,
    despesa_cobranca_percentual: 10,
    despesa_cobranca_valor: 100,
    entrada: 200,
    quantidade_parcelas: 6,
    primeiro_vencimento: new Date('2026-10-10T00:00:00'),
    status: 'ativo',
    documento_url: 'https://example.com/acordo.pdf',
    observacoes: 'Acordo conferido',
  }]
  const parcelas = [
    {
      condominio_cnpj: '00123456000109',
      acordo_id: 'acordo-1',
      unidade: '001',
      bloco: 'A',
      responsavel_nome: 'Maria de Souza',
      data_acordo: new Date('2026-09-10T00:00:00'),
      valor_acordo: 1100,
      quantidade_parcelas: 6,
      parcela_id: 'parcela-1',
      parcela_numero: 1,
      parcela_tipo: 'parcela',
      parcela_vencimento: new Date('2026-10-10T00:00:00'),
      parcela_valor: 150,
      parcela_status: 'pendente',
      parcela_data_pagamento: '',
      documento_url: 'https://example.com/acordo.pdf',
      observacoes: 'Acordo conferido',
    },
    {
      condominio_cnpj: '00123456000109',
      acordo_id: 'acordo-1',
      unidade: '001',
      bloco: 'A',
      responsavel_nome: 'Maria de Souza',
      data_acordo: new Date('2026-09-10T00:00:00'),
      valor_acordo: 1100,
      quantidade_parcelas: 6,
      parcela_id: 'parcela-2',
      parcela_numero: 2,
      parcela_tipo: 'parcela',
      parcela_vencimento: new Date('2026-11-10T00:00:00'),
      parcela_valor: 150,
      parcela_status: 'paga',
      parcela_data_pagamento: new Date('2026-11-09T00:00:00'),
      documento_url: 'https://example.com/acordo.pdf',
      observacoes: 'Acordo conferido',
    },
  ]
  const bytes = await criarExcelExportacaoCondominio(
    'acordos',
    rows,
    new Date('2026-09-11T15:00:00Z'),
    { parcelas },
  )
  const workbook = await loadWorkbook(bytes)
  const instrucoes = workbook.getWorksheet('INSTRUCOES')!
  const dados = workbook.getWorksheet('DADOS')!
  const parcelasSheet = workbook.getWorksheet('PARCELAS')!
  const exemplos = workbook.getWorksheet('EXEMPLOS')!
  assert.equal(instrucoes.getCell('A1').value, 'Exportação de Acordos extrajudiciais')
  assert.equal(dados.getCell('A5').value, 'condominio_cnpj')
  assert.equal(dados.getCell('A6').value, '00123456000109')
  assert.equal(dados.getCell('E6').value instanceof Date, true)
  assert.equal(dados.getCell('F6').value, 1000)
  assert.equal(dados.getCell('F6').numFmt, '"R$" #,##0.00')
  assert.equal(dados.getCell('J6').value, 6)
  assert.equal(dados.autoFilter, 'A5:N6')
  assert.equal(parcelasSheet.getCell('A5').value, 'condominio_cnpj')
  assert.equal(parcelasSheet.getCell('I5').value, 'parcela_id')
  assert.equal(parcelasSheet.getCell('J6').value, 1)
  assert.equal(parcelasSheet.getCell('L6').value instanceof Date, true)
  assert.equal(parcelasSheet.getCell('M6').value, 150)
  assert.equal(parcelasSheet.getCell('M6').numFmt, '"R$" #,##0.00')
  assert.equal(parcelasSheet.getCell('O7').value instanceof Date, true)
  assert.equal(parcelasSheet.autoFilter, 'A5:Q7')
  assert.equal(exemplos.getCell('N5').value, 'observacoes')
  writeFileSync(`${outputDir}/acordos-condominio.xlsx`, bytes)
}

async function validateRelatorioAcordos(outputDir: string) {
  const rows = [{
    id: 'acordo-1',
    carteira_id: 'cart-1',
    condominio_id: 'cond-1',
    unidade_id: 'und-1',
    data_acordo: '2026-09-10',
    valor_acordado: '1100',
    entrada: '200',
    quantidade_parcelas: 6,
    status: 'ativo',
    status_financeiro: 'aberto',
    fluxo_status: 'boletos_enviados',
    numero_processo: '',
    saude_acordo: 'saudavel',
    carteiras: { nome: 'Carteira Paulista' },
    condominios: { nome: 'Condomínio São José' },
    unidades: { identificacao: '001', bloco: 'A', responsavel_nome: 'Maria de Souza' },
  }]
  const parcelas = [
    {
      id: 'parcela-1',
      acordo_id: 'acordo-1',
      numero: 1,
      tipo_parcela: 'entrada',
      valor: '200',
      vencimento: '2026-09-10',
      status: 'paga',
      data_pagamento: '2026-09-10',
    },
    {
      id: 'parcela-2',
      acordo_id: 'acordo-1',
      numero: 2,
      tipo_parcela: 'parcela',
      valor: '150',
      vencimento: '2026-10-10',
      status: 'pendente',
      data_pagamento: null,
    },
  ]
  const bytes = await criarExcelRelatorioAcordos({
    q: '',
    condominio_id: '',
    unidade_id: '',
    carteira_id: '',
    status: '',
    data_de: '',
    data_ate: '',
    ordenar: 'data_desc',
  }, rows, parcelas, new Date('2026-09-11T15:00:00Z'))
  const workbook = await loadWorkbook(bytes)
  const resumo = workbook.getWorksheet('RESUMO')!
  const acordos = workbook.getWorksheet('ACORDOS')!
  const parcelasSheet = workbook.getWorksheet('PARCELAS')!
  assert.equal(resumo.getCell('B17').value, 1100)
  assert.equal(resumo.getCell('B17').numFmt, '"R$" #,##0.00')
  assert.equal(acordos.getCell('A5').value, 'Carteira')
  assert.equal(acordos.getCell('F6').value, 1100)
  assert.equal(acordos.getCell('F6').numFmt, '"R$" #,##0.00')
  assert.equal(parcelasSheet.getCell('I5').value, 'Nº parcela')
  assert.equal(parcelasSheet.getCell('K6').value instanceof Date, true)
  assert.equal(parcelasSheet.getCell('L6').value, 200)
  assert.equal(parcelasSheet.getCell('L6').numFmt, '"R$" #,##0.00')
  assert.equal(parcelasSheet.getCell('N6').value instanceof Date, true)
  assert.equal(parcelasSheet.autoFilter, 'A5:P7')
  writeFileSync(`${outputDir}/relatorio-acordos.xlsx`, bytes)
}

async function main() {
  const outputDir = '.codex-tmp/exportacoes-excel'
  mkdirSync(outputDir, { recursive: true })
  await validateCondominios(outputDir)
  await validateUnidades(outputDir)
  await validateAdministradoras(outputDir)
  await validateCobrancas(outputDir)
  await validateAcordosCondominio(outputDir)
  await validateRelatorioAcordos(outputDir)
  console.log('Exportações Excel validadas: condomínios, unidades, administradoras, cobranças e acordos.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
