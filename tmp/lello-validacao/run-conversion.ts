import fs from 'node:fs';
import { parseRelatorioBuffer } from '../../features/conversao-relatorio/server/parse-relatorio-buffer';

async function main() {
const filename = 'C:/Users/Gekali/Downloads/CotasInadimplentes_182.xlsx';
const result = await parseRelatorioBuffer({
  buffer: fs.readFileSync(filename),
  filename: 'CotasInadimplentes_182.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  tipoConversao: 'cobrancas',
});

if (!result.ok) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(JSON.stringify({
    ok: true,
    origem: result.preview.origem,
    padraoDetectado: result.preview.padraoDetectado,
    totalParcelas: result.preview.totalParcelas,
    valorTotal: result.preview.valorTotal,
    inconsistencias: result.preview.inconsistencias,
    primeirasCobrancas: result.preview.cobrancas.slice(0, 10),
  }, null, 2));
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
