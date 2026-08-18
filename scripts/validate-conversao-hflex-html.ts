import assert from "node:assert/strict";
import { parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";

async function main() {
  const html = `
    <html><body><table>
      <tr><th>RIO NEGRO</th><th>000113</th><th>JOSE RUBENS CORDEIRO LEITE JUNIOR</th></tr>
      <tr><th>RECIBO</th><th>COBRANÇA</th><th>ADVOGADO</th><th>ACORDO</th><th>VENCIMENTO</th><th>VALOR</th><th>MULTA</th><th>JUROS</th><th>CORREÇÃO</th><th>CORRIGIDO</th></tr>
      <tr><td>3218496</td><td></td><td></td><td>193334</td><td>05/04/2026</td><td>311,62</td><td>6,23</td><td>21,01</td><td>11,34</td><td>350,20</td></tr>
      <tr><td>CONDOMÍNIO ABRIL/2026</td><td>311,62</td><td>6,23</td><td>16,71</td><td>11,34</td><td>345,90</td></tr>
      <tr><th>RIO NEGRO</th><th>000117</th><th>MARIA DA SILVA</th></tr>
      <tr><th>RECIBO</th><th>COBRANÇA</th><th>ADVOGADO</th><th>ACORDO</th><th>VENCIMENTO</th><th>VALOR</th><th>MULTA</th><th>JUROS</th><th>CORREÇÃO</th><th>CORRIGIDO</th></tr>
      <tr><td>3312686</td><td></td><td></td><td></td><td>05/08/2026</td><td>983,58</td><td>19,67</td><td>4,01</td><td>0,00</td><td>1.007,26</td></tr>
    </table></body></html>`;

  const result = await parseRelatorioBuffer({
    buffer: Buffer.from(html, "latin1"),
    filename: "Cond. Rio Negro 08-26.xls",
    mimeType: "application/vnd.ms-excel",
    tipoConversao: "cobrancas",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.preview.padraoDetectado?.id,
    "hflex-livefacilities-devedores-cobrancas-v1",
  );
  assert.equal(result.preview.padraoDetectado?.condominioDetectado, "RIO NEGRO");
  assert.equal(result.preview.totalParcelas, 2);
  assert.equal(result.preview.valorTotal, 1357.46);
  assert.deepEqual(
    result.preview.cobrancas.map((item) => ({
      unidade: item.unidade,
      recibo: item.recibo,
      vencimento: item.vencimento,
      valorTotal: item.valorTotal,
      situacaoOrigem: item.situacaoOrigem,
    })),
    [
      {
        unidade: "000113",
        recibo: "3218496",
        vencimento: "05/04/2026",
        valorTotal: 350.2,
        situacaoOrigem: "acordo",
      },
      {
        unidade: "000117",
        recibo: "3312686",
        vencimento: "05/08/2026",
        valorTotal: 1007.26,
        situacaoOrigem: "normal",
      },
    ],
  );

  const utf16Html = `
    <tr><th colspan="13">RIO NEGRO</th></tr>
    <tr><th>000113</th><th colspan="12">PROPRIETÁRIO: JOSE RUBENS CORDEIRO LEITE JUNIOR (, contato@example.com)</th></tr>
    <tr><th>Recibo</th><th>Cobrança</th><th>Advogado</th><th>Acordo</th><th>Vencimento</th><th>Histórico</th><th>Vl. Verba</th><th>Multa Verba</th><th>Juros Verba</th><th>Correção Verba</th><th>Vl. Corrigido Verba</th><th>Vl. Recibo</th><th>Vl. Corrigido Recibo</th></tr>
    <tr><td>3218496</td><td></td><td></td><td>193334</td><td>05/04/2026</td><td>ENERGIA ELÉTRICA</td><td>0,00</td><td>-1,34</td><td>-2,53</td><td>-2,45</td><td>-6,32</td><td>311,62</td><td>249,26</td></tr>
    <tr><td>3238700</td><td>ADV</td><td></td><td></td><td>05/05/2026</td><td>CONDOMÍNIO MAIO/2026</td><td>991,56</td><td>0,00</td><td>0,00</td><td>0,00</td><td>991,56</td><td>991,56</td><td>991,56</td></tr>
  `;
  const utf16Result = await parseRelatorioBuffer({
    buffer: Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(utf16Html, "utf16le"),
    ]),
    filename: "RelatorioDevedores.xls",
    mimeType: "application/vnd.ms-excel",
    tipoConversao: "cobrancas",
  });

  assert.equal(utf16Result.ok, true);
  if (!utf16Result.ok) return;
  assert.equal(utf16Result.preview.padraoDetectado?.condominioDetectado, "RIO NEGRO");
  assert.equal(utf16Result.preview.totalParcelas, 2);
  assert.equal(utf16Result.preview.valorTotal, 1240.82);
  assert.equal(utf16Result.preview.cobrancas[0]?.valorPrincipal, 311.62);
  assert.equal(
    utf16Result.preview.cobrancas[0]?.responsavel,
    "JOSE RUBENS CORDEIRO LEITE JUNIOR",
  );
  assert.equal(utf16Result.preview.cobrancas[1]?.unidade, "000113");

  console.log("Conversão Hflex HTML/XLS validada com sucesso.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
