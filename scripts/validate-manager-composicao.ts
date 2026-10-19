import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { parseRelatorioBuffer } from '../features/conversao-relatorio/server/parse-relatorio-buffer'
import { observacoesComComposicao, tipoCobrancaDoHistorico } from '../features/importacoes/composicao-origem'

test('Manager preserva componentes de recibos mistos, valores e separa multa de atraso', async () => {
  const rows = [
    ['Manager / Atentum', 'Cotas Pendentes'], ['Condomínio: 123 - CONDOMÍNIO TESTE'],
    ['Bloco: A Unidade: 101 Pessoa Teste'],
    ['Recibo','Vencimento','Emissão','Conta','Histórico','Moeda','Valor Original','Valor Principal','Multa','Correção','Juros','Total'],
    ['100','01/09/2026','','8956','CESSÃO DE ESPAÇO','R$','100,00','100,00','2,00','0,00','0,00','102,00'],
    ['','','','1001','TX CONDOMÍNIO SETEMBRO/2026','R$','50,00','50,00','1,00','0,00','0,00','51,00'],
    ['Total do Recibo:','','','','','R$','150,00','150,00','3,00','0,00','0,00','153,00'],
    ['101','02/09/2026','','2000','MULTA POR INFRAÇÃO','R$','30,00','30,00','0,60','0,00','0,00','30,60'],
    ['Total do Recibo:','','','','','R$','30,00','30,00','0,60','0,00','0,00','30,60'],
    ['Total Geral da Unidade:','','','','','R$','180,00','180,00','3,60','0,00','0,00','183,60'],
  ]
  const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'Dados')
  const result = await parseRelatorioBuffer({buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'}),filename:'manager.xlsx',somenteAnoCorrente:false})
  assert.ok(result.ok); if(!result.ok)return
  const [misto,multa] = result.preview.cobrancas
  assert.equal(result.preview.cobrancas.length,2,JSON.stringify(result.preview.cobrancas))
  assert.equal(misto.valorTotal,153); assert.equal(misto.multa,3)
  assert.deepEqual(misto.tiposCobranca,['cessao_espaco','cota_condominial'])
  assert.equal(misto.composicaoOrigem?.[0].valorPrincipal,100)
  assert.equal(misto.composicaoOrigem?.[1].valorTotal,51)
  assert.deepEqual(multa.tiposCobranca,['multa'])
  assert.equal(multa.composicaoOrigem?.length,1)
  const obs = observacoesComComposicao('Nota humana preservada',misto)
  assert.match(obs,/Nota humana preservada/); assert.match(obs,/Cessão\/locação de espaço/)
  assert.equal(observacoesComComposicao(obs,misto),obs)
  assert.match(result.preview.csv,/CESSÃO DE ESPAÇO/)
})

test('classificação usa histórico e não presume cota em descrições desconhecidas', () => {
  assert.equal(tipoCobrancaDoHistorico('LOCAÇÃO DE ESPAÇO JAN/26'),'cessao_espaco')
  assert.equal(tipoCobrancaDoHistorico('CONSUMO DE ÁGUA'),'consumo')
  assert.equal(tipoCobrancaDoHistorico('CARTÃO DE ACESSO'),'outros')
  assert.equal(tipoCobrancaDoHistorico('COTAS CONDOMINIAIS'),'cota_condominial')
})
