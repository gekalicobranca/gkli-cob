import { gunzipSync } from "node:zlib";
import { MAX_REPORT_BYTES, MAX_SERVER_UPLOAD_BYTES } from "../upload-limits";

export function decodeConversionUpload(buffer: Buffer, encoding: string) {
  if (buffer.length > MAX_SERVER_UPLOAD_BYTES) {
    throw new Error("O arquivo enviado excede o limite de 4 MB por envio.");
  }
  if (!encoding) return buffer;
  if (encoding !== "gzip") throw new Error("Compactação de arquivo não suportada.");
  try {
    return gunzipSync(buffer, { maxOutputLength: MAX_REPORT_BYTES });
  } catch {
    throw new Error("Arquivo compactado inválido ou relatório maior que 32 MB.");
  }
}
