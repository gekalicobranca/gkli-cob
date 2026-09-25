import type { PadraoConversaoDetectado, UnidadeConversaoPreview } from "./parse-relatorio-buffer";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const loose = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function detectBrcondosResponsaveis(text: string): PadraoConversaoDetectado | null {
  const normalized = loose(text);
  // The BRCondos logo is an image: recognize the report's field structure.
  if (!/^\s*(?:lista de )?moradores\s*$/m.test(normalized) ||
      !/^\s*unidade\s*$/m.test(normalized) ||
      !/^\s*numero\s*:/m.test(normalized) ||
      !/^\s*(?:proprietario|morador\s*\/\s*locatario)\s*:/m.test(normalized) ||
      !/endereco\s*:/.test(normalized) || !/complemento\s*:/.test(normalized) ||
      !/celular\s*:/.test(normalized) || !/e-mail\s*:/.test(normalized)) return null;

  const header = text.split(/^\s*(?:Lista de )?moradores\s*$/im)[0];
  const lines = header.split(/\r?\n/).map(normalize).filter(Boolean);
  const cnpjIndex = lines.findIndex((line) => /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(line));
  return {
    id: "brcondos-lista-moradores-responsaveis-v1",
    nome: "BRCondos · Responsáveis",
    tipoConversao: "unidades",
    fornecedor: "BRCondos",
    sistema: "BRCondos",
    relatorio: "Lista de Moradores",
    condominioDetectado: cnpjIndex > 0 ? lines[cnpjIndex - 1] : null,
    confianca: 98,
    ativo: true,
  };
}

export function parseBrcondosResponsaveis(text: string): UnidadeConversaoPreview[] {
  const starts = [...text.matchAll(/^\s*N[úu]mero\s*:\s*([^\r\n]+)/gim)];
  return starts.map((start, index) => {
    // Keep page breaks inside a record: contacts can continue on the next page.
    const block = text.slice(start.index, starts[index + 1]?.index ?? text.length);
    const person = block.match(/^\s*(Propriet[áa]rio|Morador\s*\/\s*Locat[áa]rio)\s*:[ \t]*([^\r\n]*)/im);
    const phones = [...block.matchAll(/(?:Telefone|Celular)\s*:[ \t]*([^\r\n]*?)(?=Celular\s*:|E-Mail\s*:|\r?$)/gim)]
      .flatMap((field) => field[1].match(/(?:\+?55\s*)?\(?\d{2}\)?\s*\d{4,5}[\s-]?\d{4}/g) ?? [])
      .map((phone) => phone.replace(/\D/g, ""))
      .filter((phone) => !/^0+$/.test(phone));
    const emails = [...block.matchAll(/E-Mail\s*:[ \t]*([^\r\n]*)/gi)]
      .flatMap((field) => field[1].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
      .map((email) => email.toLowerCase());
    const role = person?.[1] ?? "";
    return {
      identificacao: normalize(start[1]),
      bloco: "",
      tipo: "unidade",
      responsavelNome: normalize(person?.[2] ?? ""),
      tipoResponsavel: loose(role).startsWith("proprietario") ? "proprietario" : role ? "inquilino" : "nao_informado",
      responsavelDocumento: "",
      telefone: [...new Set(phones)].join(" | "),
      email: [...new Set(emails)].join(" | "),
      status: "ativo",
      observacoes: `Origem: BRCondos - Lista de Moradores; Papel na origem: ${role || "não informado"}; CPF/CNPJ do responsável não informado no relatório.`,
    };
  });
}
