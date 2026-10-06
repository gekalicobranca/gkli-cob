import type { PadraoConversaoDetectado, UnidadeConversaoPreview } from "./parse-relatorio-buffer";

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function detectLelloResponsaveis(text: string): PadraoConversaoDetectado | null {
  if (!/portal\.lellocondominios\.com\.br/i.test(text) ||
      !/Dados do condom[íi]nio/i.test(text) || !/Bloco\s*Unidade/i.test(text) ||
      !/Tipo de pessoa:/i.test(text) || !/Enviar para o Dataflex\?/i.test(text)) return null;
  return {
    id: "lello-enderecamento-responsaveis-v1",
    nome: "Lello · Responsáveis",
    tipoConversao: "unidades",
    fornecedor: "Lello Condomínios",
    sistema: "Lello Condomínios",
    relatorio: "Cadastro de unidades - relação de endereçamento",
    condominioDetectado: clean(text.match(/Refer[êe]ncia[^\n]*?Nome\s*([^\n]+)/i)?.[1] ?? "") || null,
    confianca: 98,
    ativo: true,
  };
}

/** Uses positional PDF text so the block and unit columns stay separate. */
export function parseLelloResponsaveis(text: string): UnidadeConversaoPreview[] {
  const normalized = text.replace(/\r/g, "")
    .replace(/^.*https:\/\/portal\.lellocondominios\.com\.br[^\n]*$/gm, "")
    .replace(/^\d{2}\/\d{2}\/\d{4},[^\n]*Gpseg2[^\n]*$/gm, "");
  const starts = [...normalized.matchAll(/^Bloco\s+Unidade\s*\n([^\n]+)/gm)];
  const result: UnidadeConversaoPreview[] = [];
  for (const [index, start] of starts.entries()) {
    const identity = clean(start[1]).match(/^(.*?)\s+(\S+)$/);
    if (!identity) throw new Error("Lello: não foi possível separar bloco e unidade.");
    const block = normalized.slice(start.index, starts[index + 1]?.index ?? normalized.length);
    const people = [...block.matchAll(/^Cond[ôo]mino\s*\n/gm)];
    if (!people.length) throw new Error(`Lello: unidade ${identity[2]} sem responsável legível.`);
    for (const [personIndex, personStart] of people.entries()) {
      const person = block.slice(personStart.index, people[personIndex + 1]?.index ?? block.length);
      const name = clean(person.match(/^Nome\s+([\s\S]*?)\s*Tipo de pessoa:/m)?.[1] ?? "");
      if (!name) throw new Error(`Lello: responsável sem nome na unidade ${identity[2]}.`);
      const document = person.match(/^CPF\s*([\d.\/-]+)\s*RG/m)?.[1] ??
        person.match(/^CNPJ\s*([\d.\/-]+)\s*%/m)?.[1] ?? "";
      const phones = [...person.matchAll(/(?:Telefone(?: A\/C)?|Celular A\/C)[ \t]*([^\n]*?)(?=Celular A\/C|$)/gm)]
        .flatMap((field) => field[1].match(/(?:\+?55\s*)?\(?\d{2}\)?\s*\d{4,5}[\s-]?\d{4}/g) ?? [])
        .map((phone) => phone.replace(/\D/g, ""));
      const emails = [...person.matchAll(/E-mail(?: boleto)?[ \t]+([^\n]*)/g)]
        .flatMap((field) => field[1].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
        .map((email) => email.toLowerCase());
      const address = [...person.matchAll(/^(?:Endere[çc]o|Bairro|Estado|CEP|Aos cuidados de)[ \t]+([^\n]*)/gm)]
        .map((field) => clean(field[0].replace(/\s+Telefone.*$/, "")));
      const participation = person.match(/% de participa[çc][ãa]o\s*([\d.,]+)/)?.[1];
      result.push({
        identificacao: identity[2], bloco: identity[1], tipo: "unidade",
        responsavelNome: name, tipoResponsavel: "proprietario",
        responsavelDocumento: document.replace(/\D/g, ""),
        telefone: [...new Set(phones)].join(" | "), email: [...new Set(emails)].join(" | "),
        status: "ativo",
        observacoes: ["Origem: Lello - Cadastro de unidades / relação de endereçamento", "Papel na origem: Condômino",
          participation ? `Participação: ${participation}%` : "", ...address].filter(Boolean).join("; "),
      });
    }
  }
  if (result.length !== (normalized.match(/Tipo de pessoa:/g) ?? []).length) {
    throw new Error("Lello: quantidade de responsáveis divergente do relatório.");
  }
  return result;
}
