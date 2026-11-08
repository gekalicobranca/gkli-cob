import { dataCivilValida } from "@/lib/core/data-civil";
import { parseMoneyInput } from "@/utils/formatters/parse-money";

export type ParcelaDocumento = {
  numero: number;
  vencimento: string;
  centavos: number;
  pagoCentavos?: number;
};
export type ContextoDocumento = {
  unidade: string;
  bloco?: string | null;
  condominio: string;
  cnpj?: string | null;
  referencia?: string;
};
export type PlanoDocumento = {
  parcelas: ParcelaDocumento[];
  totalCentavos: number;
  referencia: string;
  avisos: string[];
};

const moeda = /-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)/g;
const data = /\b(?:\d{2}\/\d{2}\/(?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/g;
function normalizar(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function unidadeIgual(a: string, b: string) {
  return normalizar(a).replace(/^0+(?=\d)/, "") === normalizar(b).replace(/^0+(?=\d)/, "");
}
function centavos(value: string) {
  const parsed = parseMoneyInput(value, "pt-BR");
  if (parsed.kind !== "value") throw new Error("O PDF contém um valor inválido. Confira o documento.");
  return parsed.cents;
}
function dataISO(value: string) {
  if (!value.includes("/")) {
    if (!dataCivilValida(value)) throw new Error("O PDF contém um vencimento inválido.");
    return value;
  }
  const [dia, mes, ano] = value.split("/");
  const result = `${ano.length === 2 ? "20" + ano : ano}-${mes}-${dia}`;
  if (!dataCivilValida(result)) throw new Error("O PDF contém um vencimento inválido.");
  return result;
}

type Grupo = { unidade: string; bloco: string; referencia: string; cnpj: string; condominio: string; linhas: string[] };

function gruposDoDocumento(texto: string): Grupo[] {
  const grupos = new Map<string, Grupo>();
  let unidade = "", bloco = "", referencia = "", cnpj = "", condominio = "";
  for (const linha of texto.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    const documento = linha.match(/CNPJ\s*:?\s*([\d./-]+)/i);
    if (documento) cnpj = documento[1].replace(/\D/g, "");
    const nome = linha.match(/^Condom[ií]nio\s*:\s*(.+)/i);
    if (nome) condominio = nome[1].split(/CNPJ/i)[0].trim();
    const identificacaoBloco = linha.match(/\bBloco\s*[:#]\s*([^•|]+?)(?=\s*(?:[•|]|\bUnidade\s*[:#]|$))/i);
    if (identificacaoBloco) bloco = identificacaoBloco[1].trim();
    const identificacao = linha.match(/\bUnidade\s*[:#]\s*([A-Z0-9./-]+)/i);
    if (identificacao) {
      unidade = identificacao[1].replace(/-$/, "");
      referencia = "";
    }
    const contrato = linha.match(/\b(?:Processo|Acordo(?:\s+n[úu]mero)?)\s*[:#]\s*([A-Z0-9][A-Z0-9/-]*)/i);
    if (contrato) referencia = contrato[1];
    const key = [cnpj, condominio, unidade, bloco, referencia].join("|");
    const grupo = grupos.get(key) ?? { unidade, bloco, referencia, cnpj, condominio, linhas: [] };
    grupo.linhas.push(linha);
    grupos.set(key, grupo);
  }
  return [...grupos.values()];
}

function lerTabela(grupo: Grupo) {
  const parcelas: ParcelaDocumento[] = [];
  let tabela: "simples" | "boleto" | "lello" | null = null;
  let quantidadeDeclarada: number | undefined;
  let totalDeclarado: number | undefined;
  for (const linha of grupo.linhas) {
    const normal = linha.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (/PARCELA/.test(normal) && /VENC/.test(normal) && /VALOR|TOTAL/.test(normal) && !data.test(linha)) {
      tabela = /NUMERO\s+PARCELA\s+VENCIMENTO\s+LIMITE\s+VALOR\s+JUROS\s+TOTAL\s+PAGO/.test(normal)
        ? "lello" : /BOLETO|RECIBO|NUMERO\s+PARCELA/.test(normal) ? "boleto" : "simples";
      data.lastIndex = 0;
      continue;
    }
    data.lastIndex = 0;
    if (/^TOTAL(?:\s+DO)?\s+(?:PARCELAMENTO|ACORDO)|^TOTAL\s*[:;]/.test(normal)) {
      const valores = linha.match(moeda) ?? [];
      if (valores.length) totalDeclarado = centavos(valores[0]);
      tabela = null;
      continue;
    }
    if (/^(?:RESUMO|OBSERVAC|ASSINATURA|OUTROS LANCAMENTOS|TOTAL DO PROCESSO)/.test(normal)) tabela = null;
    const explicita = /^\s*(?:PARCELA|PRESTACAO|PRESTAÇÃO|ENTRADA)\b/i.test(linha);
    if (!tabela && !explicita) continue;
    const datas = [...linha.matchAll(data)];
    if (!datas.length) continue;
    const primeira = datas[0];
    const prefixo = linha.slice(0, primeira.index);
    const indice = tabela === "lello"
      ? prefixo.match(/^\d+\s+(\d+)\s*\/\s*(\d+)\s*$/)
      : tabela === "boleto" ? prefixo.match(/^\d+\s+(\d+)\s*(?:\/\s*(\d+))?\s*$/)
      : prefixo.match(/^(?:(?:PARCELA|PRESTACAO|PRESTAÇÃO)\s*[:#-]?\s*)?(\d+)\s*(?:\/\s*(\d+))?\s*(?:[-–·;:]|VENC(?:IMENTO)?\s*[:-]?)?\s*$/i);
    const entrada = /^ENTRADA\b/i.test(prefixo);
    if (!indice && !entrada) {
      if (/^\d|^PARCELA|^ENTRADA/.test(normal) ||
          (tabela && !/EMITIDO|PAGINA|GERADO EM|DATA DA EMISSAO/.test(normal))) {
        throw new Error("Uma linha de parcelas não pôde ser lida com segurança. Confira o PDF.");
      }
      continue;
    }
    const restante = linha.slice(primeira.index! + primeira[0].length).replace(data, " ");
    const valores = restante.match(moeda) ?? [];
    if ((tabela === "lello" && valores.length < 5) || (tabela !== "lello" && valores.length !== 1)) {
      throw new Error("A tabela tem colunas de valores ambíguas. Use o demonstrativo individual de parcelas.");
    }
    const numero = entrada ? 0 : Number(indice![1]);
    const quantidade = indice?.[2] ? Number(indice[2]) : undefined;
    if (quantidade) {
      if (quantidadeDeclarada && quantidadeDeclarada !== quantidade) throw new Error("O PDF mistura mais de um parcelamento.");
      quantidadeDeclarada = quantidade;
    }
    const valor = centavos(valores[tabela === "lello" ? 3 : 0]);
    if (!Number.isSafeInteger(numero) || numero < 0 || numero > 360 || valor <= 0) throw new Error("O PDF contém uma parcela inválida.");
    parcelas.push({ numero, vencimento: dataISO(primeira[0]), centavos: valor,
      ...(tabela === "lello" ? { pagoCentavos: centavos(valores[4]) } : {}) });
  }
  if (!parcelas.length) return null;
  if (new Set(parcelas.map(parcela => parcela.numero)).size !== parcelas.length) throw new Error("O documento repete números de parcelas. Confira o acordo selecionado.");
  const ordenadas = parcelas.sort((a, b) => a.numero - b.numero);
  const regulares = ordenadas.filter(parcela => parcela.numero > 0);
  if (regulares.some((parcela, index) => parcela.numero !== index + 1) ||
      (quantidadeDeclarada !== undefined && regulares.length !== quantidadeDeclarada)) {
    throw new Error("O PDF apresenta um parcelamento incompleto. Anexe o documento com todas as parcelas.");
  }
  const totalCentavos = ordenadas.reduce((sum, parcela) => sum + parcela.centavos, 0);
  if (totalDeclarado !== undefined && totalDeclarado !== totalCentavos) throw new Error("A soma das parcelas difere do total do PDF. Confira se o documento está completo.");
  return { parcelas: ordenadas, totalCentavos };
}

export function extrairPlanoDocumento(texto: string, contexto: ContextoDocumento): PlanoDocumento {
  if (texto.trim().length < 20) throw new Error("O PDF não tem texto legível. Anexe a versão pesquisável do documento.");
  const grupos = gruposDoDocumento(texto);
  const unidadesIdentificadas = grupos.some(grupo => grupo.unidade);
  const cnpj = contexto.cnpj?.replace(/\D/g, "");
  const candidatos = grupos.filter(grupo =>
    (!unidadesIdentificadas || unidadeIgual(grupo.unidade, contexto.unidade)) &&
    (!grupo.bloco || !contexto.bloco || unidadeIgual(grupo.bloco, contexto.bloco)) &&
    (!cnpj || !grupo.cnpj || grupo.cnpj === cnpj) &&
    (!contexto.referencia || !grupo.referencia || normalizar(grupo.referencia) === normalizar(contexto.referencia)));
  if (unidadesIdentificadas && !candidatos.length) throw new Error("O PDF não corresponde ao condomínio e à unidade selecionados.");
  const planos = candidatos.map(grupo => ({ grupo, plano: lerTabela(grupo) })).filter(item => item.plano);
  if (planos.length > 1) throw new Error("Há mais de um acordo para esta unidade no PDF. Informe a referência do acordo e leia novamente.");
  if (!planos.length) throw new Error("Não encontrei uma tabela completa de parcelas. Anexe o demonstrativo individual do acordo.");
  const { grupo, plano } = planos[0];
  const nomeCondominio = grupo.condominio;
  const nome = (value: string) => normalizar(value).replace(/^CONDOMINIO/, "");
  if (nomeCondominio && !nome(contexto.condominio).includes(nome(nomeCondominio)) &&
      !nome(nomeCondominio).includes(nome(contexto.condominio))) {
    throw new Error("O condomínio identificado no PDF difere do selecionado.");
  }
  return { ...plano!, referencia: grupo.referencia, avisos: [
    ...(!grupo.unidade ? ["O PDF não identifica a unidade. Confira a identificação no documento antes de efetivar."] : []),
    ...(plano!.parcelas.some(parcela => (parcela.pagoCentavos ?? 0) > 0) ? ["O PDF informa pagamentos. A efetivação preserva os pagamentos já registrados no app."] : []),
  ] };
}
