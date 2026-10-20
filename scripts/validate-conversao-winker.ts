import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseRelatorioBuffer } from '../features/conversao-relatorio/server/parse-relatorio-buffer';

async function main() {
  const rows = [
    ['', 'Inadimplência Posição em: 20/10/2026'],
    ['Condomínio: TESTE RESIDENCIAL'],
    ['Recibo', 'Vencimento', 'Emissão', 'Conta', 'Histórico', '', 'Valor Original', 'Valor Principal', 'Multa', 'Atualização Monetária', 'Juros', 'Total'],
    ['Bloco 2 - Unidade 0102 : RESPONSAVEL'],
    ['2563303 J', '10/08/2026', '42731', '7', 'Condomínio Agosto/2026', '', 1300, 1300, 26, 10, 30, 1366],
    ['', '', '', '49', 'F. Reserva Agosto/2026', '', 64.14, 64.14, 1.28, 1.42, 3.16, 70],
    ['', '', '', '', 'Total do recibo:', '', 1364.14, 1364.14, 27.28, 11.42, 33.16, '.'],
    ['2672240', '10/10/2026', '43816', '7', 'Condomínio Outubro/2026', '', 100, 100, 2, '.', '.', 102],
    ['', '', '', '', 'Total do recibo:', '', 100, 100, 2, '.', '.', 102],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet');
  const result = await parseRelatorioBuffer({ buffer: XLSX.write(workbook, {type:'buffer',bookType:'xlsx'}), filename:'winker.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',tipoConversao:'cobrancas' });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Falha na conversão');
  const items = result.preview.cobrancas;
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].valorPrincipal, items[0].multa, items[0].correcao, items[0].juros, items[0].valorTotal], [1364.14,27.28,11.42,33.16,1436]);
  assert.equal(items[0].composicaoOrigem?.[0].valorPrincipal,1300);
  assert.deepEqual([items[1].valorPrincipal,items[1].correcao,items[1].juros,items[1].valorTotal],[100,0,0,102]);
  console.log('Winker: total ausente, valores inteiros e encargos zerados conferidos.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
