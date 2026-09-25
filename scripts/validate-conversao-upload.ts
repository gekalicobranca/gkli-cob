import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { createConversionFormData } from "../features/conversao-relatorio/prepare-upload";
import { decodeConversionUpload } from "../features/conversao-relatorio/server/decode-upload";
import { MAX_REPORT_BYTES, MAX_SERVER_UPLOAD_BYTES } from "../features/conversao-relatorio/upload-limits";
import { parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";

async function main() {
  const small = new File(["relatório"], "pequeno.csv", { type: "text/csv" });
  const plain = await createConversionFormData(small, "cobrancas");
  assert.equal(plain.get("file_encoding"), null);
  assert.equal(await (plain.get("file") as File).text(), "relatório");

  const bytes = Buffer.alloc(6 * 1024 * 1024, "dados;");
  const file = new File([bytes], "grande.xls", { type: "application/vnd.ms-excel" });
  const form = await createConversionFormData(file, "cobrancas", "12345678000199");
  const uploaded = form.get("file") as File;
  assert.equal(form.get("file_encoding"), "gzip");
  assert.equal(form.get("original_mime_type"), file.type);
  assert.equal(uploaded.name, file.name);
  assert.equal(form.get("condominio_cnpj"), "12345678000199");
  assert(uploaded.size < MAX_SERVER_UPLOAD_BYTES);
  assert.deepEqual(decodeConversionUpload(Buffer.from(await uploaded.arrayBuffer()), "gzip"), bytes);
  const reprocessed = await createConversionFormData(file, "unidades", "98765432000199");
  assert.equal(reprocessed.get("condominio_cnpj"), "98765432000199");
  assert.equal(reprocessed.get("tipo_conversao"), "unidades");
  assert.deepEqual(Buffer.from(await (reprocessed.get("file") as File).arrayBuffer()), Buffer.from(await uploaded.arrayBuffer()));
  assert.throws(() => decodeConversionUpload(Buffer.from("invalid"), "gzip"));
  assert.throws(() => decodeConversionUpload(bytes, ""));
  assert.throws(() => decodeConversionUpload(Buffer.from("test"), "zip"));
  assert.throws(() => decodeConversionUpload(gzipSync(Buffer.alloc(MAX_REPORT_BYTES + 1)), "gzip"));
  await assert.rejects(createConversionFormData(new File([Buffer.alloc(MAX_REPORT_BYTES + 1)], "large.xls"), "cobrancas"));
  await assert.rejects(createConversionFormData(new File([randomBytes(MAX_SERVER_UPLOAD_BYTES + 1024)], "incompressivel.pdf"), "cobrancas"), /Mesmo após compactação/);

  if (process.argv[2]) {
    const original = await readFile(process.argv[2]);
    const realFile = new File([original], "relatorio.xls", { type: "application/vnd.ms-excel" });
    const realForm = await createConversionFormData(realFile, "cobrancas");
    const payload = realForm.get("file") as File;
    const restored = decodeConversionUpload(Buffer.from(await payload.arrayBuffer()), String(realForm.get("file_encoding") ?? ""));
    assert.deepEqual(restored, original);
    const input = { filename: realFile.name, mimeType: realFile.type, tipoConversao: "cobrancas" as const };
    const expected = await parseRelatorioBuffer({ ...input, buffer: original });
    const actual = await parseRelatorioBuffer({ ...input, buffer: restored });
    assert.equal(actual.ok, true);
    if (actual.ok && expected.ok) {
      assert.deepEqual(actual.preview.cobrancas, expected.preview.cobrancas);
      assert.equal(actual.preview.csv, expected.preview.csv);
      console.log(JSON.stringify({ originalBytes: original.length, uploadBytes: payload.size, responseBytes: Buffer.byteLength(JSON.stringify(actual)), cobrancas: actual.preview.cobrancas.length, padrao: actual.preview.padraoDetectado?.nome }));
    }
  }
  console.log("Upload compactado validado.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
