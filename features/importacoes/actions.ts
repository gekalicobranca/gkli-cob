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
import {
  conciliarCobrancaImportada,
  encontrarCobrancasAbertasAusentes,
  registrarPendenciasCobrancasAusentes,
  type CobrancaImportadaConciliacao,
} from "./cobrancas-conciliacao";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CondominioImportacaoRow = {
  id: string;
  carteira_id: string;
  nome: string;
  cnpj: string | null;
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
const VALOR_COTA_KEYS = [
  "valor_cota_condominial",
  "valor_da_cota",
  "valor_cota",
  "cota",
  "cota_condominial",
];

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
  return {
    ...payload,
    nome: getFirst(payload, CONDOMINIO_NOME_KEYS) || payload.nome,
    cnpj: getDocumento(payload, CONDOMINIO_CNPJ_KEYS, 14),
    vencimento_cota_dia: toPositiveNumber(
      getFirst(payload, VENCIMENTO_COTA_KEYS),
      10,
    ),
    inicio_cobranca_dias: toPositiveNumber(
      getFirst(payload, INICIO_COBRANCA_KEYS),
      30,
    ),
    valor_cota_condominial: parseMoney(
      getFirst(payload, VALOR_COTA_KEYS) || payload.valor_cota_condominial,
    ),
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
    .select("id, carteira_id, nome, cnpj")
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
    .select("id, carteira_id, nome, cnpj")
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

  const { data, error } = await supabase
    .from("unidades")
    .select(
      "id, condominio_id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email",
    )
    .in("condominio_id", ids.length > 0 ? ids : [EMPTY_UUID]);

  if (error) throw new Error(`Erro ao consultar unidades: ${error.message}`);

  return new Map<string, UnidadeImportacaoRow>(
    ((data ?? []) as UnidadeImportacaoRow[]).map((unidade) => [
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

  const { data, error } = await supabase
    .from("responsaveis_unidades")
    .select(
      "id, condominio_id, carteira_id, unidade, bloco, responsavel_nome, responsavel_documento, telefone, email",
    )
    .eq("ativo", true)
    .in("condominio_id", ids.length > 0 ? ids : [EMPTY_UUID]);

  if (error)
    throw new Error(`Erro ao consultar responsáveis de apoio: ${error.message}`);

  return new Map<string, ResponsavelUnidadeApoioRow>(
    ((data ?? []) as ResponsavelUnidadeApoioRow[]).map((responsavel) => [
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
    if (!payload.carteira_id) erros.push("Carteira vazia");
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
      payload.valor_original ??
        payload.valor_cobranca ??
        payload.valor_atualizado ??
        payload.valor_acordado,
    );
    if (valorBaseAcordo <= 0) erros.push("Valor original da cobrança inválido");
    if (Number(payload.quantidade_parcelas || 0) <= 0)
      erros.push("Quantidade de parcelas inválida");
    if (!payload.primeiro_vencimento) erros.push("Primeiro vencimento vazio");
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
        acao_sugerida: priority.acao,
        motivo_prioridade: priority.motivo,
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

  return rows.map((row) => {
    const payload = { ...row.payload };
    const erros = [...row.erros];
    const alertas = [...(row.alertas ?? [])];
    const condominioCnpj = cnpjKeyFromPayload(payload);
    const condominio = condominiosByCnpj.get(condominioCnpj);

    if (!condominio) erros.push("Condomínio não encontrado pelo CNPJ");

    const identificacao = payload.unidade || payload.identificacao;
    const unidade =
      condominio && identificacao
        ? unidadesByKey.get(
            unidadeKey({
              condominio_id: condominio.id,
              identificacao,
              bloco: payload.bloco,
            }),
          )
        : undefined;

    if (!unidade) erros.push("Unidade não encontrada para vínculo do legado");

    const calculo = calcularValorAcordoComDespesa(payload);
    const valorAcordado = calculo.valorAcordado;
    const entrada = Number(payload.entrada ?? 0);
    const quantidadeParcelas = Number(payload.quantidade_parcelas || 0);

    if (entrada > valorAcordado)
      erros.push("Entrada maior que o valor acordado");
    if (quantidadeParcelas > 60)
      alertas.push(
        "Acordo com mais de 60 parcelas; confira se a planilha XLSX está correta",
      );

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
        responsavel_nome:
          payload.responsavel_nome || unidade?.responsavel_nome || null,
        prioridade_estimada: erros.length ? "bloqueada" : "baixa",
        score_estimado: erros.length ? 0 : 20,
        acao_sugerida: erros.length
          ? "Corrigir vínculo antes de importar"
          : "Importar acordo legado e gerar parcelas",
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
    return `Importação legada concluída: ${importados} acordos importados e ${criados} parcelas criadas.`;
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

  redirect(`/app/importacoes/${importacaoId}?resultado=sucesso&tipo=${tipo}`);
}

function normalizeSimplePayload(
  tipo: string,
  rowPayload: Record<string, string>,
) {
  const payload = {
    ...rowPayload,
    cnpj: getDocumento(rowPayload, CONDOMINIO_CNPJ_KEYS, 14),
    condominio_cnpj: getDocumento(rowPayload, CONDOMINIO_CNPJ_KEYS, 14),
    data_acordo: normalizeDate(rowPayload.data_acordo ?? ""),
    primeiro_vencimento: normalizeDate(rowPayload.primeiro_vencimento ?? ""),
    valor_original:
      tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? parseMoney(
            rowPayload.valor_original ??
              rowPayload.valor_cobranca ??
              rowPayload.valor_atualizado ??
              rowPayload.valor_acordado ??
              "",
          )
        : rowPayload.valor_original,
    despesa_cobranca_percentual:
      tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? parseMoney(
            rowPayload.despesa_cobranca_percentual ??
              rowPayload.despesa_percentual ??
              "",
          )
        : rowPayload.despesa_cobranca_percentual,
    despesa_cobranca_valor:
      tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? parseMoney(
            rowPayload.despesa_cobranca_valor ?? rowPayload.despesa_valor ?? "",
          )
        : rowPayload.despesa_cobranca_valor,
    valor_acordado:
      tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? parseMoney(rowPayload.valor_acordado ?? "")
        : rowPayload.valor_acordado,
    entrada:
      tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? parseMoney(rowPayload.entrada ?? "")
        : rowPayload.entrada,
    quantidade_parcelas:
      tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? Number(rowPayload.quantidade_parcelas || 0)
        : rowPayload.quantidade_parcelas,
    status:
      rowPayload.status ||
      (tipo === "acordos_extra" || tipo === "acordos_judiciais"
        ? "ativo"
        : rowPayload.status),
  };

  if (tipo === "condominios") return normalizeCondominioPayload(payload);
  if (tipo === "unidades") return normalizeUnidadePayload(payload);

  return payload;
}

export async function createImportacaoPreview(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);

  const tipo = String(formData.get("tipo") ?? "");
  const file = formData.get("arquivo");

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
    itens = await enrichCobrancaPreview(supabase, rows, condominioPadrao);
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
        prioridade_alta: prioridadeAlta,
        unidades_novas: unidadesNovas,
        linhas_com_alerta: totalAlertas,
        condominio_padrao_id: condominioPadrao?.id ?? null,
        condominio_padrao_nome: condominioPadrao?.nome ?? null,
        regra_chave: isLegacyImportType(tipo)
          ? "Legados exigem condomínio e unidade existentes; acordo e parcelas são criados somente na confirmação."
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

  revalidatePath("/app/importacoes");
  redirect(`/app/importacoes/${importacao.id}`);
}

export async function createImportacaoLegadoPreview(formData: FormData) {
  return createImportacaoPreview(formData);
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
  params: { condominioId: string; identificacao: string; bloco?: string | null },
) {
  if (!params.condominioId || !params.identificacao) return null;

  let query = supabase
    .from("responsaveis_unidades")
    .select("id, condominio_id, carteira_id, unidade, bloco, responsavel_nome, responsavel_documento, telefone, email")
    .eq("condominio_id", params.condominioId)
    .eq("unidade", params.identificacao)
    .eq("ativo", true);

  const bloco = String(params.bloco ?? "").trim();
  query = bloco ? query.eq("bloco", bloco) : query.is("bloco", null);

  const { data, error } = await query.maybeSingle();
  if (error)
    throw new Error(`Erro ao buscar responsavel de apoio: ${error.message}`);

  return data as ResponsavelUnidadeApoioRow | null;
}

function dadosUnidadeComApoio(
  payload: Record<string, any>,
  responsavelApoio: ResponsavelUnidadeApoioRow | null,
) {
  return {
    responsavel_nome:
      responsavelApoio?.responsavel_nome || payload.responsavel_nome || null,
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
): Promise<ImportExecutionResult> {
  const resultado = emptyImportExecutionResult();
  const importadasParaAusencia: CobrancaImportadaConciliacao[] = [];

  for (const [index, payload] of payloads.entries()) {
    const linha = Number(payload.__linha ?? index + 1);

    try {
      const unidade = await garantirUnidadeDaImportacao(supabase, payload);
      payload.unidade_id = unidade.id;
      if (unidade.criada) resultado.criados += 1;

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
          `Linha ${linha}: cobranca parecida encontrada com divergencia de valores (${conciliacao.cobrancaId}). Revise antes de importar.`,
        );
        continue;
      }

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
        status: "novo",
        status_operacional: "novo",
        status_financeiro: "em_aberto",
        observacoes: payload.observacoes || null,
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
          `ALERTA: ${pendencias.criadas} pendÃªncia(s) criada(s) para cobranÃ§as abertas ausentes no relatÃ³rio.`,
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
            administradora: payload.administradora || null,
            vencimento_cota_dia: Number(payload.vencimento_cota_dia),
            valor_cota_condominial: Number(payload.valor_cota_condominial || 0),
            inicio_cobranca_dias: Number(payload.inicio_cobranca_dias),
            status: "ativo",
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
        cnpj,
        administradora: payload.administradora || null,
        vencimento_cota_dia: Number(payload.vencimento_cota_dia),
        valor_cota_condominial: Number(payload.valor_cota_condominial || 0),
        inicio_cobranca_dias: Number(payload.inicio_cobranca_dias),
        status: "ativo",
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

      const existente = await buscarResponsavelApoio(supabase, {
        condominioId: payload.condominio_id,
        identificacao,
        bloco: payload.bloco,
      });

      const values = {
        carteira_id: payload.carteira_id,
        condominio_id: payload.condominio_id,
        unidade: identificacao,
        bloco: payload.bloco || null,
        responsavel_nome: payload.responsavel_nome || null,
        responsavel_documento: onlyDigits(
          payload.responsavel_documento || payload.cpf || payload.documento || "",
        ),
        telefone: onlyDigits(payload.telefone || payload.celular || payload.whatsapp || ""),
        email: normalizeEmail(payload.email),
        ativo: normalizeUnidadeStatus(payload.status) !== "inativa",
        origem: "importacao_unidades",
        observacoes: payload.observacoes || null,
        updated_at: new Date().toISOString(),
      };

      if (existente?.id) {
        const { error } = await supabase.from("responsaveis_unidades").update(values).eq("id", existente.id);
        if (error) throw error;
        resultado.atualizados += 1;
        continue;
      }

      const { error } = await supabase.from("responsaveis_unidades").insert(values);
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

async function importarLegados(
  supabase: SupabaseClient,
  tipo: string,
  payloads: Record<string, any>[],
) {
  const created: { table: string; ids: string[] }[] = [];
  let importados = 0;
  let parcelasCriadas = 0;
  const erros: string[] = [];

  try {
    for (const payload of payloads) {
      const calculo = calcularValorAcordoComDespesa(payload);
      const valorAcordado = calculo.valorAcordado;
      const entrada = Number(payload.entrada ?? 0);
      const quantidadeParcelas = Number(payload.quantidade_parcelas || 1);
      const tipoAcordo =
        tipo === "acordos_judiciais" ? "judicial" : "extrajudicial";

      const { data: acordo, error: acordoError } = await supabase
        .from("acordos")
        .insert({
          carteira_id: payload.carteira_id,
          cobranca_id: null,
          condominio_id: payload.condominio_id,
          unidade_id: payload.unidade_id,
          tipo: tipoAcordo,
          numero_processo:
            tipoAcordo === "judicial" ? payload.numero_processo : null,
          valor_acordado: valorAcordado,
          entrada,
          despesa_cobranca_percentual: calculo.despesaPercentual,
          despesa_cobranca_valor: calculo.despesaValor,
          data_acordo: payload.data_acordo,
          status: payload.status || "ativo",
          documento_url: payload.documento_url || null,
          observacoes:
            payload.observacoes || "Importado pelo fluxo de legados.",
        })
        .select("id")
        .single();

      if (acordoError) {
        erros.push(
          `Linha de ${payload.responsavel_nome || payload.unidade || "legado"}: ${acordoError.message}`,
        );
        continue;
      }

      created.push({ table: "acordos", ids: [acordo.id] });

      const saldoParcelado = roundMoney(valorAcordado - entrada);
      const parcelas = [];

      if (entrada > 0) {
        parcelas.push({
          acordo_id: acordo.id,
          numero: 0,
          tipo_parcela: "entrada",
          valor: entrada,
          vencimento: payload.data_acordo || toISODate(new Date()),
          status: "aberta",
        });
      }

      const baseParcela =
        Math.floor((saldoParcelado / quantidadeParcelas) * 100) / 100;
      let acumulado = 0;

      for (let index = 1; index <= quantidadeParcelas; index += 1) {
        const isLast = index === quantidadeParcelas;
        const valor = isLast
          ? roundMoney(saldoParcelado - acumulado)
          : roundMoney(baseParcela);
        acumulado = roundMoney(acumulado + valor);
        parcelas.push({
          acordo_id: acordo.id,
          numero: index,
          tipo_parcela: "parcela",
          valor,
          vencimento: toISODate(
            addMonths(
              new Date(`${payload.primeiro_vencimento}T00:00:00`),
              index - 1,
            ),
          ),
          status: "aberta",
        });
      }

      if (parcelas.length > 0) {
        const { data: parcelasInseridas, error: parcelasError } = await supabase
          .from("parcelas_acordo")
          .insert(parcelas)
          .select("id");

        if (parcelasError) {
          erros.push(
            `Parcelas do acordo ${acordo.id}: ${parcelasError.message}`,
          );
          continue;
        }

        created.push({
          table: "parcelas_acordo",
          ids: (parcelasInseridas ?? []).map((parcela: any) => parcela.id),
        });
        parcelasCriadas += parcelas.length;
      }

      importados += 1;
    }

    return { importados, criados: parcelasCriadas, erros };
  } catch (error) {
    await rollbackCreatedRows(supabase, created);
    throw error;
  }
}

export async function confirmarImportacao(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);

  const importacaoId = String(formData.get("importacao_id") ?? "");
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

  if (importacao.tipo === "cobrancas") {
    execucao = await importarCobrancas(supabase, payloads);
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

  (resultado as any).atualizados = execucao.atualizados;
  (resultado as any).divergentes = execucao.divergentes;
  (resultado as any).ausentes = execucao.ausentes;

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
