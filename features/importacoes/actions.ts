"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireRole } from "@/utils/auth/require-role";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { getPermittedCarteiras, type CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import {
  estimatePriority,
  getFirst,
  normalizeCnpj,
  normalizeDate,
  normalizeKey,
  onlyDigits,
  parseMoney,
} from "./preview-rules";
import { parseXlsx, type ParsedImportFile } from "./engine/xlsx-parser";
import { isLegacyImportType, isValidImportType } from "./engine/types";
import { avaliarReguaImportacao } from "./regua-importacao";
import {
  conciliarCobrancaImportada,
  encontrarCobrancasAbertasAusentes,
  registrarPendenciasCobrancasAusentes,
  type CobrancaImportadaConciliacao,
} from "./cobrancas-conciliacao";
import { formatOrigemImportacao } from "./origem-importacao";
import { observacoesComRecibo } from "./identidade-recibo";
import { statusOperacionalParaCobrancaImportada } from "./status-cobranca-importada";
import {
  avaliarBloqueioGarantidora,
  observacaoComBloqueioGarantidora,
  statusComBloqueioGarantidora,
} from "./bloqueio-garantidora";
import {
  avaliarRecorteAnoCorrente,
  limparCobrancasDaNovaImportacao,
} from "./recorte-cobrancas";
import { sincronizarResponsavelComUnidadeOperacional } from "@/features/responsaveis-unidades/sync-unidade";
import { normalizeCondominioName } from "@/features/condominios/normalize-name";
import { assertUnidadeMatchesMasks } from "@/features/unidades/mask";
import { ACORDO_STATUS, PARCELA_ACORDO_STATUS } from "@/lib/constants/acordos";
import { COBRANCA_STATUS_OPERACIONAL } from "@/lib/constants/cobrancas";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CondominioImportacaoRow = {
  id: string;
  carteira_id: string;
  nome: string;
  cnpj: string | null;
  inicio_cobranca_dias?: number | null;
  dias_expiracao_regua_pre_juridico?: number | null;
  bloqueio_garantidora_habilitado?: boolean | null;
  bloqueio_garantidora_inicio?: string | null;
  bloqueio_garantidora_fim?: string | null;
};

type UnidadeImportacaoRow = {
  id: string;
  condominio_id: string;
  carteira_id: string;
  identificacao: string;
  bloco: string | null;
  responsavel_nome?: string | null;
  responsavel_documento?: string | null;
  telefone?: string | null;
  email?: string | null;
};

type ResponsavelUnidadeApoioRow = {
  id: string;
  condominio_id: string;
  carteira_id: string;
  unidade: string;
  bloco: string | null;
  responsavel_nome?: string | null;
  tipo_responsavel?: string | null;
  responsavel_documento?: string | null;
  telefone?: string | null;
  email?: string | null;
};

type PreviewItem = {
  linha: number;
  payload: Record<string, any>;
  valido: boolean;
  erros: string[];
  alertas?: string[];
};

type ImportacaoResultado = {
  sucesso: boolean;
  tipo: string;
  mensagem: string;
  importados: number;
  criados?: number;
  ignorados: number;
  erros: string[];
  destino?: string;
};

type ImportExecutionResult = {
  importados: number;
  criados: number;
  atualizados: number;
  divergentes: number;
  ausentes: number;
  ignorados: number;
  erros: string[];
};

async function limparCobrancasNovasAnteriores(
  supabase: SupabaseClient,
  payloads: Record<string, any>[],
) {
  const condominioIds = Array.from(
    new Set(
      payloads
        .map((payload) => String(payload.condominio_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (condominioIds.length === 0) {
    throw new Error(
      "Não foi possível identificar os condomínios para limpar as cobranças anteriores.",
    );
  }

  const carteiraIds = Array.from(
    new Set(
      payloads
        .map((payload) => String(payload.carteira_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  return limparCobrancasDaNovaImportacao(supabase as any, {
    condominioIds,
    carteiraId: carteiraIds.length === 1 ? carteiraIds[0] : null,
  });
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error("Carteira obrigatória.");
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error("Você não tem permissão para operar esta carteira.");
  }
}

function assertPayloadsPermitidos(scope: CarteiraScope, payloads: Record<string, any>[]) {
  const carteiraIds = Array.from(
    new Set(
      payloads
        .map((payload) => String(payload.carteira_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  carteiraIds.forEach((carteiraId) => assertCarteiraPermitida(scope, carteiraId));
}

function emptyImportExecutionResult(): ImportExecutionResult {
  return { importados: 0, criados: 0, atualizados: 0, divergentes: 0, ausentes: 0, ignorados: 0, erros: [] };
}

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

const CONDOMINIO_NOME_KEYS = [
  "nome",
  "condominio",
  "cliente",
  "cliente_razao_social",
  "razao_social",
  "cliente_nome",
];
const CONDOMINIO_CNPJ_KEYS = [
  "cnpj",
  "condominio_cnpj",
  "cnpj_condominio",
  "cliente_cnpj_cpf",
  "cliente_cnpj",
  "cpf_cnpj",
  "documento",
];
const VENCIMENTO_COTA_KEYS = [
  "vencimento_cota_dia",
  "dia_de_vencimento_da_cota",
  "dia_vencimento_cota",
  "vencimento",
  "dia_vencimento",
];
const INICIO_COBRANCA_KEYS = [
  "inicio_cobranca_dias",
  "regua_dias",
  "regua",
  "dias_regua",
  "inicio_cobranca",
];
const DIAS_EXPIRACAO_PRE_JURIDICO_KEYS = [
  "dias_expiracao_regua_pre_juridico",
  "dias_pre_juridico_apos_regua",
  "expiracao_pre_juridico_dias",
  "dias_expiracao_pre_juridico",
];
const VALOR_COTA_KEYS = [
  "valor_cota_condominial",
  "valor_da_cota",
  "valor_cota",
  "cota",
  "cota_condominial",
];
const NOME_OPERACIONAL_KEYS = ["nome_operacional", "nome_fantasia", "apelido", "nome_curto"];
const ENDERECO_LOGRADOURO_KEYS = ["endereco_logradouro", "logradouro", "endereco", "endereço"];
const ENDERECO_NUMERO_KEYS = ["endereco_numero", "numero", "número", "numero_endereco"];
const ENDERECO_COMPLEMENTO_KEYS = ["endereco_complemento", "complemento", "complemento_endereco"];
const ENDERECO_BAIRRO_KEYS = ["endereco_bairro", "bairro"];
const ENDERECO_CIDADE_KEYS = ["endereco_cidade", "cidade", "municipio", "município"];
const ENDERECO_UF_KEYS = ["endereco_uf", "uf", "estado"];
const ENDERECO_CEP_KEYS = ["endereco_cep", "cep"];
const SINDICO_EMAIL_KEYS = ["sindico_email", "email_sindico", "e_mail_sindico", "e-mail_sindico"];
const SINDICO_CELULAR_KEYS = ["sindico_celular", "celular_sindico", "telefone_sindico", "sindico_telefone"];
const GERENTE_EMAIL_KEYS = ["gerente_email", "email_gerente", "e_mail_gerente", "e-mail_gerente"];
const GERENTE_CELULAR_KEYS = ["gerente_celular", "celular_gerente", "telefone_gerente", "gerente_telefone"];
const CLASSIFICACAO_OPERACIONAL_KEYS = ["classificacao_operacional", "classificacao", "categoria", "badge"];
const PARCELAS_ACORDO_KEYS = [
  "parcelas_acordo_sem_aprovacao_sindico",
  "parcelas_sem_aprovacao",
  "parcelas_sem_aprovacao_sindico",
];
const DIAS_REEMISSAO_ACORDO_KEYS = [
  "dias_reemissao_parcela_acordo_atrasada",
  "dias_reemissao_acordo",
  "dias_reemissao_parcela",
];

function toNonNegativeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function toOptionalNonNegativeInteger(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function normalizeClassificacaoOperacional(value: unknown) {
  const key = normalizeKey(String(value || "prata"));
  if (["ouro", "prata", "bronze"].includes(key)) return key;
  return "prata";
}

function normalizeCondominioStatus(value: unknown) {
  const key = normalizeKey(String(value || "ativo"));
  if (["inativo", "inativa", "inactive", "desativado", "desativada"].includes(key)) return "inativo";
  if (["suspenso", "suspensa", "pausado", "pausada"].includes(key)) return "suspenso";
  return "ativo";
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getDocumento(
  payload: Record<string, any>,
  keys: string[],
  expectedLength?: 11 | 14,
) {
  return (
    normalizeCnpj(getFirst(payload, keys)) ||
    (expectedLength === 14
      ? normalizeCnpj(payload.cnpj ?? payload.condominio_cnpj ?? "")
      : onlyDigits(payload.documento ?? ""))
  );
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function calcularValorAcordoComDespesa(payload: Record<string, any>) {
  const valorOriginal = Number(
    payload.valor_original ??
      payload.valor_cobranca ??
      payload.valor_atualizado ??
      payload.valor_acordado ??
      0,
  );
  const despesaPercentual = Number(
    payload.despesa_cobranca_percentual ?? payload.despesa_percentual ?? 0,
  );
  const despesaValorInformado = Number(
    payload.despesa_cobranca_valor ?? payload.despesa_valor ?? 0,
  );
  const despesaValor = roundMoney(
    despesaValorInformado > 0
      ? despesaValorInformado
      : valorOriginal * (despesaPercentual / 100),
  );

  return {
    valorOriginal: roundMoney(valorOriginal),
    despesaPercentual: roundMoney(despesaPercentual),
    despesaValor,
    valorAcordado: roundMoney(valorOriginal + despesaValor),
  };
}


function monthKeyFromValue(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[2]}-${String(Number(br[1])).padStart(2, "0")}`;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  return null;
}

function monthIndex(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return year * 12 + month - 1;
}

type LegacyDuplicateCharge = {
  mantida_id: string;
  excluida_id: string;
  vencimento: string | null;
  valor_original: number;
  competencia_mantida: string | null;
  competencia_excluida: string | null;
  criterio: string;
};

function dedupeLegacyAgreementCharges(cobrancas: any[]) {
  const selectedByKey = new Map<string, any>();
  const duplicates: LegacyDuplicateCharge[] = [];

  const preferenceScore = (cobranca: any) => {
    const competencia = monthKeyFromValue(cobranca.competencia);
    const vencimento = monthKeyFromValue(cobranca.vencimento);
    if (competencia && vencimento && competencia === vencimento) return 2;
    if (competencia) return 1;
    return 0;
  };

  const prefer = (a: any, b: any) => {
    const scoreA = preferenceScore(a);
    const scoreB = preferenceScore(b);
    if (scoreA !== scoreB) return scoreA > scoreB ? a : b;

    // Desempate estável para que o mesmo preview sempre escolha a mesma cobrança.
    return String(a.id ?? "").localeCompare(String(b.id ?? "")) <= 0 ? a : b;
  };

  for (const cobranca of cobrancas) {
    const vencimento = String(cobranca.vencimento ?? "").slice(0, 10);
    const valorOriginal = roundMoney(Number(cobranca.valor_original ?? 0));
    const unidadeId = String(cobranca.unidade_id ?? "");

    // Sem vencimento ou sem valor positivo, não presumimos duplicidade.
    const key =
      vencimento && Number.isFinite(valorOriginal) && valorOriginal > 0
        ? `${unidadeId}|${vencimento}|${valorOriginal.toFixed(2)}`
        : `id:${String(cobranca.id ?? "")}`;

    const existing = selectedByKey.get(key);
    if (!existing) {
      selectedByKey.set(key, cobranca);
      continue;
    }

    const kept = prefer(existing, cobranca);
    const excluded = kept === existing ? cobranca : existing;
    selectedByKey.set(key, kept);

    const competenciaMantida = optionalString(kept.competencia);
    const competenciaExcluida = optionalString(excluded.competencia);
    duplicates.push({
      mantida_id: String(kept.id),
      excluida_id: String(excluded.id),
      vencimento: optionalString(kept.vencimento),
      valor_original: valorOriginal,
      competencia_mantida: competenciaMantida,
      competencia_excluida: competenciaExcluida,
      criterio:
        competenciaMantida && !competenciaExcluida
          ? "priorizada cobrança com competência preenchida"
          : "desempate determinístico por ID",
    });
  }

  const selecionadas = Array.from(selectedByKey.values()).sort((a, b) => {
    const dateCompare = String(a.vencimento ?? a.competencia ?? "").localeCompare(
      String(b.vencimento ?? b.competencia ?? ""),
    );
    if (dateCompare !== 0) return dateCompare;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

  return { selecionadas, duplicates };
}

function expandMonthRange(start: string, end: string) {
  const startIndex = monthIndex(start);
  const endIndex = monthIndex(end);
  if (endIndex < startIndex || endIndex - startIndex > 240) return [] as string[];

  const months: string[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

function parsePeriodoNegociadoMonths(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const months = new Set<string>();
  if (!raw) return months;

  const normalized = raw
    .replace(/\s+/g, " ")
    .replace(/ATÉ/g, "ATE");

  const rangeRegex = /(\d{1,2})\s*\/\s*(\d{4})\s*(?:A|ATE|-)\s*(\d{1,2})\s*\/\s*(\d{4})/g;
  let match: RegExpExecArray | null;
  while ((match = rangeRegex.exec(normalized)) !== null) {
    const start = `${match[2]}-${String(Number(match[1])).padStart(2, "0")}`;
    const end = `${match[4]}-${String(Number(match[3])).padStart(2, "0")}`;
    expandMonthRange(start, end).forEach((month) => months.add(month));
  }

  const monthRegex = /(\d{1,2})\s*\/\s*(\d{4})/g;
  while ((match = monthRegex.exec(normalized)) !== null) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 12) {
      months.add(`${match[2]}-${String(month).padStart(2, "0")}`);
    }
  }

  return months;
}

function parseParcelaReferencia(value: unknown, fallbackTotal = 0) {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  const match = raw.match(/^(\d{1,3})\/(\d{1,3})$/);
  if (match) {
    return { atual: Number(match[1]), total: Number(match[2]) };
  }

  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && numeric > 0 && numeric < 1 && fallbackTotal > 0) {
    const atual = Math.max(1, Math.round(numeric * fallbackTotal));
    return { atual, total: fallbackTotal };
  }

  return { atual: 0, total: fallbackTotal };
}

function shiftMonthsClampedIso(dateIso: string, months: number) {
  const match = String(dateIso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const monthIndexValue = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndexValue / 12);
  const targetMonthIndex = ((monthIndexValue % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function subtractMonthsIso(dateIso: string, months: number) {
  return shiftMonthsClampedIso(dateIso, -months);
}

function buildHistoricalParcelas(params: {
  valorAcordado: number;
  totalParcelas: number;
  parcelaAtual: number;
  primeiroVencimento: string;
  valorParcelaReferencia?: number;
  permitirRateioIgual?: boolean;
  primeiraParcelaEspecial?: boolean;
}) {
  const {
    valorAcordado,
    totalParcelas,
    parcelaAtual,
    primeiroVencimento,
    valorParcelaReferencia = 0,
    permitirRateioIgual = false,
    primeiraParcelaEspecial = false,
  } = params;

  const erros: string[] = [];
  const alertas: string[] = [];
  const valores: number[] = [];

  if (totalParcelas <= 0) erros.push("Quantidade total de parcelas inválida");
  if (parcelaAtual <= 0) erros.push("Parcela atual inválida");
  if (parcelaAtual >= totalParcelas) {
    erros.push("Acordo finalizado ou na última parcela; não deve ser importado como acordo ativo");
  }
  if (!primeiroVencimento) erros.push("Não foi possível determinar o primeiro vencimento");

  if (erros.length > 0) return { parcelas: [], erros, alertas };

  if (valorParcelaReferencia > 0 && totalParcelas > 1) {
    if (primeiraParcelaEspecial) {
      const restante = roundMoney(valorAcordado - valorParcelaReferencia);
      if (restante <= 0) {
        erros.push("Valor da entrada/parcela inicial é incompatível com o valor total do acordo");
      } else {
        valores.push(roundMoney(valorParcelaReferencia));
        const baseRestante = Math.floor((restante / (totalParcelas - 1)) * 100) / 100;
        let acumuladoRestante = 0;
        for (let index = 2; index <= totalParcelas; index += 1) {
          const valor = index === totalParcelas
            ? roundMoney(restante - acumuladoRestante)
            : roundMoney(baseRestante);
          acumuladoRestante = roundMoney(acumuladoRestante + valor);
          valores.push(valor);
        }
        alertas.push(
          `Primeira parcela/entrada preservada em ${valorParcelaReferencia.toFixed(2)}; saldo restante distribuído entre ${totalParcelas - 1} parcela(s).`,
        );
      }
    } else {
      const primeiroValor = roundMoney(valorAcordado - valorParcelaReferencia * (totalParcelas - 1));
      if (primeiroValor > 0) {
        valores.push(primeiroValor);
        for (let index = 2; index <= totalParcelas; index += 1) {
          valores.push(roundMoney(valorParcelaReferencia));
        }
        const soma = roundMoney(valores.reduce((total, valor) => total + valor, 0));
        valores[valores.length - 1] = roundMoney(valores[valores.length - 1] + (valorAcordado - soma));
        if (Math.abs(primeiroValor - valorParcelaReferencia) > Math.max(1, valorParcelaReferencia * 0.05)) {
          alertas.push(
            `Primeira parcela estimada em ${primeiroValor.toFixed(2)} para conciliar o valor total; demais parcelas usam ${valorParcelaReferencia.toFixed(2)}.`,
          );
        }
      } else if (!permitirRateioIgual) {
        erros.push(
          "Valor da parcela de referência é incompatível com o valor total/quantidade. Revise a linha ou informe rateio_igual_confirmado=sim.",
        );
      }
    }
  }

  if (valores.length === 0) {
    const base = Math.floor((valorAcordado / totalParcelas) * 100) / 100;
    let acumulado = 0;
    for (let index = 1; index <= totalParcelas; index += 1) {
      const valor = index === totalParcelas
        ? roundMoney(valorAcordado - acumulado)
        : roundMoney(base);
      acumulado = roundMoney(acumulado + valor);
      valores.push(valor);
    }
    if (valorParcelaReferencia > 0) {
      alertas.push("Parcelas rateadas igualmente por confirmação explícita da planilha.");
    }
  }

  const parcelas = valores.map((valor, index) => ({
    numero: index + 1,
    tipo_parcela: "parcela",
    valor,
    vencimento: shiftMonthsClampedIso(primeiroVencimento, index) ?? primeiroVencimento,
    status:
      index + 1 <= parcelaAtual
        ? PARCELA_ACORDO_STATUS.PAGA
        : PARCELA_ACORDO_STATUS.PENDENTE,
  }));

  return { parcelas, erros, alertas };
}

function calcularValorAcordoHistorico(payload: Record<string, any>) {
  const valorAcordadoInformado = Number(payload.valor_acordado ?? payload.valor_total ?? 0);
  if (valorAcordadoInformado > 0) {
    return {
      valorOriginal: roundMoney(Number(payload.valor_original ?? valorAcordadoInformado)),
      despesaPercentual: roundMoney(Number(payload.despesa_cobranca_percentual ?? 0)),
      despesaValor: roundMoney(Number(payload.despesa_cobranca_valor ?? 0)),
      valorAcordado: roundMoney(valorAcordadoInformado),
    };
  }
  return calcularValorAcordoComDespesa(payload);
}

function yesLike(value: unknown) {
  return ["sim", "s", "yes", "1", "true"].includes(normalizeKey(String(value ?? "")));
}

function parseImportFile(fileName: string, buffer: ArrayBuffer): ParsedImportFile {
  return parseXlsx(fileName, buffer);
}

function lowerClean(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEmail(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  if (
    !raw ||
    raw === "-" ||
    raw === "nao informado" ||
    raw === "não informado" ||
    raw === "sem email" ||
    raw === "sem e-mail"
  )
    return null;

  const candidates = raw
    .split(/[;,\s]+/)
    .map((item) =>
      item
        .trim()
        .replace(/^[<({\[]+/, "")
        .replace(/[>)}\].,:;]+$/, ""),
    )
    .filter(Boolean);

  const emailRegex =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  const email = candidates.find((item) => emailRegex.test(item));
  return email ?? null;
}

function normalizeCondominioPayload(
  payload: Record<string, any>,
): Record<string, any> {
  const nome = String(getFirst(payload, CONDOMINIO_NOME_KEYS) || payload.nome || "");
  const nomeOperacional = String(
    getFirst(payload, NOME_OPERACIONAL_KEYS) ||
    payload.nome_operacional ||
    nome,
  );
  return {
    ...payload,
    nome: normalizeCondominioName(nome),
    nome_operacional: normalizeCondominioName(nomeOperacional),
    cnpj: getDocumento(payload, CONDOMINIO_CNPJ_KEYS, 14),
    endereco_logradouro: optionalString(getFirst(payload, ENDERECO_LOGRADOURO_KEYS) ?? payload.endereco_logradouro),
    endereco_numero: optionalString(getFirst(payload, ENDERECO_NUMERO_KEYS) ?? payload.endereco_numero),
    endereco_complemento: optionalString(getFirst(payload, ENDERECO_COMPLEMENTO_KEYS) ?? payload.endereco_complemento),
    endereco_bairro: optionalString(getFirst(payload, ENDERECO_BAIRRO_KEYS) ?? payload.endereco_bairro),
    endereco_cidade: optionalString(getFirst(payload, ENDERECO_CIDADE_KEYS) ?? payload.endereco_cidade),
    endereco_uf: optionalString(getFirst(payload, ENDERECO_UF_KEYS) ?? payload.endereco_uf)?.toUpperCase() ?? null,
    endereco_cep: onlyDigits(String(getFirst(payload, ENDERECO_CEP_KEYS) ?? payload.endereco_cep ?? "")) || null,
    sindico_email: normalizeEmail(getFirst(payload, SINDICO_EMAIL_KEYS) ?? payload.sindico_email),
    sindico_celular: onlyDigits(String(getFirst(payload, SINDICO_CELULAR_KEYS) ?? payload.sindico_celular ?? "")) || null,
    gerente_email: normalizeEmail(getFirst(payload, GERENTE_EMAIL_KEYS) ?? payload.gerente_email),
    gerente_celular: onlyDigits(String(getFirst(payload, GERENTE_CELULAR_KEYS) ?? payload.gerente_celular ?? "")) || null,
    vencimento_cota_dia: toPositiveNumber(
      getFirst(payload, VENCIMENTO_COTA_KEYS),
      10,
    ),
    inicio_cobranca_dias: toPositiveNumber(
      getFirst(payload, INICIO_COBRANCA_KEYS),
      30,
    ),
    dias_expiracao_regua_pre_juridico: toOptionalNonNegativeInteger(
      getFirst(payload, DIAS_EXPIRACAO_PRE_JURIDICO_KEYS) ?? payload.dias_expiracao_regua_pre_juridico,
    ),
    valor_cota_condominial: parseMoney(
      getFirst(payload, VALOR_COTA_KEYS) || payload.valor_cota_condominial,
    ),
    parcelas_acordo_sem_aprovacao_sindico: toNonNegativeInteger(
      getFirst(payload, PARCELAS_ACORDO_KEYS) ?? payload.parcelas_acordo_sem_aprovacao_sindico,
      0,
    ),
    dias_reemissao_parcela_acordo_atrasada: toNonNegativeInteger(
      getFirst(payload, DIAS_REEMISSAO_ACORDO_KEYS) ?? payload.dias_reemissao_parcela_acordo_atrasada,
      0,
    ),
    classificacao_operacional: normalizeClassificacaoOperacional(
      getFirst(payload, CLASSIFICACAO_OPERACIONAL_KEYS) ?? payload.classificacao_operacional,
    ),
    status: normalizeCondominioStatus(payload.status),
  };
}

function unidadeKey(params: {
  condominio_id: string;
  identificacao: string;
  bloco?: string | null;
}) {
  return `${params.condominio_id}|${String(params.bloco ?? "")
    .trim()
    .toLowerCase()}|${String(params.identificacao ?? "")
    .trim()
    .toLowerCase()}`;
}

function legacyUnitToken(value: unknown) {
  return normalizeKey(String(value ?? ""))
    .replace(/[^a-z0-9]/g, "")
    .replace(/^0+(?=\d)/, "");
}

function legacyBlockToken(value: unknown) {
  const token = legacyUnitToken(value);
  if (["", "0", "00", "000", "sembloco", "na", "n"].includes(token)) return "";

  // Normaliza zeros de máscara sem misturar blocos realmente diferentes:
  // 03 -> 3, Q03 -> q3, BL03 -> bl3.
  const numeric = token.match(/^0*(\d+)$/);
  if (numeric) return String(Number(numeric[1]));
  const prefixed = token.match(/^([a-z]+)0*(\d+)$/);
  if (prefixed) return `${prefixed[1]}${Number(prefixed[2])}`;

  return token;
}

function legacyResponsibleToken(value: unknown) {
  return normalizeKey(String(value ?? "")).replace(/[^a-z0-9]/g, "");
}

function legacyUnitVariants(identificacao: unknown, bloco: unknown) {
  const unit = legacyUnitToken(identificacao);
  const block = legacyBlockToken(bloco);
  const variants = new Set<string>();
  if (unit) variants.add(unit);

  if (unit && block && unit.startsWith(block) && unit.length > block.length) {
    variants.add(unit.slice(block.length));
  }

  // Alguns relatórios antigos trazem quadra/lote também dentro da unidade
  // (ex.: bloco Q03 + unidade Q3L008). Mantemos uma variante sem o prefixo
  // do bloco para comparar com cadastros que guardam somente L008.
  if (unit && /^q\d+l\d+$/i.test(unit)) {
    const lote = unit.match(/^q\d+(l\d+)$/i)?.[1];
    if (lote) variants.add(legacyUnitToken(lote));
  }

  return variants;
}

function findLegacyUnitMatch(params: {
  unidades: UnidadeImportacaoRow[];
  identificacao: unknown;
  bloco: unknown;
  responsavelNome?: unknown;
}) {
  const { unidades, identificacao, bloco, responsavelNome } = params;
  const informedBlock = legacyBlockToken(bloco);
  const informedVariants = legacyUnitVariants(identificacao, bloco);

  const scored = unidades
    .map((unidade) => {
      const candidateBlock = legacyBlockToken(unidade.bloco);
      const candidateVariants = legacyUnitVariants(unidade.identificacao, unidade.bloco);
      const unitMatches = [...informedVariants].some((item) => candidateVariants.has(item));
      const blockCompatible =
        informedBlock === candidateBlock || !informedBlock || !candidateBlock;
      const exactBlock = informedBlock === candidateBlock;
      const responsibleMatches =
        Boolean(responsavelNome) &&
        legacyResponsibleToken(responsavelNome) !== "" &&
        legacyResponsibleToken(responsavelNome) === legacyResponsibleToken(unidade.responsavel_nome);

      const blockConflict = Boolean(
        informedBlock && candidateBlock && informedBlock !== candidateBlock,
      );

      let score = 0;
      if (!blockConflict && unitMatches) score += 100;
      if (!blockConflict && exactBlock) score += 30;
      else if (!blockConflict && blockCompatible) score += 10;
      if (!blockConflict && responsibleMatches) score += 25;

      // Nome do responsável sozinho só serve como desempate/último recurso;
      // nunca deve vencer um identificador de unidade incompatível quando há
      // múltiplas unidades do mesmo titular.
      if (!unitMatches && responsibleMatches && exactBlock) score = Math.max(score, 45);
      if (!unitMatches && responsibleMatches && !informedBlock) score = Math.max(score, 35);

      return { unidade, score, unitMatches, exactBlock, responsibleMatches };
    })
    .filter((item) => item.score >= 35)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { unidade: undefined, motivo: null as string | null, ambiguo: false };

  const topScore = scored[0].score;
  const top = scored.filter((item) => item.score === topScore);
  if (top.length !== 1) {
    return {
      unidade: undefined,
      motivo: `Correspondência ambígua: ${top.length} unidades candidatas após normalização`,
      ambiguo: true,
    };
  }

  const match = top[0];
  return {
    unidade: match.unidade,
    motivo: match.unitMatches
      ? "Unidade localizada por normalização de máscara/formatação"
      : "Unidade localizada por responsável e bloco",
    ambiguo: false,
  };
}

function cnpjKeyFromPayload(payload: Record<string, any>) {
  return getDocumento(payload, CONDOMINIO_CNPJ_KEYS, 14);
}

function normalizeUnidadeStatus(value: unknown) {
  const key = normalizeKey(String(value || "ativa"));

  if (["ativo", "ativa", "active", "habilitado", "habilitada"].includes(key)) {
    return "ativa";
  }

  if (["inativo", "inativa", "inactive", "desativado", "desativada"].includes(key)) {
    return "inativa";
  }

  return "ativa";
}

function normalizeTipoResponsavel(value: unknown) {
  const key = normalizeKey(String(value ?? ""));
  if (["proprietario", "proprietaria", "dono", "titular"].includes(key)) {
    return "proprietario";
  }
  if (["inquilino", "locatario", "locataria"].includes(key)) {
    return "inquilino";
  }
  return "nao_informado";
}

function normalizeUnidadePayload(
  payload: Record<string, any>,
  condominioPadrao?: CondominioImportacaoRow | null,
) {
  const identificacao = getFirst(payload, [
    "identificacao",
    "unidade",
    "numero",
    "apto",
    "apartamento",
  ]);
  const responsavelNome = getFirst(payload, [
    "responsavel_nome",
    "responsavel",
    "resp",
    "nome",
  ]);
  const responsavelDocumento = onlyDigits(
    getFirst(payload, [
      "responsavel_documento",
      "documento",
      "cpf",
      "cpf_cnpj",
    ]),
  );
  const telefone = onlyDigits(
    getFirst(payload, ["telefone", "celular", "whatsapp", "cel"]),
  );
  const email = normalizeEmail(getFirst(payload, ["email", "e_mail"]));
  const condominioCnpj =
    getDocumento(payload, CONDOMINIO_CNPJ_KEYS, 14) ||
    normalizeCnpj(condominioPadrao?.cnpj ?? "");

  return {
    ...payload,
    condominio_cnpj: condominioCnpj,
    cnpj: condominioCnpj,
    identificacao,
    unidade: identificacao,
    bloco: getFirst(payload, ["bloco", "torre"]),
    tipo: getFirst(payload, ["tipo"]) || "unidade",
    responsavel_nome: responsavelNome,
    tipo_responsavel: normalizeTipoResponsavel(
      getFirst(payload, ["tipo_responsavel", "papel", "vinculo", "vínculo"]),
    ),
    responsavel_documento: responsavelDocumento,
    telefone,
    email,
    status: normalizeUnidadeStatus(getFirst(payload, ["status", "situacao"])),
    observacoes: getFirst(payload, ["observacoes", "obs"]),
  };
}

async function resolveCarteirasByNome(
  supabase: SupabaseClient,
  nomes: string[],
) {
  const nomesLimpos = [
    ...new Set(nomes.map((nome) => String(nome ?? "").trim()).filter(Boolean)),
  ];

  if (nomesLimpos.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from("carteiras")
    .select("id, nome")
    .in("nome", nomesLimpos);

  if (error) throw new Error(`Erro ao consultar carteiras: ${error.message}`);

  return new Map(
    (data ?? []).map((carteira: any) => [
      lowerClean(carteira.nome),
      carteira.id as string,
    ]),
  );
}

async function resolveCondominiosByCnpj(
  supabase: SupabaseClient,
  cnpjs: string[],
) {
  const cnpjsLimpos = [...new Set(cnpjs.map(normalizeCnpj).filter(Boolean))];

  if (cnpjsLimpos.length === 0)
    return new Map<string, CondominioImportacaoRow>();

  const { data, error } = await supabase
    .from("condominios")
    .select("id, carteira_id, nome, cnpj, inicio_cobranca_dias, dias_expiracao_regua_pre_juridico, bloqueio_garantidora_habilitado, bloqueio_garantidora_inicio, bloqueio_garantidora_fim")
    .in("cnpj", cnpjsLimpos);

  if (error)
    throw new Error(`Erro ao consultar condomínios por CNPJ: ${error.message}`);

  return new Map<string, CondominioImportacaoRow>(
    ((data ?? []) as CondominioImportacaoRow[]).map((condominio) => [
      normalizeCnpj(condominio.cnpj ?? ""),
      condominio,
    ]),
  );
}

async function resolveCondominioById(supabase: SupabaseClient, id: string) {
  if (!id) return null;

  const { data, error } = await supabase
    .from("condominios")
    .select("id, carteira_id, nome, cnpj, inicio_cobranca_dias, dias_expiracao_regua_pre_juridico, bloqueio_garantidora_habilitado, bloqueio_garantidora_inicio, bloqueio_garantidora_fim")
    .eq("id", id)
    .maybeSingle();

  if (error)
    throw new Error(`Erro ao consultar condomínio padrão: ${error.message}`);

  return data as CondominioImportacaoRow | null;
}

async function resolveUnidadesByCondominioIds(
  supabase: SupabaseClient,
  condominioIds: string[],
) {
  const ids = [...new Set(condominioIds.filter(Boolean))];
  const unidades: UnidadeImportacaoRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("unidades")
      .select(
        "id, condominio_id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email",
      )
      .in("condominio_id", ids.length > 0 ? ids : [EMPTY_UUID])
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Erro ao consultar unidades: ${error.message}`);

    const page = (data ?? []) as UnidadeImportacaoRow[];
    unidades.push(...page);
    if (page.length < pageSize) break;
  }

  return new Map<string, UnidadeImportacaoRow>(
    unidades.map((unidade) => [
      unidadeKey({
        condominio_id: unidade.condominio_id,
        identificacao: unidade.identificacao,
        bloco: unidade.bloco,
      }),
      unidade,
    ]),
  );
}

async function resolveResponsaveisApoioByCondominioIds(
  supabase: SupabaseClient,
  condominioIds: string[],
) {
  const ids = [...new Set(condominioIds.filter(Boolean))];
  const responsaveis: ResponsavelUnidadeApoioRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("responsaveis_unidades")
      .select(
        "id, condominio_id, carteira_id, unidade, bloco, responsavel_nome, tipo_responsavel, responsavel_documento, telefone, email",
      )
      .eq("ativo", true)
      .in("condominio_id", ids.length > 0 ? ids : [EMPTY_UUID])
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error)
      throw new Error(`Erro ao consultar responsáveis de apoio: ${error.message}`);

    const page = (data ?? []) as ResponsavelUnidadeApoioRow[];
    responsaveis.push(...page);
    if (page.length < pageSize) break;
  }

  return new Map<string, ResponsavelUnidadeApoioRow>(
    responsaveis.map((responsavel) => [
      unidadeKey({
        condominio_id: responsavel.condominio_id,
        identificacao: responsavel.unidade,
        bloco: responsavel.bloco,
      }),
      responsavel,
    ]),
  );
}

function buildImportacaoPayload(
  tipo: string,
  raw: Record<string, string>,
  condominioPadrao?: CondominioImportacaoRow | null,
) {
  if (tipo === "cobrancas") {
    const condominioCnpj =
      getDocumento(raw, CONDOMINIO_CNPJ_KEYS, 14) ||
      normalizeCnpj(condominioPadrao?.cnpj ?? "");
    const unidade = getFirst(raw, ["unidade", "identificacao", "numero"]);
    const bloco = getFirst(raw, ["bloco"]);
    const responsavelNome = getFirst(raw, [
      "responsavel_nome",
      "responsavel",
      "nome",
    ]);
    const responsavelDocumento = onlyDigits(
      getFirst(raw, ["responsavel_documento", "documento", "cpf", "cpf_cnpj"]),
    );
    const telefone = onlyDigits(
      getFirst(raw, ["telefone", "celular", "whatsapp"]),
    );
    const email = normalizeEmail(getFirst(raw, ["email", "e_mail"]));
    const competencia = getFirst(raw, ["competencia", "referencia", "mes"]);
    const vencimento = normalizeDate(
      getFirst(raw, ["vencimento", "data_vencimento"]),
    );
    const multa = parseMoney(getFirst(raw, ["multa"]));
    const correcao = parseMoney(getFirst(raw, ["correcao", "correção"]));
    const juros = parseMoney(getFirst(raw, ["juros"]));
    const totalDoRecibo = parseMoney(
      getFirst(raw, [
        "total_do_recibo",
        "total_recibo",
        "total",
        "valor_total",
      ]),
    );
    const valorAtualizadoInformado = parseMoney(
      getFirst(raw, [
        "valor_atualizado",
        "valor_corrigido",
        "total_do_recibo",
        "total_recibo",
        "total",
        "valor_total",
      ]),
    );
    const valorOriginalInformado = parseMoney(
      getFirst(raw, ["valor_original", "valor", "valor_devido"]),
    );
    const valorOriginal =
      valorOriginalInformado ||
      Math.max(
        0,
        roundMoney(
          (valorAtualizadoInformado || totalDoRecibo) - multa - correcao - juros,
        ),
      );
    const valorAtualizado =
      valorAtualizadoInformado ||
      totalDoRecibo ||
      roundMoney(valorOriginal + multa + correcao + juros);

    return {
      condominio_cnpj: condominioCnpj,
      unidade,
      bloco,
      responsavel_nome: responsavelNome,
      responsavel_documento: responsavelDocumento,
      telefone,
      email,
      competencia,
      vencimento,
      valor_original: valorOriginal,
      valor_atualizado: valorAtualizado,
      total_do_recibo: totalDoRecibo || valorAtualizado,
      multa,
      correcao,
      juros,
      status: getFirst(raw, ["status"]) || "novo",
      observacoes: getFirst(raw, ["observacoes", "obs"]),
    };
  }

  return raw;
}

function validateSimplePayload(tipo: string, payload: Record<string, any>) {
  const erros: string[] = [];

  if (tipo === "condominios") {
    if (!payload.carteira_id && !getFirst(payload, ["carteira", "carteira_nome"]))
      erros.push("Carteira vazia");
    if (!payload.nome) erros.push("Nome vazio");
    const cnpj = normalizeCnpj(payload.cnpj ?? "");
    if (!cnpj) erros.push("CNPJ vazio");
    if (cnpj && cnpj.length !== 14) erros.push("CNPJ inválido");

    const vencimentoCotaDia = Number(payload.vencimento_cota_dia);
    if (
      !Number.isFinite(vencimentoCotaDia) ||
      vencimentoCotaDia < 1 ||
      vencimentoCotaDia > 31
    ) {
      erros.push("Dia de vencimento da cota inválido");
    }

    const inicioCobrancaDias = Number(payload.inicio_cobranca_dias);
    if (!Number.isFinite(inicioCobrancaDias) || inicioCobrancaDias < 1) {
      erros.push("Início da cobrança em dias inválido");
    }
  }

  if (tipo === "unidades") {
    const cnpj = cnpjKeyFromPayload(payload);
    if (!cnpj) erros.push("CNPJ do condomínio vazio");
    if (cnpj && cnpj.length !== 14) erros.push("CNPJ do condomínio inválido");
    if (!payload.identificacao && !payload.unidade)
      erros.push("Identificação vazia");
  }

  if (tipo === "acordos_extra" || tipo === "acordos_judiciais") {
    const cnpj = cnpjKeyFromPayload(payload);
    if (!cnpj) erros.push("CNPJ do condomínio vazio");
    if (cnpj && cnpj.length !== 14) erros.push("CNPJ do condomínio inválido");
    if (!payload.unidade && !payload.identificacao) erros.push("Unidade vazia");
    if (!payload.data_acordo) erros.push("Data do acordo vazia");
    const valorBaseAcordo = parseMoney(
      payload.valor_acordado ??
        payload.valor_total ??
        payload.valor_original ??
        payload.valor_cobranca ??
        payload.valor_atualizado,
    );
    if (valorBaseAcordo <= 0) erros.push("Valor do acordo inválido");
    if (!payload.periodo_negociado)
      erros.push("Período negociado vazio");

    const parcela = parseParcelaReferencia(
      payload.parcela_atual ?? payload.parcela,
      Number(payload.quantidade_parcelas || 0),
    );
    const totalParcelas = Number(payload.quantidade_parcelas || parcela.total || 0);
    if (totalParcelas <= 0) erros.push("Quantidade de parcelas inválida");
    if (parcela.atual <= 0) erros.push("Parcela atual inválida");
    if (!payload.primeiro_vencimento && !payload.vencimento_parcela_atual)
      erros.push("Informe primeiro vencimento ou vencimento da parcela atual");
    if (tipo === "acordos_judiciais" && !payload.numero_processo)
      erros.push("Número do processo vazio");
  }

  return erros;
}

function applyDuplicateCnpjPolicy(tipo: string, rows: PreviewItem[]) {
  if (tipo !== "condominios") return rows;

  const firstLineByCnpj = new Map<string, number>();

  return rows.map((row) => {
    const cnpj = normalizeCnpj(row.payload.cnpj ?? "");
    if (!cnpj) return row;

    const firstLine = firstLineByCnpj.get(cnpj);
    if (!firstLine) {
      firstLineByCnpj.set(cnpj, row.linha);
      return row;
    }

    return {
      ...row,
      valido: false,
      erros: [
        ...row.erros,
        `CNPJ duplicado no arquivo; a primeira ocorrência está na linha ${firstLine} e será considerada`,
      ],
    };
  });
}

function suggestedImportAction(tipo: string, valido: boolean, erros: string[], alertas: string[]) {
  if (!valido || erros.length > 0) {
    return "Corrigir antes de importar";
  }

  if (tipo === "condominios") {
    return alertas.length > 0
      ? "Importar condomínio com alertas"
      : "Pronta para importar";
  }

  if (tipo === "unidades") {
    return alertas.length > 0
      ? "Importar unidade com alertas"
      : "Pronta para importar";
  }

  return "Pronta para importar";
}

async function enrichSimplePreview(
  supabase: SupabaseClient,
  tipo: string,
  rows: PreviewItem[],
  condominioPadrao?: CondominioImportacaoRow | null,
) {
  const carteiraNames = rows
    .map((row) => getFirst(row.payload, ["carteira", "carteira_nome"]))
    .filter(Boolean);
  const carteirasByNome = await resolveCarteirasByNome(supabase, carteiraNames);
  const cnpjs = rows
    .map((row) => cnpjKeyFromPayload(row.payload))
    .filter(Boolean);
  const condominiosByCnpj =
    tipo === "unidades" || tipo === "condominios"
      ? await resolveCondominiosByCnpj(supabase, cnpjs)
      : new Map<string, CondominioImportacaoRow>();
  if (tipo === "unidades" && condominioPadrao?.cnpj)
    condominiosByCnpj.set(
      normalizeCnpj(condominioPadrao.cnpj),
      condominioPadrao,
    );
  const condominioIdsParaUnidades =
    tipo === "unidades"
      ? [...new Set([...condominiosByCnpj.values()].map((item) => item.id))]
      : [];
  const responsaveisExistentes =
    tipo === "unidades"
      ? await resolveResponsaveisApoioByCondominioIds(
          supabase,
          condominioIdsParaUnidades,
        )
      : new Map<string, ResponsavelUnidadeApoioRow>();
  const primeiraLinhaPorUnidade = new Map<string, number>();

  const enriched = rows.map((row) => {
    const payload = { ...row.payload };
    const erros = [...row.erros];
    const alertas = [...(row.alertas ?? [])];
    const carteiraNome = getFirst(payload, ["carteira", "carteira_nome"]);
    const carteiraId = carteiraNome
      ? carteirasByNome.get(lowerClean(carteiraNome))
      : payload.carteira_id || null;

    if (tipo === "condominios") {
      const cnpj = normalizeCnpj(payload.cnpj ?? "");
      if (!carteiraId)
        erros.push(
          carteiraNome
            ? `Carteira não encontrada: ${carteiraNome}`
            : "Carteira vazia",
        );
      if (cnpj && condominiosByCnpj.has(cnpj))
        erros.push("CNPJ já cadastrado na base");
    }

    payload.carteira_id = carteiraId ?? null;

    if (tipo === "unidades") {
      const condominioCnpj = cnpjKeyFromPayload(payload);
      const condominio = condominiosByCnpj.get(condominioCnpj);

      if (!condominio) erros.push("Condomínio não encontrado pelo CNPJ");

      if (condominio && carteiraId && condominio.carteira_id !== carteiraId) {
        alertas.push(
          "Carteira da planilha diferente da carteira cadastrada no condomínio; será usada a carteira do condomínio",
        );
      }

      payload.condominio_id = condominio?.id ?? null;
      payload.condominio_nome = condominio?.nome ?? null;
      payload.carteira_id = condominio?.carteira_id ?? carteiraId ?? null;
      payload.email = normalizeEmail(payload.email);

      if (getFirst(row.payload, ["email", "e_mail"]) && !payload.email) {
        alertas.push("E-mail inválido ignorado na importação");
      }

      if (condominio && (payload.identificacao || payload.unidade)) {
        const chave = unidadeKey({
          condominio_id: condominio.id,
          identificacao: payload.identificacao || payload.unidade,
          bloco: payload.bloco,
        });
        const primeiraLinha = primeiraLinhaPorUnidade.get(chave);

        if (primeiraLinha) {
          erros.push(
            `Unidade duplicada no arquivo; a primeira ocorrência está na linha ${primeiraLinha}`,
          );
        } else {
          primeiraLinhaPorUnidade.set(chave, row.linha);
        }

        if (responsaveisExistentes.has(chave)) {
          alertas.push("Responsável já cadastrado para este condomínio/unidade; a importação vai atualizar os dados de apoio");
        }
      }
    }

    const valido = erros.length === 0;

    return {
      ...row,
      payload: {
        ...payload,
        acao_sugerida: suggestedImportAction(tipo, valido, erros, alertas),
      },
      valido,
      erros,
      alertas,
    };
  });

  return applyDuplicateCnpjPolicy(tipo, enriched);
}

async function enrichCobrancaPreview(
  supabase: SupabaseClient,
  rows: Array<{ linha: number; payload: Record<string, any> }>,
  condominioPadrao?: CondominioImportacaoRow | null,
  somenteValidasNaRegua = true,
) {
  const cnpjs = rows
    .map((row) => cnpjKeyFromPayload(row.payload))
    .filter(Boolean);
  const condominiosByCnpj = await resolveCondominiosByCnpj(supabase, cnpjs);
  const condominioIds = [
    ...new Set([
      ...[...condominiosByCnpj.values()].map((item) => item.id),
      ...(condominioPadrao?.id ? [condominioPadrao.id] : []),
    ]),
  ];
  const unidadesByKey = await resolveUnidadesByCondominioIds(
    supabase,
    condominioIds,
  );
  const responsaveisApoioByKey = await resolveResponsaveisApoioByCondominioIds(
    supabase,
    condominioIds,
  );

  return rows.map((row) => {
    const payload = row.payload;
    const erros: string[] = [];
    const alertas: string[] = [];
    const condominioCnpj = normalizeCnpj(payload.condominio_cnpj ?? "");

    if (!condominioCnpj && !condominioPadrao) erros.push("CNPJ do condomínio vazio");
    if (condominioCnpj && condominioCnpj.length !== 14)
      erros.push("CNPJ do condomínio inválido");

    const condominio =
      condominiosByCnpj.get(condominioCnpj) ??
      (condominioPadrao && (!condominioCnpj || condominioCnpj === normalizeCnpj(condominioPadrao.cnpj ?? ""))
        ? condominioPadrao
        : undefined);

    if (!condominio) {
      erros.push(
        condominioCnpj
          ? "Condomínio não encontrado pelo CNPJ"
          : "CNPJ do condomínio vazio e nenhum condomínio padrão foi selecionado",
      );
    }
    if (!payload.unidade) erros.push("Unidade vazia");
    if (!payload.vencimento) erros.push("Vencimento vazio");
    if (Number(payload.valor_original) <= 0 && Number(payload.valor_atualizado) <= 0)
      erros.push("Valor original/total do recibo inválido");

    let unidade: UnidadeImportacaoRow | undefined;
    let responsavelApoio: ResponsavelUnidadeApoioRow | undefined;
    let unidadeNova = false;

    if (condominio && payload.unidade) {
      const chaveUnidade = unidadeKey({
        condominio_id: condominio.id,
        identificacao: payload.unidade,
        bloco: payload.bloco,
      });
      unidade = unidadesByKey.get(chaveUnidade);
      responsavelApoio = responsaveisApoioByKey.get(chaveUnidade);
      if (!unidade) {
        unidadeNova = true;
        alertas.push("Unidade não encontrada: será criada pela inadimplência");
      }
    }

    if (responsavelApoio) {
      alertas.push("Contato encontrado no cadastro de apoio de responsaveis");
    }

    const recorteAnoCorrente = avaliarRecorteAnoCorrente(payload.vencimento);
    const reguaImportacao = avaliarReguaImportacao({
      vencimento: payload.vencimento,
      inicioCobrancaDias: condominio?.inicio_cobranca_dias,
    });
    const importarPeloRecorte = somenteValidasNaRegua
      ? recorteAnoCorrente.dentroDoAnoCorrente && !reguaImportacao.foraRegua
      : recorteAnoCorrente.dentroDoAnoCorrente;
    const motivoRecorte = !recorteAnoCorrente.dentroDoAnoCorrente
      ? recorteAnoCorrente.motivo
      : somenteValidasNaRegua && reguaImportacao.foraRegua
        ? reguaImportacao.motivo
        : null;
    if (!recorteAnoCorrente.dentroDoAnoCorrente && recorteAnoCorrente.motivo) {
      alertas.push(`${recorteAnoCorrente.motivo} Linha será mantida apenas no histórico da importação.`);
    }
    if (somenteValidasNaRegua && reguaImportacao.foraRegua && reguaImportacao.motivo) {
      alertas.push(`Fora da régua de cobrança: ${reguaImportacao.motivo} Linha será mantida apenas no histórico da importação.`);
    }
    const bloqueioGarantidora = avaliarBloqueioGarantidora(condominio, {
      competencia: payload.competencia,
      vencimento: payload.vencimento,
    });
    if (bloqueioGarantidora.bloqueada) {
      alertas.push("Bloqueio Garantidora: cobrança será importada como suspensa e ficará fora da régua.");
    }

    const blocked = erros.length > 0;
    const priority = estimatePriority({
      valor: Number(payload.valor_atualizado ?? payload.valor_original ?? 0),
      vencimento: payload.vencimento,
      blocked,
    });

    return {
      linha: row.linha,
      payload: {
        ...payload,
        carteira_id: condominio?.carteira_id ?? null,
        condominio_id: condominio?.id ?? null,
        condominio_nome: condominio?.nome ?? null,
        unidade_id: unidade?.id ?? null,
        unidade_nova: unidadeNova,
        responsavel_nome:
          responsavelApoio?.responsavel_nome ||
          payload.responsavel_nome ||
          unidade?.responsavel_nome ||
          null,
        responsavel_documento:
          responsavelApoio?.responsavel_documento ||
          payload.responsavel_documento ||
          unidade?.responsavel_documento ||
          null,
        telefone: responsavelApoio?.telefone || payload.telefone || unidade?.telefone || null,
        email: responsavelApoio?.email || payload.email || unidade?.email || null,
        prioridade_estimada: priority.prioridade,
        score_estimado: priority.score,
        acao_sugerida: !importarPeloRecorte ? "Manter apenas no histórico" : priority.acao,
        motivo_prioridade: motivoRecorte ?? priority.motivo,
        fora_regua_cobranca: reguaImportacao.foraRegua,
        fora_ano_corrente: !recorteAnoCorrente.dentroDoAnoCorrente,
        ano_corrente_importacao: recorteAnoCorrente.anoCorrente,
        importar_cobranca: importarPeloRecorte,
        recorte_regua: somenteValidasNaRegua ? "ja_na_regua" : "todos",
        dias_atraso_importacao: reguaImportacao.diasAtraso,
        inicio_cobranca_dias: reguaImportacao.inicioCobrancaDias,
        bloqueio_garantidora: bloqueioGarantidora.bloqueada,
      },
      valido: !blocked,
      erros,
      alertas,
    };
  });
}

async function enrichLegacyPreview(
  supabase: SupabaseClient,
  tipo: string,
  rows: PreviewItem[],
) {
  const cnpjs = rows
    .map((row) => cnpjKeyFromPayload(row.payload))
    .filter(Boolean);
  const condominiosByCnpj = await resolveCondominiosByCnpj(supabase, cnpjs);
  const condominioIds = [
    ...new Set([...condominiosByCnpj.values()].map((item) => item.id)),
  ];
  const unidadesByKey = await resolveUnidadesByCondominioIds(
    supabase,
    condominioIds,
  );
  const unidadesPorCondominio = new Map<string, UnidadeImportacaoRow[]>();
  const unidadesById = new Map<string, UnidadeImportacaoRow>();
  for (const unidade of unidadesByKey.values()) {
    unidadesById.set(unidade.id, unidade);
    const atuais = unidadesPorCondominio.get(unidade.condominio_id) ?? [];
    atuais.push(unidade);
    unidadesPorCondominio.set(unidade.condominio_id, atuais);
  }

  // Em cargas históricas preparadas a partir de um relatório atual do COB,
  // a cobrança de referência resolve a unidade de forma determinística.
  // Ela serve apenas como ponte para unidade_id; só entra no acordo se também
  // pertencer ao período negociado pelas regras normais abaixo.
  const cobrancaReferenciaIds = Array.from(
    new Set(
      rows
        .map((row) => String(row.payload.cobranca_referencia_id ?? "").trim())
        .filter(Boolean),
    ),
  );
  const cobrancasReferenciaById = new Map<string, any>();
  const unidadesReferenciaById = new Map<string, UnidadeImportacaoRow>();
  const condominiosReferenciaById = new Map<string, CondominioImportacaoRow>();
  if (cobrancaReferenciaIds.length > 0) {
    const { data: cobrancasReferencia, error: cobrancasReferenciaError } = await supabase
      .from("cobrancas")
      .select("id, carteira_id, condominio_id, unidade_id, competencia, vencimento")
      .in("id", cobrancaReferenciaIds);

    if (cobrancasReferenciaError) {
      throw new Error(
        `Erro ao localizar cobranças de referência: ${cobrancasReferenciaError.message}`,
      );
    }

    for (const cobranca of cobrancasReferencia ?? []) {
      cobrancasReferenciaById.set(String((cobranca as any).id), cobranca);
    }

    const condominioReferenciaIds = Array.from(
      new Set(
        (cobrancasReferencia ?? [])
          .map((cobranca: any) => String(cobranca?.condominio_id ?? "").trim())
          .filter(Boolean),
      ),
    );

    if (condominioReferenciaIds.length > 0) {
      const { data: condominiosReferencia, error: condominiosReferenciaError } = await supabase
        .from("condominios")
        .select("id, carteira_id, nome, cnpj, inicio_cobranca_dias, dias_expiracao_regua_pre_juridico, bloqueio_garantidora_habilitado, bloqueio_garantidora_inicio, bloqueio_garantidora_fim")
        .in("id", condominioReferenciaIds);

      if (condominiosReferenciaError) {
        throw new Error(
          `Erro ao localizar condomínios das cobranças de referência: ${condominiosReferenciaError.message}`,
        );
      }

      for (const condominio of (condominiosReferencia ?? []) as CondominioImportacaoRow[]) {
        condominiosReferenciaById.set(condominio.id, condominio);
      }
    }

    // Não reutilizar unidadesById aqui: ele é montado a partir de unidadesByKey,
    // que deduplica unidades com a mesma máscara (condomínio + bloco + identificação).
    // Uma cobrança pode apontar legitimamente para o ID que foi sobrescrito nesse Map.
    // Por isso buscamos as unidades referenciadas diretamente pelos IDs das cobranças.
    const unidadeReferenciaIds = Array.from(
      new Set(
        (cobrancasReferencia ?? [])
          .map((cobranca: any) => String(cobranca?.unidade_id ?? "").trim())
          .filter(Boolean),
      ),
    );

    if (unidadeReferenciaIds.length > 0) {
      const { data: unidadesReferencia, error: unidadesReferenciaError } = await supabase
        .from("unidades")
        .select(
          "id, condominio_id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email",
        )
        .in("id", unidadeReferenciaIds);

      if (unidadesReferenciaError) {
        throw new Error(
          `Erro ao localizar unidades das cobranças de referência: ${unidadesReferenciaError.message}`,
        );
      }

      for (const unidade of (unidadesReferencia ?? []) as UnidadeImportacaoRow[]) {
        unidadesReferenciaById.set(unidade.id, unidade);
      }
    }
  }

  const resolved = rows.map((row) => {
    const payload = { ...row.payload };
    const erros = [...row.erros];
    const alertas = [...(row.alertas ?? [])];
    const condominioCnpj = cnpjKeyFromPayload(payload);
    const identificacao = payload.unidade || payload.identificacao;
    const cobrancaReferenciaId = String(payload.cobranca_referencia_id ?? "").trim();
    const cobrancaReferencia = cobrancaReferenciaId
      ? cobrancasReferenciaById.get(cobrancaReferenciaId)
      : undefined;
    let condominio = condominiosByCnpj.get(condominioCnpj);

    // Se o CNPJ histórico não existir mais no cadastro, uma cobrança de referência
    // válida pode resolver o condomínio atual de forma determinística. Isso é útil
    // em migrações nas quais o empreendimento foi recadastrado com outro CNPJ/nome.
    if (!condominio && cobrancaReferencia) {
      const condominioReferenciaId = String(cobrancaReferencia.condominio_id ?? "").trim();
      const condominioReferencia = condominiosReferenciaById.get(condominioReferenciaId);

      if (condominioReferencia) {
        condominio = condominioReferencia;
        const cnpjAtual = normalizeCnpj(condominioReferencia.cnpj ?? "");
        alertas.push(
          `Condomínio localizado pela cobrança de referência porque o CNPJ informado (${condominioCnpj || "vazio"}) não existe no cadastro atual${cnpjAtual ? `; CNPJ atual: ${cnpjAtual}` : ""}.`,
        );
        payload.condominio_cnpj = cnpjAtual || payload.condominio_cnpj;
        payload.cnpj = cnpjAtual || payload.cnpj;
      }
    }

    if (!condominio) erros.push("Condomínio não encontrado pelo CNPJ");
    let unidade: UnidadeImportacaoRow | undefined;
    let unidadeMatchMotivo: string | null = null;

    if (cobrancaReferenciaId && !cobrancaReferencia) {
      erros.push(`Cobrança de referência não encontrada no COB: ${cobrancaReferenciaId}`);
    }

    if (cobrancaReferencia && condominio) {
      if (String(cobrancaReferencia.condominio_id ?? "") !== condominio.id) {
        erros.push(
          `Cobrança de referência pertence a outro condomínio: ${cobrancaReferenciaId}`,
        );
      } else {
        const unidadeReferenciaId = String(cobrancaReferencia.unidade_id ?? "").trim();
        const unidadeReferencia =
          unidadesReferenciaById.get(unidadeReferenciaId) ??
          unidadesById.get(unidadeReferenciaId);

        if (!unidadeReferencia) {
          alertas.push(
            `A unidade_id da cobrança de referência não está disponível no cadastro atual; tentando localizar a unidade pela máscara: ${cobrancaReferenciaId}`,
          );
        } else if (String(unidadeReferencia.condominio_id ?? "") !== condominio.id) {
          erros.push(
            `Unidade da cobrança de referência pertence a outro condomínio: ${cobrancaReferenciaId}`,
          );
        } else {
          unidade = unidadeReferencia;
          unidadeMatchMotivo = "Unidade localizada pela cobrança de referência";
        }
      }
    }

    if (!unidade) {
      unidade =
        condominio && identificacao
          ? unidadesByKey.get(
              unidadeKey({
                condominio_id: condominio.id,
                identificacao,
                bloco: payload.bloco,
              }),
            )
          : undefined;
    }

    if (!unidade && condominio && identificacao) {
      const fuzzy = findLegacyUnitMatch({
        unidades: unidadesPorCondominio.get(condominio.id) ?? [],
        identificacao,
        bloco: payload.bloco,
        responsavelNome: payload.responsavel_nome,
      });
      unidade = fuzzy.unidade;
      unidadeMatchMotivo = fuzzy.motivo;

      if (unidade && fuzzy.motivo) {
        alertas.push(
          `${fuzzy.motivo}: informado ${String(payload.bloco ?? "-")}/${String(identificacao)} → cadastro ${String(unidade.bloco ?? "-")}/${String(unidade.identificacao)}`,
        );
      } else if (fuzzy.ambiguo && fuzzy.motivo) {
        erros.push(fuzzy.motivo);
      }
    }

    if (!unidade) erros.push("Unidade não encontrada para vínculo do acordo histórico");

    return { row, payload, erros, alertas, condominio, unidade, identificacao, unidadeMatchMotivo };
  });

  const unidadeIds = Array.from(
    new Set(resolved.map((item) => item.unidade?.id).filter(Boolean) as string[]),
  );

  const cobrancasByUnidade = new Map<string, any[]>();
  if (unidadeIds.length > 0) {
    const { data: cobrancas, error: cobrancasError } = await supabase
      .from("cobrancas")
      .select(
        "id, carteira_id, condominio_id, unidade_id, competencia, vencimento, valor_original, valor_atualizado, juros, multa, correcao, desconto, status, status_operacional, status_financeiro, duplicada_de_id",
      )
      .in("unidade_id", unidadeIds);

    if (cobrancasError) {
      throw new Error(`Erro ao localizar cobranças históricas: ${cobrancasError.message}`);
    }

    for (const cobranca of cobrancas ?? []) {
      const unidadeId = String((cobranca as any).unidade_id ?? "");
      if (!unidadeId) continue;
      const atual = cobrancasByUnidade.get(unidadeId) ?? [];
      atual.push(cobranca);
      cobrancasByUnidade.set(unidadeId, atual);
    }
  }

  const previewResolved = resolved.map((item) => {
    const { payload, unidade } = item;
    const periodoMonths = parsePeriodoNegociadoMonths(payload.periodo_negociado);
    const cobrancasUnidade = unidade ? cobrancasByUnidade.get(unidade.id) ?? [] : [];
    const cobrancasCanonicas = cobrancasUnidade.filter((cobranca) => !cobranca.duplicada_de_id);
    const cobrancasArquivadas = cobrancasUnidade.filter((cobranca) => Boolean(cobranca.duplicada_de_id));
    const mesesOrdenados = Array.from(periodoMonths).sort();
    const inicioPeriodo = mesesOrdenados[0] ?? null;
    const fimPeriodo = mesesOrdenados[mesesOrdenados.length - 1] ?? null;

    const dentroDoPeriodo = (cobranca: any) => {
      const competencia = monthKeyFromValue(cobranca.competencia);
      const vencimento = monthKeyFromValue(cobranca.vencimento);
      return Boolean(
        (competencia && periodoMonths.has(competencia)) ||
          (vencimento && periodoMonths.has(vencimento)),
      );
    };

    const cobrancasPeriodoBrutas = cobrancasCanonicas
      .filter(dentroDoPeriodo)
      .sort((a, b) => String(a.vencimento ?? a.competencia ?? "").localeCompare(String(b.vencimento ?? b.competencia ?? "")));
    const dedupePeriodo = dedupeLegacyAgreementCharges(cobrancasPeriodoBrutas);
    const cobrancasPeriodo = dedupePeriodo.selecionadas;
    const cobrancasDuplicadasPeriodo = dedupePeriodo.duplicates;

    const cobrancasArquivadasPeriodo = cobrancasArquivadas
      .filter(dentroDoPeriodo)
      .sort((a, b) => String(a.vencimento ?? a.competencia ?? "").localeCompare(String(b.vencimento ?? b.competencia ?? "")));

    const cobrancasPosteriores = cobrancasCanonicas.filter((cobranca) => {
      if (!fimPeriodo) return false;
      const key = monthKeyFromValue(cobranca.competencia) ?? monthKeyFromValue(cobranca.vencimento);
      return Boolean(key && monthIndex(key) > monthIndex(fimPeriodo));
    });

    const mesesEncontrados = new Set(
      cobrancasPeriodo
        .map((cobranca) => monthKeyFromValue(cobranca.competencia) ?? monthKeyFromValue(cobranca.vencimento))
        .filter(Boolean) as string[],
    );
    const mesesArquivados = new Set(
      cobrancasArquivadasPeriodo
        .map((cobranca) => monthKeyFromValue(cobranca.competencia) ?? monthKeyFromValue(cobranca.vencimento))
        .filter(Boolean) as string[],
    );
    const mesesSemCobranca = mesesOrdenados.filter((month) => !mesesEncontrados.has(month));
    const mesesSomenteArquivados = mesesSemCobranca.filter((month) => mesesArquivados.has(month));

    return {
      ...item,
      periodoMonths,
      inicioPeriodo,
      fimPeriodo,
      cobrancasPeriodo,
      cobrancasDuplicadasPeriodo,
      cobrancasArquivadasPeriodo,
      cobrancasPosteriores,
      mesesSemCobranca,
      mesesSomenteArquivados,
    };
  });

  const cobrancaIds = Array.from(
    new Set(previewResolved.flatMap((item) => item.cobrancasPeriodo.map((cobranca) => String(cobranca.id)))),
  );
  const linksByCobranca = new Map<string, any[]>();
  if (cobrancaIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("acordo_cobrancas")
      .select("cobranca_id, acordo_id, acordos:acordo_id(id,status,data_acordo,unidade_id)")
      .in("cobranca_id", cobrancaIds);

    if (linksError) {
      throw new Error(`Erro ao validar vínculos existentes de acordo: ${linksError.message}`);
    }

    for (const link of links ?? []) {
      const cobrancaId = String((link as any).cobranca_id ?? "");
      const atual = linksByCobranca.get(cobrancaId) ?? [];
      atual.push(link);
      linksByCobranca.set(cobrancaId, atual);
    }
  }

  const acordosByUnidade = new Map<string, any[]>();
  if (unidadeIds.length > 0) {
    const { data: acordos, error: acordosError } = await supabase
      .from("acordos")
      .select("id, unidade_id, data_acordo, status, valor_acordado")
      .in("unidade_id", unidadeIds);

    if (acordosError) {
      throw new Error(`Erro ao validar acordos existentes: ${acordosError.message}`);
    }

    for (const acordo of acordos ?? []) {
      const unidadeId = String((acordo as any).unidade_id ?? "");
      const atual = acordosByUnidade.get(unidadeId) ?? [];
      atual.push(acordo);
      acordosByUnidade.set(unidadeId, atual);
    }
  }

  return previewResolved.map((item) => {
    const { row, payload, erros: baseErros, alertas: baseAlertas, condominio, unidade, identificacao } = item;
    const erros = [...baseErros];
    const alertas = [...baseAlertas];
    const calculo = calcularValorAcordoHistorico(payload);
    const valorAcordado = calculo.valorAcordado;

    if (item.periodoMonths.size === 0) {
      erros.push("Período negociado inválido; use MM/AAAA, intervalos com A ou meses separados por E/vírgula");
    }
    if (unidade && item.cobrancasPeriodo.length === 0) {
      alertas.push(
        "Nenhuma cobrança canônica do período está disponível no COB; o acordo será importado como histórico da unidade, sem vínculo em acordo_cobrancas e sem alterar cobranças atuais.",
      );
    }
    if (item.cobrancasArquivadasPeriodo.length > 0) {
      alertas.push(
        `${item.cobrancasArquivadasPeriodo.length} cobrança(s) arquivada(s)/duplicada(s) do período foram localizada(s) apenas como evidência histórica e não serão vinculadas ao acordo.`,
      );
    }
    if (item.cobrancasDuplicadasPeriodo.length > 0) {
      alertas.push(
        `${item.cobrancasDuplicadasPeriodo.length} cobrança(s) canônica(s) aparentemente duplicada(s) no período foram excluída(s) do vínculo por terem o mesmo vencimento e valor original; o log registra qual cobrança foi mantida.`,
      );
    }

    const cobrancasJaVinculadas = item.cobrancasPeriodo.filter((cobranca) =>
      (linksByCobranca.get(String(cobranca.id)) ?? []).length > 0,
    );
    if (cobrancasJaVinculadas.length > 0) {
      erros.push(
        `${cobrancasJaVinculadas.length} cobrança(s) do período já estão vinculadas a outro acordo`,
      );
    }

    const acordoMesmoDia = unidade
      ? (acordosByUnidade.get(unidade.id) ?? []).find(
          (acordo) =>
            String(acordo.data_acordo ?? "") === String(payload.data_acordo ?? "") &&
            String(acordo.status ?? "") !== ACORDO_STATUS.CANCELADO,
        )
      : null;
    if (acordoMesmoDia) {
      erros.push(`Já existe acordo desta unidade com data ${payload.data_acordo} (${acordoMesmoDia.id})`);
    }

    if (item.cobrancasPosteriores.length > 0) {
      alertas.push(
        `${item.cobrancasPosteriores.length} cobrança(s) posterior(es) ao período negociado ficarão fora do acordo e continuarão normais no COB`,
      );
    }
    if (item.mesesSemCobranca.length > 0) {
      alertas.push(
        `${item.mesesSemCobranca.length} competência(s) do período não possuem cobrança canônica localizada: ${item.mesesSemCobranca.slice(0, 8).join(", ")}${item.mesesSemCobranca.length > 8 ? "…" : ""}`,
      );
    }

    const parcelaReferencia = parseParcelaReferencia(
      payload.parcela_atual,
      Number(payload.quantidade_parcelas || 0),
    );
    const totalParcelas = Number(payload.quantidade_parcelas || parcelaReferencia.total || 0);
    const parcelaAtual = Number(payload.parcela_atual_numero || parcelaReferencia.atual || 0);
    const primeiroVencimento = String(payload.primeiro_vencimento ?? "");
    const parcelasHistoricas = buildHistoricalParcelas({
      valorAcordado,
      totalParcelas,
      parcelaAtual,
      primeiroVencimento,
      valorParcelaReferencia: Number(payload.valor_parcela_referencia || 0),
      permitirRateioIgual: Boolean(payload.rateio_igual_confirmado),
      primeiraParcelaEspecial:
        parcelaAtual === 1 && normalizeKey(String(payload.composicao_acordo ?? "")).includes("entrada"),
    });
    erros.push(...parcelasHistoricas.erros);
    alertas.push(...parcelasHistoricas.alertas);

    const valorBaseCobrancas = roundMoney(
      item.cobrancasPeriodo.reduce(
        (total, cobranca) => total + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
        0,
      ),
    );
    if (valorBaseCobrancas > 0 && valorAcordado > 0) {
      const limiteSuperiorVinculo = roundMoney(valorAcordado * 1.25);
      if (valorBaseCobrancas > limiteSuperiorVinculo) {
        erros.push(
          `Valor das cobranças que seriam vinculadas (${valorBaseCobrancas.toFixed(2)}) supera em mais de 25% o valor histórico do acordo (${valorAcordado.toFixed(2)}); revise as cobranças antes de importar.`,
        );
      } else {
        const diferencaPercentual =
          Math.abs(valorAcordado - valorBaseCobrancas) / Math.max(valorAcordado, valorBaseCobrancas);
        if (diferencaPercentual > 0.25) {
          alertas.push(
            `Valor atual das cobranças do período (${valorBaseCobrancas.toFixed(2)}) difere mais de 25% do valor histórico do acordo (${valorAcordado.toFixed(2)}).`,
          );
        }
      }
    }

    if (Number(payload.entrada ?? 0) > 0) {
      alertas.push("Campo entrada foi preservado apenas como informação do acordo; a sequência histórica segue a numeração informada em parcela_atual.");
    }

    return {
      ...row,
      payload: {
        ...payload,
        condominio_id: condominio?.id ?? null,
        condominio_nome: condominio?.nome ?? null,
        carteira_id: condominio?.carteira_id ?? unidade?.carteira_id ?? null,
        unidade_id: unidade?.id ?? null,
        unidade: identificacao,
        valor_original: calculo.valorOriginal,
        despesa_cobranca_percentual: calculo.despesaPercentual,
        despesa_cobranca_valor: calculo.despesaValor,
        valor_acordado: valorAcordado,
        responsavel_nome: payload.responsavel_nome || unidade?.responsavel_nome || null,
        periodo_inicio: item.inicioPeriodo,
        periodo_fim: item.fimPeriodo,
        cobranca_ids_acordo: item.cobrancasPeriodo.map((cobranca) => cobranca.id),
        cobrancas_acordo: item.cobrancasPeriodo.map((cobranca) => ({
          id: cobranca.id,
          competencia: cobranca.competencia ?? null,
          vencimento: cobranca.vencimento ?? null,
          valor_original: Number(cobranca.valor_original ?? 0),
          valor_atualizado: Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
        })),
        quantidade_cobrancas_acordo: item.cobrancasPeriodo.length,
        quantidade_cobrancas_duplicadas_periodo: item.cobrancasDuplicadasPeriodo.length,
        cobrancas_duplicadas_periodo_preview: item.cobrancasDuplicadasPeriodo,
        quantidade_cobrancas_arquivadas_periodo: item.cobrancasArquivadasPeriodo.length,
        cobrancas_arquivadas_periodo_preview: item.cobrancasArquivadasPeriodo.slice(0, 12).map((cobranca) => ({
          id: cobranca.id,
          competencia: cobranca.competencia ?? null,
          vencimento: cobranca.vencimento ?? null,
          duplicada_de_id: cobranca.duplicada_de_id ?? null,
        })),
        quantidade_cobrancas_posteriores: item.cobrancasPosteriores.length,
        cobrancas_posteriores_preview: item.cobrancasPosteriores.slice(0, 12).map((cobranca) => ({
          id: cobranca.id,
          competencia: cobranca.competencia ?? null,
          vencimento: cobranca.vencimento ?? null,
        })),
        meses_sem_cobranca: item.mesesSemCobranca,
        meses_somente_arquivados: item.mesesSomenteArquivados,
        somente_historico: Boolean(unidade && item.cobrancasPeriodo.length === 0),
        unidade_match_motivo: item.unidadeMatchMotivo ?? null,
        valor_base_cobrancas: valorBaseCobrancas,
        parcela_atual_numero: parcelaAtual,
        quantidade_parcelas: totalParcelas,
        parcelas_importacao: parcelasHistoricas.parcelas,
        parcelas_pagas_importacao: parcelasHistoricas.parcelas.filter((parcela) => parcela.status === PARCELA_ACORDO_STATUS.PAGA).length,
        prioridade_estimada: erros.length ? "bloqueada" : alertas.length ? "media" : "baixa",
        score_estimado: erros.length ? 0 : alertas.length ? 55 : 20,
        acao_sugerida: erros.length
          ? "Corrigir antes de importar"
          : item.cobrancasPeriodo.length === 0
            ? `Importar acordo histórico sem vínculo de cobranças; ${item.cobrancasPosteriores.length} posterior(es) permanecem normais no COB`
            : `Importar acordo histórico com ${item.cobrancasPeriodo.length} cobrança(s); ${item.cobrancasPosteriores.length} posterior(es) ficam fora`,
      },
      valido: erros.length === 0,
      erros,
      alertas,
    };
  });
}

function destinoPorTipo(tipo: string) {
  if (tipo === "condominios") return "/app/condominios";
  if (tipo === "unidades") return "/app/responsaveis";
  if (tipo === "cobrancas") return "/app/cobrancas";
  if (tipo === "acordos_extra" || tipo === "acordos_judiciais")
    return "/app/acordos";
  return "/app/importacoes";
}

function mensagemPorTipo(tipo: string, importados: number, criados = 0) {
  if (tipo === "cobrancas")
    return `Importação concluída: ${importados} cobranças importadas e ${criados} unidades criadas.`;
  if (tipo === "condominios")
    return `Importação concluída: ${importados} condomínios importados.`;
  if (tipo === "unidades")
    return `Importação concluída: ${importados} responsáveis importados.`;
  if (tipo === "acordos_extra" || tipo === "acordos_judiciais")
    return `Importação histórica concluída: ${importados} acordos importados e ${criados} parcelas reconstruídas.`;
  return `Importação concluída: ${importados} registros importados.`;
}


async function registrarAuditoriaImportacao(params: {
  supabase: SupabaseClient;
  importacaoId: string;
  tipo: string;
  evento: string;
  titulo: string;
  descricao?: string;
  payload?: Record<string, any>;
}) {
  const { supabase, importacaoId, tipo, evento, titulo, descricao, payload } = params;

  await supabase.from("auditoria_eventos").insert({
    carteira_id: null,
    entidade_tipo: "importacao",
    entidade_id: importacaoId,
    evento_tipo: evento,
    titulo,
    descricao: descricao ?? titulo,
    depois: {
      tipo,
      ...(payload ?? {}),
    },
  });
}

async function finalizarImportacao(params: {
  supabase: SupabaseClient;
  importacaoId: string;
  tipo: string;
  resultado: ImportacaoResultado;
}) {
  const { supabase, importacaoId, tipo, resultado } = params;

  const { error } = await supabase
    .from("importacoes")
    .update({
      status: resultado.sucesso ? "confirmada" : "erro",
      resumo: { resultado, finalizada_em: new Date().toISOString() },
    })
    .eq("id", importacaoId);

  if (error) throw new Error(`Erro ao concluir importação: ${error.message}`);

  await registrarAuditoriaImportacao({
    supabase,
    importacaoId,
    tipo,
    evento: "importacao.finalizada",
    titulo: resultado.sucesso ? "Importação confirmada" : "Importação finalizada com erro",
    descricao: resultado.mensagem,
    payload: { resultado },
  });

  revalidatePath("/app/importacoes");
  revalidatePath(`/app/importacoes/${importacaoId}`);
  revalidatePath("/app/cobrancas");
  revalidatePath("/app/condominios");
  revalidatePath("/app/unidades");
  revalidatePath("/app/responsaveis");
  revalidatePath("/app/acordos");
  revalidatePath("/app/pendencias");
  revalidatePath("/app");

  redirect(`/app/importacoes/${importacaoId}?resultado=${resultado.sucesso ? "sucesso" : "erro"}&tipo=${tipo}`);
}

function normalizeSimplePayload(
  tipo: string,
  rowPayload: Record<string, string>,
) {
  const legacy = tipo === "acordos_extra" || tipo === "acordos_judiciais";
  const parcelaRaw = rowPayload.parcela_atual ?? rowPayload.parcela ?? "";
  const quantidadeInformada = Number(rowPayload.quantidade_parcelas || 0);
  const parcelaReferencia = parseParcelaReferencia(parcelaRaw, quantidadeInformada);
  const quantidadeParcelas = quantidadeInformada || parcelaReferencia.total || 0;
  const vencimentoParcelaAtual = normalizeDate(
    rowPayload.vencimento_parcela_atual ?? rowPayload.vencimento_do_boleto ?? "",
  );
  const primeiroVencimentoInformado = normalizeDate(rowPayload.primeiro_vencimento ?? "");
  const primeiroVencimento = primeiroVencimentoInformado || (
    vencimentoParcelaAtual && parcelaReferencia.atual > 0
      ? subtractMonthsIso(vencimentoParcelaAtual, parcelaReferencia.atual - 1) ?? ""
      : ""
  );

  const payload = {
    ...rowPayload,
    cnpj: getDocumento(rowPayload, CONDOMINIO_CNPJ_KEYS, 14),
    condominio_cnpj: getDocumento(rowPayload, CONDOMINIO_CNPJ_KEYS, 14),
    data_acordo: normalizeDate(rowPayload.data_acordo ?? ""),
    primeiro_vencimento: primeiroVencimento,
    vencimento_parcela_atual: vencimentoParcelaAtual,
    periodo_negociado:
      rowPayload.periodo_negociado ??
      rowPayload.periodo ??
      rowPayload.competencias_negociadas ??
      "",
    parcela_atual: parcelaRaw,
    valor_original: legacy
      ? parseMoney(
          rowPayload.valor_original ??
            rowPayload.valor_cobranca ??
            rowPayload.valor_atualizado ??
            rowPayload.valor_total ??
            rowPayload.valor_acordado ??
            "",
        )
      : rowPayload.valor_original,
    despesa_cobranca_percentual: legacy
      ? parseMoney(
          rowPayload.despesa_cobranca_percentual ??
            rowPayload.despesa_percentual ??
            "",
        )
      : rowPayload.despesa_cobranca_percentual,
    despesa_cobranca_valor: legacy
      ? parseMoney(
          rowPayload.despesa_cobranca_valor ?? rowPayload.despesa_valor ?? "",
        )
      : rowPayload.despesa_cobranca_valor,
    valor_acordado: legacy
      ? parseMoney(rowPayload.valor_acordado ?? rowPayload.valor_total ?? "")
      : rowPayload.valor_acordado,
    entrada: legacy ? parseMoney(rowPayload.entrada ?? "") : rowPayload.entrada,
    valor_parcela_referencia: legacy
      ? parseMoney(
          rowPayload.valor_parcela_referencia ??
            rowPayload.valor_parcela ??
            rowPayload.boleto_do_mes ??
            "",
        )
      : rowPayload.valor_parcela_referencia,
    quantidade_parcelas: legacy ? quantidadeParcelas : rowPayload.quantidade_parcelas,
    parcela_atual_numero: legacy ? parcelaReferencia.atual : rowPayload.parcela_atual_numero,
    rateio_igual_confirmado: legacy
      ? yesLike(rowPayload.rateio_igual_confirmado)
      : rowPayload.rateio_igual_confirmado,
    composicao_acordo:
      rowPayload.composicao_acordo ?? rowPayload.composicao_do_acordo ?? "",
    status: rowPayload.status || (legacy ? ACORDO_STATUS.EM_DIA : rowPayload.status),
  };

  if (tipo === "condominios") return normalizeCondominioPayload(payload);
  if (tipo === "unidades") return normalizeUnidadePayload(payload);

  return payload;
}

export async function createImportacaoPreview(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);

  const tipo = String(formData.get("tipo") ?? "");
  if (tipo === "acordos_extra") await requireRole(["admin", "gestor"]);
  const condominioIdPadrao = String(formData.get("condominio_id_padrao") ?? "").trim();
  let importacaoId: string;

  try {
    importacaoId = await createImportacaoPreviewInternal(formData);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível gerar o preview da importação.";
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (condominioIdPadrao) params.set("condominio_id", condominioIdPadrao);
    params.set("erro", message);
    redirect(`/app/importacoes/nova?${params.toString()}`);
  }

  revalidatePath("/app/importacoes");
  redirect(`/app/importacoes/${importacaoId}`);
}

async function createImportacaoPreviewInternal(formData: FormData) {
  const tipo = String(formData.get("tipo") ?? "");
  const file = formData.get("arquivo");
  const recorteRegua = String(formData.get("recorte_regua") ?? "");
  const somenteValidasNaRegua =
    tipo === "cobrancas" &&
    (recorteRegua === "validas_na_regua" || recorteRegua === "mais_recentes");

  if (tipo === "acordos_judiciais")
    throw new Error("Importação histórica judicial permanece desativada.");

  if (!isValidImportType(tipo)) throw new Error("Tipo de importação inválido.");
  if (!(file instanceof File)) throw new Error("Arquivo obrigatório.");

  const buffer = await file.arrayBuffer();
  const condominioIdPadrao = String(
    formData.get("condominio_id_padrao") ?? "",
  ).trim();
  const parsedFile = parseImportFile(file.name, buffer);
  const parsedRows = parsedFile.rows;
  if (parsedRows.length === 0)
    throw new Error("Planilha XLSX vazia ou sem linhas válidas na aba de dados.");

  const supabase = await createClient();
  const scope = await getPermittedCarteiras();
  const condominioPadrao =
    tipo === "unidades" || tipo === "cobrancas"
      ? await resolveCondominioById(supabase, condominioIdPadrao)
      : null;

  if (condominioPadrao) {
    assertCarteiraPermitida(scope, condominioPadrao.carteira_id);
  }

  let itens: PreviewItem[];

  if (tipo === "cobrancas") {
    const rows = parsedRows.map((row) => ({
      linha: row.linha,
      payload: buildImportacaoPayload(tipo, row.payload, condominioPadrao),
    }));
    itens = await enrichCobrancaPreview(
      supabase,
      rows,
      condominioPadrao,
      somenteValidasNaRegua,
    );
  } else {
    const rows = parsedRows.map((row) => {
      const payload =
        tipo === "unidades"
          ? normalizeUnidadePayload(row.payload, condominioPadrao)
          : normalizeSimplePayload(tipo, row.payload);
      const erros = validateSimplePayload(tipo, payload);
      return {
        linha: row.linha,
        payload,
        valido: erros.length === 0,
        erros,
        alertas: [] as string[],
      };
    });

    itens = isLegacyImportType(tipo)
      ? await enrichLegacyPreview(supabase, tipo, rows)
      : await enrichSimplePreview(supabase, tipo, rows, condominioPadrao);
  }

  assertPayloadsPermitidos(
    scope,
    itens.map((item) => item.payload),
  );

  const carteiraIdsPreview = Array.from(
    new Set(
      itens
        .map((item) => String(item.payload.carteira_id ?? "").trim())
        .filter(Boolean),
    ),
  );
  const carteiraIdImportacao =
    condominioPadrao?.carteira_id ?? carteiraIdsPreview[0] ?? null;

  if (carteiraIdsPreview.length > 1 && scope.carteiraIds !== null) {
    throw new Error(
      "Importação com múltiplas carteiras deve ser separada em arquivos por carteira.",
    );
  }

  const totalValidas = itens.filter((item) => item.valido).length;
  const totalInvalidas = itens.length - totalValidas;
  const totalAlertas = itens.filter(
    (item) => (item.alertas ?? []).length > 0,
  ).length;
  const itensSelecionados = itens.filter(
    (item) => item.valido && item.payload.importar_cobranca !== false,
  );
  const totalSelecionadas = tipo === "cobrancas"
    ? itensSelecionados.length
    : totalValidas;
  const totalSomenteHistorico = tipo === "cobrancas"
    ? itens.filter((item) => item.valido && item.payload.importar_cobranca === false).length
    : isLegacyImportType(tipo)
      ? itens.filter((item) => item.valido && item.payload.somente_historico === true).length
      : 0;
  const valorTotalValido = itens
    .filter((item) => item.valido)
    .reduce(
      (sum, item) =>
        sum +
        Number(
          item.payload.valor_atualizado ??
            item.payload.valor_acordado ??
            item.payload.valor_original ??
            item.payload.valor_cota_condominial ??
            0,
        ),
      0,
    );
  const valorTotalSelecionado = itensSelecionados.reduce(
    (sum, item) => sum + Number(item.payload.valor_atualizado ?? item.payload.valor_original ?? 0),
    0,
  );
  const prioridadeAlta = itens.filter(
    (item) => item.payload.prioridade_estimada === "alta",
  ).length;
  const unidadesNovas = itens.filter(
    (item) => item.payload.unidade_nova,
  ).length;

  const { data: importacao, error } = await supabase
    .from("importacoes")
    .insert({
      carteira_id: carteiraIdsPreview.length <= 1 ? carteiraIdImportacao : null,
      tipo,
      arquivo_nome: file.name,
      status: "preview",
      total_linhas: itens.length,
      total_validas: totalValidas,
      total_invalidas: totalInvalidas,
      resumo: {
        formato: "xlsx",
        aba_processada: parsedFile.sheetName,
        valor_total_valido: valorTotalValido,
        valor_total_selecionado: tipo === "cobrancas" ? valorTotalSelecionado : valorTotalValido,
        linhas_selecionadas: totalSelecionadas,
        linhas_somente_historico: totalSomenteHistorico,
        prioridade_alta: prioridadeAlta,
        unidades_novas: unidadesNovas,
        linhas_com_alerta: totalAlertas,
        condominio_padrao_id: condominioPadrao?.id ?? null,
        condominio_padrao_nome: condominioPadrao?.nome ?? null,
        recorte_regua: tipo === "cobrancas"
          ? somenteValidasNaRegua ? "ja_na_regua" : "todos"
          : null,
        regra_chave: isLegacyImportType(tipo)
          ? "Acordos históricos: condomínio/unidade existentes, cobranças localizadas pelo período negociado, cobranças posteriores preservadas fora do acordo e gravação somente após confirmação."
          : tipo === "cobrancas"
            ? "Layout GKLI por recibo: usa condomínio selecionado/CNPJ quando houver, cruza unidade no banco e aceita multa, correção e juros opcionais."
            : "Linhas duplicadas ou com vínculo inseguro ficam bloqueadas no preview.",
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Erro ao criar importação: ${error.message}`);

  const { error: itensError } = await supabase.from("importacao_itens").insert(
    itens.map((item) => ({
      importacao_id: importacao.id,
      linha: item.linha,
      payload: item.payload,
      valido: item.valido,
      erros: [
        ...item.erros,
        ...(item.alertas ?? []).map((alerta: string) => `ALERTA: ${alerta}`),
      ],
    })),
  );

  if (itensError)
    throw new Error(`Erro ao criar itens da importação: ${itensError.message}`);

  await registrarAuditoriaImportacao({
    supabase,
    importacaoId: importacao.id,
    tipo,
    evento: "importacao.preview_gerado",
    titulo: "Preview de importação gerado",
    descricao: `Preview XLSX gerado com ${itens.length} linhas processadas.`,
    payload: {
      total_linhas: itens.length,
      total_validas: totalValidas,
      total_invalidas: totalInvalidas,
      total_alertas: totalAlertas,
      aba_processada: parsedFile.sheetName,
    },
  });

  return importacao.id as string;
}

export async function createImportacaoLegadoPreview() {
  throw new Error("Importações legadas foram desativadas.");
}

export async function limparHistoricoImportacoes() {
  await requireRole(["admin", "gestor", "operador"]);

  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  let idsQuery = supabase.from("importacoes").select("id");
  idsQuery = applyCarteiraScope(idsQuery, scope.carteiraIds);

  const { data: importacoes, error: selectError } = await idsQuery;
  if (selectError) {
    throw new Error(`Erro ao localizar histórico de importações: ${selectError.message}`);
  }

  const ids = (importacoes ?? [])
    .map((row: any) => row.id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

  if (!ids.length) {
    revalidatePath("/app/importacoes");
    return;
  }

  const { error: itensError } = await supabase
    .from("importacao_itens")
    .delete()
    .in("importacao_id", ids);

  if (itensError) {
    throw new Error(`Erro ao limpar itens do histórico: ${itensError.message}`);
  }

  const { error: importacoesError } = await supabase
    .from("importacoes")
    .delete()
    .in("id", ids);

  if (importacoesError) {
    throw new Error(`Erro ao limpar histórico de importações: ${importacoesError.message}`);
  }

  revalidatePath("/app/importacoes");
}

async function rollbackCreatedRows(
  supabase: SupabaseClient,
  created: { table: string; ids: string[] }[],
) {
  for (const item of [...created].reverse()) {
    if (item.ids.length === 0) continue;
    await supabase.from(item.table).delete().in("id", item.ids);
  }
}


async function buscarUnidadeExistente(
  supabase: SupabaseClient,
  params: { condominioId: string; identificacao: string; bloco?: string | null },
) {
  if (!params.condominioId || !params.identificacao) return null;

  let query = supabase
    .from("unidades")
    .select("id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email")
    .eq("condominio_id", params.condominioId)
    .eq("identificacao", params.identificacao);

  const bloco = String(params.bloco ?? "").trim();
  query = bloco ? query.eq("bloco", bloco) : query.is("bloco", null);

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(`Erro ao buscar unidade existente: ${error.message}`);
  return data as UnidadeImportacaoRow | null;
}

async function buscarResponsavelApoio(
  supabase: SupabaseClient,
  params: { condominioId: string; identificacao: string; bloco?: string | null; tipoResponsavel?: string | null },
) {
  if (!params.condominioId || !params.identificacao) return null;

  let query = supabase
    .from("responsaveis_unidades")
    .select("id, condominio_id, carteira_id, unidade, bloco, responsavel_nome, tipo_responsavel, responsavel_documento, telefone, email")
    .eq("condominio_id", params.condominioId)
    .eq("unidade", params.identificacao)
    .eq("ativo", true);

  if (params.tipoResponsavel) {
    query = query.eq("tipo_responsavel", normalizeTipoResponsavel(params.tipoResponsavel));
  }

  const bloco = String(params.bloco ?? "").trim();
  query = bloco ? query.eq("bloco", bloco) : query.is("bloco", null);

  const { data, error } = await query.limit(5);
  if (error)
    throw new Error(`Erro ao buscar responsavel de apoio: ${error.message}`);

  const rows = (data ?? []) as ResponsavelUnidadeApoioRow[];
  if (rows.length === 0) return null;

  return (
    rows.find((row) => row.tipo_responsavel === "proprietario") ??
    rows.find((row) => row.tipo_responsavel === "nao_informado") ??
    rows[0]
  );
}

function dadosUnidadeComApoio(
  payload: Record<string, any>,
  responsavelApoio: ResponsavelUnidadeApoioRow | null,
) {
  return {
    responsavel_nome:
      responsavelApoio?.responsavel_nome || payload.responsavel_nome || null,
    tipo_responsavel:
      responsavelApoio?.tipo_responsavel ||
      normalizeTipoResponsavel(payload.tipo_responsavel),
    responsavel_documento:
      responsavelApoio?.responsavel_documento ||
      payload.responsavel_documento ||
      null,
    telefone: responsavelApoio?.telefone || payload.telefone || null,
    email: responsavelApoio?.email || payload.email || null,
  };
}

async function garantirUnidadeDaImportacao(
  supabase: SupabaseClient,
  payload: Record<string, any>,
) {
  if (payload.unidade_id) {
    return { id: String(payload.unidade_id), criada: false, reutilizada: true };
  }

  const identificacao = String(payload.identificacao || payload.unidade || "").trim();
  if (!payload.condominio_id || !identificacao) {
    throw new Error("Linha sem condomínio ou identificação de unidade.");
  }

  const { data: condominioMascara, error: mascaraError } = await supabase
    .from("condominios")
    .select("mascara_unidade, mascara_bloco")
    .eq("id", payload.condominio_id)
    .maybeSingle();
  if (mascaraError) {
    throw new Error(`Erro ao validar a máscara do condomínio: ${mascaraError.message}`);
  }
  assertUnidadeMatchesMasks({
    identificacao,
    bloco: payload.bloco,
    mascaraUnidade: condominioMascara?.mascara_unidade,
    mascaraBloco: condominioMascara?.mascara_bloco,
  });

  const existente = await buscarUnidadeExistente(supabase, {
    condominioId: payload.condominio_id,
    identificacao,
    bloco: payload.bloco,
  });

  const responsavelApoio = await buscarResponsavelApoio(supabase, {
    condominioId: payload.condominio_id,
    identificacao,
    bloco: payload.bloco,
  });
  const dadosContato = dadosUnidadeComApoio(payload, responsavelApoio);

  if (existente) {
    const patch: Record<string, string> = {};
    if (!existente.responsavel_nome && dadosContato.responsavel_nome) {
      patch.responsavel_nome = dadosContato.responsavel_nome;
    }
    if (!existente.responsavel_documento && dadosContato.responsavel_documento) {
      patch.responsavel_documento = dadosContato.responsavel_documento;
    }
    if (!existente.telefone && dadosContato.telefone) {
      patch.telefone = dadosContato.telefone;
    }
    if (!existente.email && dadosContato.email) {
      patch.email = dadosContato.email;
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("unidades").update(patch).eq("id", existente.id);
    }

    return { id: existente.id, criada: false, reutilizada: true };
  }

  const { data: novaUnidade, error: unidadeError } = await supabase
    .from("unidades")
    .insert({
      carteira_id: payload.carteira_id,
      condominio_id: payload.condominio_id,
      identificacao,
      bloco: payload.bloco || null,
      responsavel_nome: dadosContato.responsavel_nome,
      responsavel_documento: dadosContato.responsavel_documento,
      telefone: dadosContato.telefone,
      email: dadosContato.email,
      status: "ativa",
      observacoes: "Criada por importação de cobranças.",
    })
    .select("id")
    .single();

  if (!unidadeError && novaUnidade?.id) {
    return { id: novaUnidade.id as string, criada: true, reutilizada: false };
  }

  // Defesa final para corrida/preview desatualizado: se o banco recusou por duplicidade,
  // busca novamente e reaproveita a unidade em vez de derrubar o lote inteiro.
  const unidadeAposConflito = await buscarUnidadeExistente(supabase, {
    condominioId: payload.condominio_id,
    identificacao,
    bloco: payload.bloco,
  });

  if (unidadeAposConflito) {
    return { id: unidadeAposConflito.id, criada: false, reutilizada: true };
  }

  throw new Error(unidadeError?.message ?? "Erro desconhecido ao criar unidade.");
}

async function importarCobrancas(
  supabase: SupabaseClient,
  payloads: Record<string, any>[],
  origemImportacao: string,
): Promise<ImportExecutionResult> {
  const resultado = emptyImportExecutionResult();
  const importadasParaAusencia: CobrancaImportadaConciliacao[] = [];

  for (const [index, payload] of payloads.entries()) {
    const linha = Number(payload.__linha ?? index + 1);

    try {
      const recorteAnoCorrente = avaliarRecorteAnoCorrente(payload.vencimento);
      if (!recorteAnoCorrente.dentroDoAnoCorrente) {
        resultado.ignorados += 1;
        resultado.erros.push(
          `Linha ${linha}: cobrança mantida apenas no histórico da importação. ${recorteAnoCorrente.motivo}`,
        );
        continue;
      }

      const unidade = await garantirUnidadeDaImportacao(supabase, payload);
      payload.unidade_id = unidade.id;
      if (unidade.criada) resultado.criados += 1;

      payload.observacoes = observacoesComRecibo(payload);
      const importadaConciliacao: CobrancaImportadaConciliacao = {
        carteira_id: payload.carteira_id,
        condominio_id: payload.condominio_id,
        unidade_id: payload.unidade_id,
        competencia: payload.competencia || null,
        vencimento: payload.vencimento || null,
        valor_original: payload.valor_original,
        valor_atualizado: payload.valor_atualizado,
        recibo: payload.recibo || null,
        referencia: payload.referencia || null,
        observacoes: payload.observacoes || null,
      };
      importadasParaAusencia.push(importadaConciliacao);

      const conciliacao = await conciliarCobrancaImportada(supabase, importadaConciliacao);
      const cobrancaExistenteId = conciliacao.cobrancaId;
      if (conciliacao.status === "ja_existente") {
        resultado.ignorados += 1;
        resultado.erros.push(
          `Linha ${linha}: cobrança já existia e foi ignorada (${cobrancaExistenteId}).`,
        );
        continue;
      }

      if (conciliacao.status === "divergente") {
        resultado.divergentes += 1;
        resultado.ignorados += 1;
        resultado.erros.push(
          `Linha ${linha}: ${conciliacao.motivo} (${conciliacao.cobrancaId}).`,
        );
        continue;
      }

      if (payload.importar_cobranca === false) {
        resultado.ignorados += 1;
        resultado.erros.push(
          `Linha ${linha}: cobrança mantida apenas no histórico da importação. ${payload.motivo_prioridade ?? "Vencimento fora da régua de cobrança."}`,
        );
        continue;
      }

      const statusCalculado = await statusOperacionalParaCobrancaImportada(supabase, payload);
      const statusOperacional = statusComBloqueioGarantidora(statusCalculado, Boolean(payload.bloqueio_garantidora));

      const { error } = await supabase.from("cobrancas").insert({
        carteira_id: payload.carteira_id,
        condominio_id: payload.condominio_id,
        unidade_id: payload.unidade_id,
        competencia: payload.competencia || null,
        vencimento: payload.vencimento,
        valor_original: Number(payload.valor_original),
        valor_atualizado: Number(payload.valor_atualizado || payload.valor_original),
        multa: Number(payload.multa || 0),
        correcao: Number(payload.correcao || 0),
        juros: Number(payload.juros || 0),
        status: statusOperacional,
        status_operacional: statusOperacional,
        status_financeiro: "em_aberto",
        observacoes: observacaoComBloqueioGarantidora(payload.observacoes, Boolean(payload.bloqueio_garantidora)),
        origem_importacao: origemImportacao,
        importacao_id: payload.importacao_id || null,
      });

      if (error) {
        resultado.erros.push(`Linha ${linha}: ${error.message}`);
        resultado.ignorados += 1;
        continue;
      }

      resultado.importados += 1;
    } catch (error) {
      resultado.erros.push(
        `Linha ${linha}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
      resultado.ignorados += 1;
    }
  }

  try {
    const condominioIds = Array.from(
      new Set(importadasParaAusencia.map((item) => item.condominio_id).filter(Boolean) as string[]),
    );
    const carteiraIds = Array.from(
      new Set(payloads.map((payload) => String(payload.carteira_id ?? "").trim()).filter(Boolean)),
    );
    const ausentes = await encontrarCobrancasAbertasAusentes(supabase, {
      condominioIds,
      carteiraId: carteiraIds.length === 1 ? carteiraIds[0] : null,
      importadas: importadasParaAusencia,
    });

    resultado.ausentes = ausentes.total;
    resultado.erros.push(...ausentes.mensagens);

    if (ausentes.ausentes.length > 0) {
      const pendencias = await registrarPendenciasCobrancasAusentes(createAdminClient(), {
        ausentes: ausentes.ausentes,
      });
      if (pendencias.criadas > 0) {
        resultado.erros.push(
          `ALERTA: ${pendencias.criadas} pendência(s) criada(s) para cobranças abertas ausentes no relatório.`,
        );
      }
    }
  } catch (error) {
    resultado.erros.push(
      `ALERTA: Não foi possível validar cobranças abertas ausentes no relatório: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    );
  }

  return resultado;
}

async function importarCondominios(
  supabase: SupabaseClient,
  payloads: Record<string, any>[],
): Promise<ImportExecutionResult> {
  const resultado = emptyImportExecutionResult();

  for (const [index, rawPayload] of payloads.entries()) {
    const linha = Number(rawPayload.__linha ?? index + 1);
    const payload = normalizeCondominioPayload(rawPayload);
    const cnpj = normalizeCnpj(payload.cnpj);

    try {
      if (!payload.carteira_id) throw new Error("carteira_id ausente");
      if (!payload.nome) throw new Error("nome do condomínio ausente");

      let existente = null as { id: string } | null;
      if (cnpj) {
        const { data, error } = await supabase
          .from("condominios")
          .select("id")
          .eq("cnpj", cnpj)
          .maybeSingle();
        if (error) throw error;
        existente = data as { id: string } | null;
      }

      if (existente?.id) {
        const { error } = await supabase
          .from("condominios")
          .update({
            nome: payload.nome,
            nome_operacional: payload.nome_operacional || payload.nome,
            endereco_logradouro: payload.endereco_logradouro || null,
            endereco_numero: payload.endereco_numero || null,
            endereco_complemento: payload.endereco_complemento || null,
            endereco_bairro: payload.endereco_bairro || null,
            endereco_cidade: payload.endereco_cidade || null,
            endereco_uf: payload.endereco_uf || null,
            endereco_cep: payload.endereco_cep || null,
            administradora: payload.administradora || null,
            sindico_email: payload.sindico_email || null,
            sindico_celular: payload.sindico_celular || null,
            gerente_email: payload.gerente_email || null,
            gerente_celular: payload.gerente_celular || null,
            vencimento_cota_dia: Number(payload.vencimento_cota_dia),
            valor_cota_condominial: Number(payload.valor_cota_condominial || 0),
            inicio_cobranca_dias: Number(payload.inicio_cobranca_dias),
            dias_expiracao_regua_pre_juridico: payload.dias_expiracao_regua_pre_juridico ?? null,
            parcelas_acordo_sem_aprovacao_sindico: Number(payload.parcelas_acordo_sem_aprovacao_sindico || 0),
            dias_reemissao_parcela_acordo_atrasada: Number(payload.dias_reemissao_parcela_acordo_atrasada || 0),
            classificacao_operacional: payload.classificacao_operacional || "prata",
            status: payload.status || "ativo",
            observacoes: payload.observacoes || null,
          })
          .eq("id", existente.id);

        if (error) throw error;
        resultado.atualizados += 1;
        continue;
      }

      const { error } = await supabase.from("condominios").insert({
        carteira_id: payload.carteira_id,
        nome: payload.nome,
        nome_operacional: payload.nome_operacional || payload.nome,
        cnpj,
        endereco_logradouro: payload.endereco_logradouro || null,
        endereco_numero: payload.endereco_numero || null,
        endereco_complemento: payload.endereco_complemento || null,
        endereco_bairro: payload.endereco_bairro || null,
        endereco_cidade: payload.endereco_cidade || null,
        endereco_uf: payload.endereco_uf || null,
        endereco_cep: payload.endereco_cep || null,
        administradora: payload.administradora || null,
        sindico_email: payload.sindico_email || null,
        sindico_celular: payload.sindico_celular || null,
        gerente_email: payload.gerente_email || null,
        gerente_celular: payload.gerente_celular || null,
        vencimento_cota_dia: Number(payload.vencimento_cota_dia),
        valor_cota_condominial: Number(payload.valor_cota_condominial || 0),
        inicio_cobranca_dias: Number(payload.inicio_cobranca_dias),
        dias_expiracao_regua_pre_juridico: payload.dias_expiracao_regua_pre_juridico ?? null,
        parcelas_acordo_sem_aprovacao_sindico: Number(payload.parcelas_acordo_sem_aprovacao_sindico || 0),
        dias_reemissao_parcela_acordo_atrasada: Number(payload.dias_reemissao_parcela_acordo_atrasada || 0),
        classificacao_operacional: payload.classificacao_operacional || "prata",
        status: payload.status || "ativo",
        observacoes: payload.observacoes || null,
      });

      if (error) throw error;
      resultado.importados += 1;
    } catch (error) {
      resultado.erros.push(
        `Linha ${linha}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
      resultado.ignorados += 1;
    }
  }

  return resultado;
}

async function importarResponsaveisUnidades(
  supabase: SupabaseClient,
  payloads: Record<string, any>[],
): Promise<ImportExecutionResult> {
  const resultado = emptyImportExecutionResult();

  for (const [index, payload] of payloads.entries()) {
    const linha = Number(payload.__linha ?? index + 1);
    const identificacao = String(payload.identificacao || payload.unidade || "").trim();

    try {
      if (!payload.carteira_id || !payload.condominio_id)
        throw new Error("condomínio/carteira ausente");
      if (!identificacao) throw new Error("identificação ausente");

      const tipoResponsavel = normalizeTipoResponsavel(payload.tipo_responsavel);
      const existente = await buscarResponsavelApoio(supabase, {
        condominioId: payload.condominio_id,
        identificacao,
        bloco: payload.bloco,
        tipoResponsavel,
      });

      const ativo = normalizeUnidadeStatus(payload.status) !== "inativa";
      const values = {
        carteira_id: payload.carteira_id,
        condominio_id: payload.condominio_id,
        unidade: identificacao,
        bloco: payload.bloco || null,
        responsavel_nome: payload.responsavel_nome || null,
        tipo_responsavel: tipoResponsavel,
        responsavel_documento: onlyDigits(
          payload.responsavel_documento || payload.cpf || payload.documento || "",
        ),
        telefone: onlyDigits(payload.telefone || payload.celular || payload.whatsapp || ""),
        email: normalizeEmail(payload.email),
        ativo,
        origem: "importacao_unidades",
        observacoes: payload.observacoes || null,
        updated_at: new Date().toISOString(),
      };

      if (existente?.id) {
        const { error } = await supabase.from("responsaveis_unidades").update(values).eq("id", existente.id);
        if (error) throw error;
        await sincronizarResponsavelComUnidadeOperacional(supabase, {
          carteiraId: values.carteira_id,
          condominioId: values.condominio_id,
          unidade: values.unidade,
          bloco: values.bloco,
          responsavelNome: values.responsavel_nome,
          responsavelDocumento: values.responsavel_documento,
          telefone: values.telefone,
          email: values.email,
          ativo,
        });
        resultado.atualizados += 1;
        continue;
      }

      const { error } = await supabase.from("responsaveis_unidades").insert(values);
      if (error) throw error;
      await sincronizarResponsavelComUnidadeOperacional(supabase, {
        carteiraId: values.carteira_id,
        condominioId: values.condominio_id,
        unidade: values.unidade,
        bloco: values.bloco,
        responsavelNome: values.responsavel_nome,
        responsavelDocumento: values.responsavel_documento,
        telefone: values.telefone,
        email: values.email,
        ativo,
      });
      resultado.importados += 1;
    } catch (error) {
      resultado.erros.push(
        `Linha ${linha}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
      resultado.ignorados += 1;
    }
  }

  return resultado;
}

async function importarLegados(
  supabase: SupabaseClient,
  tipo: string,
  payloads: Record<string, any>[],
) {
  let importados = 0;
  let parcelasCriadas = 0;
  const erros: string[] = [];

  for (const [index, payload] of payloads.entries()) {
    const linha = Number(payload.__linha ?? index + 1);
    const tipoAcordo = tipo === "acordos_judiciais" ? "judicial" : "extrajudicial";

    try {
      if (tipoAcordo === "judicial") {
        throw new Error("Importação histórica judicial permanece desativada");
      }
      if (!payload.carteira_id || !payload.condominio_id || !payload.unidade_id) {
        throw new Error("Carteira, condomínio e unidade são obrigatórios");
      }

      const cobrancas = Array.isArray(payload.cobrancas_acordo)
        ? payload.cobrancas_acordo
        : [];
      const parcelas = Array.isArray(payload.parcelas_importacao)
        ? payload.parcelas_importacao
        : [];

      if (parcelas.length === 0) {
        throw new Error("Nenhuma parcela histórica calculada para o acordo");
      }

      const calculo = calcularValorAcordoHistorico(payload);
      const valorAcordado = calculo.valorAcordado;
      const somaBase = roundMoney(
        cobrancas.reduce(
          (total: number, cobranca: any) =>
            total + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
          0,
        ),
      );

      let totalAlocado = 0;
      const itensAcordo = cobrancas.map((cobranca: any, itemIndex: number) => {
        const base = Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0);
        const proporcao = somaBase > 0 ? base / somaBase : 1 / cobrancas.length;
        const valorTotal = itemIndex === cobrancas.length - 1
          ? roundMoney(valorAcordado - totalAlocado)
          : roundMoney(valorAcordado * proporcao);
        totalAlocado = roundMoney(totalAlocado + valorTotal);

        return {
          cobranca_id: cobranca.id,
          valor_original_no_acordo: Number(cobranca.valor_original ?? 0),
          valor_atualizado_no_acordo: base,
          encargos_no_acordo: roundMoney(Math.max(0, valorTotal - base)),
          valor_total_no_acordo: Math.max(0, valorTotal),
        };
      });

      const observacoesBase = [
        String(payload.observacoes ?? "").trim(),
        "Importado como acordo histórico; sem disparo de termo, e-mail ou solicitação de boleto.",
        cobrancas.length === 0
          ? "Importado sem vínculo de cobranças porque o período histórico não possui cobrança canônica disponível no COB; cobranças atuais não foram alteradas."
          : "",
        payload.periodo_negociado ? `Período negociado: ${payload.periodo_negociado}.` : "",
        payload.parcela_atual ? `Parcela de referência: ${payload.parcela_atual}.` : "",
        payload.composicao_acordo ? `Composição original: ${payload.composicao_acordo}.` : "",
      ].filter(Boolean).join(" ");

      let acordoId = "";
      const principal = itensAcordo[0];
      const parcelasBanco = parcelas.map((parcela: any) => {
        const status = String(parcela.status || PARCELA_ACORDO_STATUS.PENDENTE);
        const paga = status === PARCELA_ACORDO_STATUS.PAGA;
        return {
          numero: parcela.numero,
          tipo_parcela: parcela.tipo_parcela || "parcela",
          valor: parcela.valor,
          vencimento: parcela.vencimento,
          status,
          // A planilha histórica informa a posição da parcela, mas não a data real
          // de cada pagamento anterior. Para satisfazer a integridade de
          // parcelas_acordo e preservar a cronologia histórica, usamos o próprio
          // vencimento como data de pagamento reconstruída somente nas parcelas
          // marcadas como pagas.
          data_pagamento: paga ? parcela.vencimento : null,
        };
      });

      const { data: acordo, error: acordoError } = await supabase
        .from("acordos")
        .insert({
          carteira_id: payload.carteira_id,
          cobranca_id: principal?.cobranca_id || null,
          condominio_id: payload.condominio_id,
          unidade_id: payload.unidade_id,
          tipo: tipoAcordo,
          numero_processo: null,
          valor_acordado: valorAcordado,
          entrada: Number(payload.entrada ?? 0),
          despesa_cobranca_percentual: calculo.despesaPercentual,
          despesa_cobranca_valor: calculo.despesaValor,
          data_acordo: payload.data_acordo,
          status: ACORDO_STATUS.EM_DIA,
          fluxo_status: "acordo_efetivado",
          exige_aprovacao_sindico: false,
          documento_url: payload.documento_url || null,
          observacoes: [
            observacoesBase,
            parcelasBanco.some((parcela: any) => parcela.data_pagamento)
              ? "Datas de pagamento anteriores reconstruídas pela data de vencimento, pois a fonte histórica informa a posição da parcela e não a data efetiva de cada pagamento."
              : "",
          ].filter(Boolean).join(" "),
        })
        .select("id")
        .single();

      if (acordoError || !acordo?.id) {
        throw new Error(
          `Erro ao criar acordo histórico: ${acordoError?.message ?? "acordo não retornado"}`,
        );
      }

      acordoId = String(acordo.id);

      if (itensAcordo.length > 0) {
        const { error: itensError } = await supabase.from("acordo_cobrancas").insert(
          itensAcordo.map((item: any) => ({
            acordo_id: acordoId,
            ...item,
          })),
        );

        if (itensError) {
          await supabase.from("acordos").delete().eq("id", acordoId);
          throw new Error(`Erro ao vincular cobranças ao acordo histórico: ${itensError.message}`);
        }
      }

      const { error: parcelasError } = await supabase.from("parcelas_acordo").insert(
        parcelasBanco.map((parcela: any) => ({
          acordo_id: acordoId,
          ...parcela,
        })),
      );

      if (parcelasError) {
        await supabase.from("acordos").delete().eq("id", acordoId);
        throw new Error(`Erro ao criar parcelas do acordo histórico: ${parcelasError.message}`);
      }

      const parcelasPagas = parcelas.filter(
        (parcela: any) => String(parcela.status) === PARCELA_ACORDO_STATUS.PAGA,
      ).length;

      const { error: updateError } = await supabase
        .from("acordos")
        .update({
          quantidade_parcelas: Number(payload.quantidade_parcelas || parcelas.length),
          status_financeiro: parcelasPagas > 0 ? "parcial" : "em_aberto",
          fluxo_status: "acordo_efetivado",
        })
        .eq("id", acordoId);

      if (updateError) {
        await supabase.from("acordos").delete().eq("id", acordoId);
        throw new Error(`Erro ao finalizar metadados do acordo: ${updateError.message}`);
      }

      if (cobrancas.length > 0) {
        const cobrancaIds = cobrancas.map((cobranca: any) => cobranca.id).filter(Boolean);
        const { error: cobrancasError } = await supabase
          .from("cobrancas")
          .update({
            status: COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
            status_operacional: COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
          })
          .in("id", cobrancaIds);

        if (cobrancasError) {
          await supabase.from("acordos").delete().eq("id", acordoId);
          throw new Error(`Erro ao atualizar cobranças do acordo histórico: ${cobrancasError.message}`);
        }
      }

      await registrarAuditoriaImportacao({
        supabase,
        importacaoId: String(payload.importacao_id ?? ""),
        tipo,
        evento: "acordo.historico_importado",
        titulo: "Acordo histórico importado",
        descricao: `Acordo ${acordoId} importado com ${cobrancas.length} cobrança(s) do período negociado e ${parcelas.length} parcela(s).`,
        payload: {
          acordo_id: acordoId,
          unidade_id: payload.unidade_id,
          periodo_negociado: payload.periodo_negociado,
          cobranca_ids: cobrancas.map((cobranca: any) => cobranca.id),
          cobrancas_posteriores_ignoradas: Number(payload.quantidade_cobrancas_posteriores || 0),
          parcela_atual: payload.parcela_atual,
          parcelas_pagas: parcelasPagas,
        },
      });

      parcelasCriadas += parcelas.length;
      importados += 1;
    } catch (error) {
      erros.push(
        `Linha ${linha}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
    }
  }

  return { importados, criados: parcelasCriadas, erros };
}

export async function confirmarImportacao(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);

  const importacaoId = String(formData.get("importacao_id") ?? "");
  const limparCobrancasAnteriores =
    formData.get("limpar_cobrancas_anteriores") === "on";
  if (!importacaoId) throw new Error("Importação obrigatória.");

  const supabase = await createClient();

  const { data: importacao, error: importacaoError } = await supabase
    .from("importacoes")
    .select(
      "id, carteira_id, tipo, status, total_linhas, total_validas, total_invalidas, resumo",
    )
    .eq("id", importacaoId)
    .maybeSingle();

  if (importacaoError)
    throw new Error(`Erro ao carregar importação: ${importacaoError.message}`);
  if (!importacao) throw new Error("Importação não encontrada.");
  if (importacao.status === "confirmada")
    throw new Error("Importação já concluída.");
  if (!isValidImportType(importacao.tipo))
    throw new Error("Tipo de importação inválido.");

  if (importacao.tipo === "acordos_judiciais")
    throw new Error("Importação histórica judicial permanece desativada.");
  if (importacao.tipo === "acordos_extra") await requireRole(["admin", "gestor"]);

  const { data: itens, error: itensError } = await supabase
    .from("importacao_itens")
    .select("linha, payload, erros")
    .eq("importacao_id", importacaoId)
    .eq("valido", true);

  if (itensError)
    throw new Error(`Erro ao carregar itens válidos: ${itensError.message}`);

  const payloads = (itens ?? []).map((item: any, index: number) => ({
    ...item.payload,
    importacao_id: importacaoId,
    __linha: item.linha ?? item.payload?.__linha ?? index + 1,
  }));
  if (payloads.length === 0)
    throw new Error("Não há itens válidos para importar.");

  const scope = await getPermittedCarteiras();
  if ((importacao as any).carteira_id) {
    assertCarteiraPermitida(scope, (importacao as any).carteira_id);
  }
  assertPayloadsPermitidos(scope, payloads);

  let execucao = emptyImportExecutionResult();
  const origemImportacao = formatOrigemImportacao("importacao_cobrancas");
  let cobrancasAnterioresRemovidas = 0;

  if (importacao.tipo === "cobrancas") {
    if (limparCobrancasAnteriores) {
      cobrancasAnterioresRemovidas = await limparCobrancasNovasAnteriores(
        supabase,
        payloads,
      );
    }
    execucao = await importarCobrancas(supabase, payloads, origemImportacao);
  }

  if (importacao.tipo === "condominios") {
    execucao = await importarCondominios(supabase, payloads);
  }

  if (importacao.tipo === "unidades") {
    execucao = await importarResponsaveisUnidades(supabase, payloads);
  }

  if (isLegacyImportType(importacao.tipo)) {
    const resultadoLegado = await importarLegados(
      supabase,
      importacao.tipo,
      payloads,
    );
    execucao = {
      importados: resultadoLegado.importados,
      criados: resultadoLegado.criados,
      atualizados: 0,
      divergentes: 0,
      ausentes: 0,
      ignorados: Math.max(0, payloads.length - resultadoLegado.importados),
      erros: resultadoLegado.erros,
    };
  }

  const totalGravado = execucao.importados + execucao.atualizados;
  const resultado: ImportacaoResultado = {
    sucesso: totalGravado > 0 || execucao.erros.length === 0,
    tipo: importacao.tipo,
    mensagem: mensagemPorTipo(importacao.tipo, execucao.importados, execucao.criados),
    importados: execucao.importados,
    criados: execucao.criados,
    ignorados: execucao.ignorados,
    erros: execucao.erros,
    destino: destinoPorTipo(importacao.tipo),
  };

  if (cobrancasAnterioresRemovidas > 0) {
    resultado.mensagem += ` ${cobrancasAnterioresRemovidas} cobrança(s) anterior(es) com status Novo foram removidas.`;
  }

  (resultado as any).atualizados = execucao.atualizados;
  (resultado as any).divergentes = execucao.divergentes;
  (resultado as any).ausentes = execucao.ausentes;
  (resultado as any).cobrancas_anteriores_removidas =
    cobrancasAnterioresRemovidas;

  await finalizarImportacao({
    supabase,
    importacaoId,
    tipo: importacao.tipo,
    resultado,
  });
}

export async function confirmarImportacaoLegado(formData: FormData) {
  return confirmarImportacao(formData);
}
