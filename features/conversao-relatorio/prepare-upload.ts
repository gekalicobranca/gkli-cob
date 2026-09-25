import { MAX_REPORT_BYTES, MAX_SERVER_UPLOAD_BYTES } from "./upload-limits";

const preparedFiles = new WeakMap<File, Promise<Blob>>();

async function prepareFile(file: File): Promise<Blob> {
  if (file.size > MAX_REPORT_BYTES) {
    throw new Error("O relatório excede o limite de 32 MB por arquivo.");
  }
  if (file.size <= MAX_SERVER_UPLOAD_BYTES) return file;

  const { gzip } = await import("fflate");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const compressed = await new Promise<Uint8Array>((resolve, reject) => {
    gzip(bytes, { level: 6 }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  if (compressed.byteLength > MAX_SERVER_UPLOAD_BYTES) {
    throw new Error(
      "Mesmo após compactação automática, o arquivo excede o limite de envio de 4 MB. Exporte um relatório com menos unidades ou um período menor.",
    );
  }
  return new Blob([new Uint8Array(compressed)], { type: "application/gzip" });
}

export async function createConversionFormData(
  file: File,
  tipoConversao: string,
  condominioCnpj = "",
) {
  let prepared = preparedFiles.get(file);
  if (!prepared) {
    prepared = prepareFile(file);
    preparedFiles.set(file, prepared);
    prepared.catch(() => preparedFiles.delete(file));
  }
  const upload = await prepared;
  const formData = new FormData();
  formData.append("file", upload, file.name);
  formData.append("tipo_conversao", tipoConversao);
  formData.append("condominio_cnpj", condominioCnpj);
  if (upload !== file) {
    formData.append("file_encoding", "gzip");
    formData.append("original_mime_type", file.type);
  }
  return formData;
}
