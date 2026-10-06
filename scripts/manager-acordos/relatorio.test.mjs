import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { agruparCondominios, centavos, htmlRelatorio, interpretarTabela } from './relatorio.mjs'

const row = (values) => values.map((texto) => ({ texto, colspan: 1 }))
const header = row(['Bloco', 'Unidade', 'Processo', 'Período', 'Valor Principal', 'Parcela', 'Vencimento', 'Valor da parcela', 'Data recebimento', 'Valor recebido', 'Saldo', '% Quitado'])
const total = (texto, valor, recebido, saldo) => [{ texto, colspan: 7 }, ...row([valor, '', recebido, saldo, ''])]
const linhas = [header,
  row(['0', '000711', '15267668', '05/12/2025 a 05/12/2025', '1.853,92', '1/4', '30/12/2025', '1.000,00', '29/12/2025', '1.000,00', '', '']),
  [{ texto: '', colspan: 5 }, ...row(['2/4', '05/01/2026', '284,64', '16/01/2026', '284,64', '', ''])],
  [{ texto: '', colspan: 5 }, ...row(['3/4', '05/02/2026', '284,64', '26/01/2026', '284,64', '', ''])],
  [{ texto: '', colspan: 5 }, ...row(['4/4', '05/03/2026', '284,64', '', '0,00', '', ''])],
  total('(=) Total', '1.853,92', '1.569,28', '284,64'),
  total('(=) Total Geral', '1.853,92', '1.569,28', '284,64'),
]

test('agrupa parcelas de continuação e mantém recebido e saldo separados', () => {
  const result = interpretarTabela(linhas)
  assert.equal(result.quantidade_acordos, 1)
  assert.equal(result.quantidade_parcelas, 4)
  assert.equal(result.acordos[0].unidade, '000711')
  assert.equal(result.acordos[0].parcelas[3].data_recebimento, null)
  assert.deepEqual(result.total, { valor_centavos: 185392, recebido_centavos: 156928, saldo_centavos: 28464 })
})

test('recusa totais divergentes e relatórios incompletos', () => {
  assert.throws(() => interpretarTabela([...linhas.slice(0, -1), total('(=) Total Geral', '1.853,92', '1.569,28', '300,00')]), /diverge/)
  assert.throws(() => interpretarTabela(linhas.slice(0, -1)), /sem total geral/)
  assert.throws(() => interpretarTabela(linhas.slice(0, -2)), /sem subtotal/)
  assert.throws(() => interpretarTabela([header, row(['erro'])]), /Linha inesperada/)
  assert.throws(() => interpretarTabela([row(['Login'])]), /Cabeçalho/)
})

test('reconhece entrada seguida de parcelas numeradas com zeros', () => {
  const entrada = row(['Q03', 'Q3L008', '15837996', '15/12/2025 a 15/07/2026', '3.126,92', 'ENTRADA', '31/07/2026', '1.780,00', '31/07/2026', '1.780,00', '', ''])
  const parcela = [{ texto: '', colspan: 5 }, ...row(['01/01', '25/08/2026', '457,76', '', '0,00', '', ''])]
  const result = interpretarTabela([header, entrada, parcela, total('(=) Total', '2.237,76', '1.780,00', '457,76'), total('(=) Total Geral', '2.237,76', '1.780,00', '457,76')])
  assert.equal(result.acordos[0].parcelas[0].parcela, 'ENTRADA')
  assert.equal(result.acordos[0].parcelas[1].parcela, '01/01')
})

test('preserva rótulos judiciais e faixas de parcelas sem inventar uma numeração', () => {
  const judicial = row(['0', '000022', '14045454', '05/10/2017 a 20/11/2024', '31.057,92', 'BLOQ/JUDICIAL', '13/12/2024', '59.540,76', '', '0,00', '', ''])
  const faixa = [{ texto: '', colspan: 5 }, ...row(['26 A 41/120', '13/04/2022', '3.150,42', '14/04/2022', '3.150,42', '', ''])]
  const result = interpretarTabela([header, judicial, faixa, total('(=) Total', '62.691,18', '3.150,42', '59.540,76'), total('(=) Total Geral', '62.691,18', '3.150,42', '59.540,76')])
  assert.equal(result.acordos[0].parcelas[0].parcela, 'BLOQ/JUDICIAL')
  assert.equal(result.acordos[0].parcelas[1].parcela, '26 A 41/120')
})

test('representa relatório vazio reconhecido e moeda em centavos', () => {
  assert.equal(interpretarTabela([header], { vazioConfirmado: true }).quantidade_acordos, 0)
  assert.throws(() => interpretarTabela([header]), /sem total geral/)
  assert.equal(centavos('21.660,60'), 2166060)
  assert.equal(centavos(''), null)
  assert.throws(() => centavos('21,660.60'), /inválido/)
})

test('deduplica código compartilhado, preserva zeros e impede inativos', () => {
  const config = [
    { id: 'a', nome: 'Comercial', codigo_cliente: '00652', status: 'ativo' },
    { id: 'b', nome: 'Residencial', codigo_cliente: '652', status: 'ativo' },
  ]
  const groups = agruparCondominios(config, '652')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].codigo_cliente, '00652')
  assert.equal(groups[0].condominios.length, 2)
  assert.throws(() => agruparCondominios([{ ...config[0], status: 'inativo' }]), /inativo/)
  assert.throws(() => agruparCondominios(config, '99'), /não consta/)
})

test('PDF escapa conteúdo e mantém cabeçalho repetível', () => {
  const html = htmlRelatorio({ codigo_cliente: '00656', condominios: [{ nome: '<script>teste</script>' }] }, linhas, interpretarTabela(linhas), '2026-10-06')
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('<thead>'))
  assert.ok(!html.includes('<script>'))
})

test('agente não depende da captação, do banco ou do Maestro', async () => {
  const worker = await readFile(new URL('./worker.mjs', import.meta.url), 'utf8')
  const imports = [...worker.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map((m) => m[1])
  assert.ok(imports.every((i) => i.startsWith('node:') || i === 'playwright' || i === './relatorio.mjs'))
  assert.ok(!/\.from\(|\.rpc\(|\.storage\.|agente_execucoes|concluirExecucaoMaestro|captacaoGlobalAtiva/.test(worker))
  const config = JSON.parse(await readFile(new URL('./condominios.json', import.meta.url), 'utf8'))
  assert.equal(config.condominios.length, 32)
  assert.equal(agruparCondominios(config.condominios).length, 31)
  assert.ok(!config.condominios.some((c) => /COMODIT|VISO MOEMA/i.test(c.nome)))
})
