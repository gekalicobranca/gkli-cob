import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { normalizeRelationsList } from "@/utils/supabase/normalize-relation";
import {
  diasDesdeVencimento,
  formatDateBR,
  formatMoneyBR,
  isCobrancaElegivelParaRegua,
  montarMensagem,
  selecionarEtapa,
} from "./engine";
import type { ReguaEtapa, ReguaTom } from "./types";
import { COBRANCA_STATUS_OPERACIONAIS_ATIVOS } from "@/lib/core/status";
import {
  cicloReferencia,
  criarReguaFingerprint,
  normalizarEtapaId,
} from "./services/regua-shared";

export type ReguaPreviewFilters = {
  q?: string;
  carteiraId?: string;
  condominioId?: string;
  contato?: string;
};

const PAGE_SIZE = 1000;

function normalizeFilter(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

async function fetchAllRows(buildQuery: (from: number, to: number) => any, errorPrefix: string) {
  const rows: any[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`${errorPrefix}: ${error.message}`);
    }

    const page = (data ?? []) as any[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadExistingFingerprintSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fingerprints: Array<string | null | undefined>,
) {
  const unique = [...new Set(fingerprints.filter(Boolean) as string[])];
  const existing = new Set<string>();

  for (let index = 0; index < unique.length; index += PAGE_SIZE) {
    const chunk = unique.slice(index, index + PAGE_SIZE);
    const { data, error } = await supabase
      .from("mensagens")
      .select("fingerprint")
      .in("fingerprint", chunk);

    if (error) {
      throw new Error(`Erro ao verificar duplicidade de mensagens: ${error.message}`);
    }

    for (const row of data ?? []) {
      if ((row as any).fingerprint) existing.add((row as any).fingerprint);
    }
  }

  return existing;
}

function unidadeKey(row: any) {
  const condominioId = row.condominio_id ?? row.condominios?.id ?? row.condominio?.id ?? "";
  const unidade = row.unidades ?? row.unidade;
  return [
    condominioId,
    String(unidade?.bloco ?? "").trim().toLowerCase(),
    String(unidade?.identificacao ?? "").trim().toLowerCase(),
  ].join("|");
}

function responsavelApoioKey(row: any) {
  return [
    row.condominio_id ?? "",
    String(row.bloco ?? "").trim().toLowerCase(),
    String(row.unidade ?? "").trim().toLowerCase(),
  ].join("|");
}

async function loadResponsaveisApoioMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: any[],
) {
  const condominioIds = [
    ...new Set(
      rows
        .map((row) => row.condominio_id ?? row.condominios?.id ?? row.condominio?.id)
        .filter(Boolean),
    ),
  ];

  if (!condominioIds.length) return new Map<string, any>();

  const { data, error } = await supabase
    .from("responsaveis_unidades")
    .select("id, condominio_id, unidade, bloco, responsavel_nome, telefone, email, ativo")
    .eq("ativo", true)
    .in("condominio_id", condominioIds);

  if (error) {
    throw new Error(`Erro ao carregar responsÃ¡veis de apoio: ${error.message}`);
  }

  return new Map(((data ?? []) as any[]).map((row) => [responsavelApoioKey(row), row]));
}

function withResponsavelApoio(row: any, apoioMap: Map<string, any>) {
  const apoio = apoioMap.get(unidadeKey(row));
  if (!apoio) return row;

  const unidade = row.unidades ?? row.unidade ?? {};
  const mergedUnidade = {
    ...unidade,
    responsavel_nome: apoio.responsavel_nome || unidade.responsavel_nome,
    telefone: apoio.telefone || unidade.telefone,
    email: apoio.email || unidade.email,
  };

  return {
    ...row,
    unidades: row.unidades ? mergedUnidade : row.unidades,
    unidade: row.unidade ? mergedUnidade : row.unidade,
    responsavel_apoio: apoio,
  };
}

function matchesSearch(row: any, search?: string) {
  const q = normalizeFilter(search);
  if (!q) return true;

  const haystack = [
    row.condominios?.nome,
    row.condominio?.nome,
    row.unidades?.identificacao,
    row.unidade?.identificacao,
    row.unidades?.responsavel_nome,
    row.unidade?.responsavel_nome,
    row.competencia,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function matchesContato(row: any, contato?: string) {
  const mode = contato || "todos";
  const unidade = row.unidades ?? row.unidade;
  const hasDestinatario = Boolean(unidade?.telefone || unidade?.email);

  if (mode === "com_destinatario") return hasDestinatario;
  if (mode === "sem_destinatario") return !hasDestinatario;
  return true;
}

const DEFAULT_COBRANCA_ETAPAS: ReguaEtapa[] = [
  {
    id: "default-cob-1",
    regua_id: "default-cobranca",
    ordem: 1,
    delay_dias: 0,
    canal: "whatsapp",
    tom: "leve",
    template:
      "Olá, {{responsavel}}. Identificamos um débito em aberto da unidade {{unidade}} no {{condominio}}, competência {{competencia}}, vencido em {{vencimento}}. Podemos auxiliar na regularização?",
  },
  {
    id: "default-cob-2",
    regua_id: "default-cobranca",
    ordem: 2,
    delay_dias: 3,
    canal: "whatsapp",
    tom: "medio",
    template:
      "Olá, {{responsavel}}. Consta pendência da unidade {{unidade}} no {{condominio}}, valor atualizado {{valor}}. Podemos seguir com a regularização?",
  },
  {
    id: "default-cob-3",
    regua_id: "default-cobranca",
    ordem: 3,
    delay_dias: 7,
    canal: "whatsapp",
    tom: "medio",
    template:
      "Olá, {{responsavel}}. O débito da unidade {{unidade}} segue pendente. Regularize para evitar avanço da cobrança.",
  },
  {
    id: "default-cob-4",
    regua_id: "default-cobranca",
    ordem: 4,
    delay_dias: 15,
    canal: "whatsapp",
    tom: "agressivo",
    template:
      "Olá, {{responsavel}}. O débito da unidade {{unidade}} no {{condominio}} segue em aberto e poderá ser encaminhado para medidas jurídicas.",
  },
];

export async function listReguaCobrancaPreview(scope: CarteiraScope, filters: ReguaPreviewFilters = {}) {
  const supabase = await createClient();

  const data = await fetchAllRows((from, to) => {
    let query = supabase
      .from("cobrancas")
      .select(
        `
        id,
        condominio_id,
        carteira_id,
        competencia,
        vencimento,
        valor_atualizado,
        status,
        condominios(id, nome, inicio_cobranca_dias, intensidade_regua, regua_cobranca_id),
        unidades(id, identificacao, bloco, responsavel_nome, telefone, email)
      `,
      )
      .in("status", COBRANCA_STATUS_OPERACIONAIS_ATIVOS)
      .order("vencimento", { ascending: true })
      .range(from, to);

    query = applyCarteiraScope(query, scope.carteiraIds);
    if (filters.carteiraId) query = query.eq("carteira_id", filters.carteiraId);
    if (filters.condominioId) query = query.eq("condominio_id", filters.condominioId);
    return query;
  }, "Erro ao carregar prévia da régua");

  const cobrancas = normalizeRelationsList((data ?? []) as any[], [
    "condominios",
    "unidades",
  ]);
  const apoioMap = await loadResponsaveisApoioMap(supabase, cobrancas);

  const ciclo = cicloReferencia();
  const preview = cobrancas
    .map((row: any) => withResponsavelApoio(row, apoioMap))
    .filter((row: any) => matchesSearch(row, filters.q))
    .filter((row: any) => matchesContato(row, filters.contato))
    .map((row: any) => {
    const condominio = row.condominios;
    const unidade = row.unidades;
    const inicio = Number(condominio?.inicio_cobranca_dias ?? 30);
    const diasAtraso = diasDesdeVencimento(row.vencimento);
    const elegivel = isCobrancaElegivelParaRegua({
      vencimento: row.vencimento,
      inicioCobrancaDias: inicio,
    });
    const etapa =
      selecionarEtapa({
        etapas: DEFAULT_COBRANCA_ETAPAS,
        diasAtraso,
        inicioCobrancaDias: inicio,
      }) ?? DEFAULT_COBRANCA_ETAPAS[0];
    const intensidade = (condominio?.intensidade_regua ??
      etapa.tom ??
      "medio") as ReguaTom;
    const contexto = {
      responsavel: unidade?.responsavel_nome ?? "responsável",
      unidade: unidade?.identificacao ?? "unidade",
      condominio: condominio?.nome ?? "condomínio",
      competencia: row.competencia ?? "",
      vencimento: formatDateBR(row.vencimento),
      valor: formatMoneyBR(row.valor_atualizado),
    };
    const fingerprint = criarReguaFingerprint({
      contexto: "regua_cobranca",
      entidadeId: row.id,
      etapaId: normalizarEtapaId(etapa.id) ?? etapa.id ?? null,
      canal: etapa.canal ?? "whatsapp",
      ciclo,
    });

    return {
      ...row,
      inicio_cobranca_dias: inicio,
      dias_atraso: diasAtraso,
      elegivel,
      etapa,
      intensidade,
      mensagem_preview: montarMensagem({
        tipo: "cobranca",
        etapa,
        intensidade,
        contexto,
      }),
      fingerprint_preview: fingerprint,
      destinatario_preview: unidade?.telefone || unidade?.email || "",
    };
    });
  const existing = await loadExistingFingerprintSet(
    supabase,
    preview.map((row: any) => row.fingerprint_preview),
  );

  return preview.map((row: any) => ({
    ...row,
    ja_gerada_no_ciclo: existing.has(row.fingerprint_preview),
  }));
}


export const DEFAULT_ACORDO_ETAPAS: ReguaEtapa[] = [
  {
    id: 'default-acordo-1',
    regua_id: 'default-acordo',
    ordem: 1,
    delay_dias: -3,
    canal: 'whatsapp',
    tom: 'leve',
    template:
      'Olá, {{responsavel}}. Passando para lembrar que a parcela {{parcela_numero}} do acordo da unidade {{unidade}} vence em {{vencimento}}, no valor de {{valor_parcela}}.',
  },
  {
    id: 'default-acordo-2',
    regua_id: 'default-acordo',
    ordem: 2,
    delay_dias: 0,
    canal: 'whatsapp',
    tom: 'medio',
    template:
      'Olá, {{responsavel}}. A parcela {{parcela_numero}} do acordo da unidade {{unidade}} vence hoje, no valor de {{valor_parcela}}. Podemos confirmar o pagamento?',
  },
  {
    id: 'default-acordo-3',
    regua_id: 'default-acordo',
    ordem: 3,
    delay_dias: 2,
    canal: 'whatsapp',
    tom: 'medio',
    template:
      'Olá, {{responsavel}}. A parcela {{parcela_numero}} do acordo da unidade {{unidade}} está vencida desde {{vencimento}}. Regularize para manter as condições pactuadas.',
  },
  {
    id: 'default-acordo-4',
    regua_id: 'default-acordo',
    ordem: 4,
    delay_dias: 7,
    canal: 'whatsapp',
    tom: 'agressivo',
    template:
      'Olá, {{responsavel}}. O acordo da unidade {{unidade}} segue com parcela vencida. A ausência de regularização poderá caracterizar quebra do acordo.',
  },
]

function parseDateSafe(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function diasRelativosParcela(vencimento: string | null | undefined) {
  const date = parseDateSafe(vencimento)
  if (!date) return 0
  const hoje = new Date()
  const dateUtc = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const hojeUtc = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.floor((hojeUtc.getTime() - dateUtc.getTime()) / 86400000)
}

function selecionarEtapaAcordoPreview(etapas: ReguaEtapa[], diasRelativos: number) {
  return [...etapas]
    .filter((etapa) => etapa.ativo !== false)
    .filter((etapa) => diasRelativos >= Number(etapa.delay_dias ?? 0))
    .sort((a, b) => Number(b.delay_dias) - Number(a.delay_dias) || Number(b.ordem) - Number(a.ordem))[0]
}

export async function listReguaAcordoPreview(scope: CarteiraScope, filters: ReguaPreviewFilters = {}) {
  const supabase = await createClient()

  const acordosData = await fetchAllRows((from, to) => {
    let acordosQuery = supabase
      .from('acordos')
      .select(
        `
        id,
        carteira_id,
        condominio_id,
        unidade_id,
        valor_acordado,
        data_acordo,
        status,
        status_financeiro,
        risco,
        condominios(id, nome, regua_acordo_id),
        unidades(id, identificacao, bloco, responsavel_nome, telefone, email)
      `,
      )
      .in('status', ['ativo', 'em_dia', 'em_atraso', 'vencido'])
      .neq('status_financeiro', 'quitado')
      .order('data_acordo', { ascending: false })
      .range(from, to)

    acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)
    if (filters.carteiraId) acordosQuery = acordosQuery.eq('carteira_id', filters.carteiraId)
    if (filters.condominioId) acordosQuery = acordosQuery.eq('condominio_id', filters.condominioId)
    return acordosQuery
  }, 'Erro ao carregar prévia da régua de acordos')

  const acordosNormalizados = normalizeRelationsList((acordosData ?? []) as any[], [
    'condominios',
    'unidades',
  ])
  const apoioMap = await loadResponsaveisApoioMap(supabase, acordosNormalizados)
  const acordos = acordosNormalizados
    .map((row: any) => withResponsavelApoio(row, apoioMap))
    .filter((row: any) => matchesSearch(row, filters.q))
    .filter((row: any) => matchesContato(row, filters.contato)) as any[]

  if (!acordos.length) return []

  const acordoIds = acordos.map((acordo) => acordo.id)
  const { data: parcelasData, error: parcelasError } = await supabase
    .from('parcelas_acordo')
    .select('id, acordo_id, numero, tipo_parcela, valor, vencimento, status')
    .in('acordo_id', acordoIds)
    .in('status', ['aberta', 'vencida'])
    .order('vencimento', { ascending: true })

  if (parcelasError) {
    throw new Error(`Erro ao carregar parcelas para prévia da régua: ${parcelasError.message}`)
  }

  const parcelasPorAcordo = new Map<string, any[]>()
  for (const parcela of parcelasData ?? []) {
    const list = parcelasPorAcordo.get((parcela as any).acordo_id) ?? []
    list.push(parcela)
    parcelasPorAcordo.set((parcela as any).acordo_id, list)
  }

  const preview: any[] = []
  const ciclo = cicloReferencia()

  for (const acordo of acordos) {
    const parcelas = parcelasPorAcordo.get(acordo.id) ?? []
    const parcela = parcelas[0]
    const condominio = acordo.condominios
    const unidade = acordo.unidades

    if (!parcela) {
      preview.push({
        ...acordo,
        parcela: null,
        elegivel: false,
        motivo: 'Acordo sem parcelas abertas.',
        destinatario_preview: unidade?.telefone || unidade?.email || '',
      })
      continue
    }

    const diasRelativos = diasRelativosParcela(parcela.vencimento)
    const elegivel = diasRelativos >= -3
    const etapa = selecionarEtapaAcordoPreview(DEFAULT_ACORDO_ETAPAS, diasRelativos) ?? DEFAULT_ACORDO_ETAPAS[0]
    const fingerprint = criarReguaFingerprint({
      contexto: 'regua_acordo',
      entidadeId: parcela.id,
      etapaId: normalizarEtapaId(etapa.id) ?? etapa.id ?? null,
      canal: etapa.canal ?? 'whatsapp',
      ciclo,
    })
    const contexto = {
      responsavel: unidade?.responsavel_nome ?? 'responsável',
      primeiro_nome: String(unidade?.responsavel_nome ?? 'responsável').split(' ')[0],
      unidade: unidade?.identificacao ?? 'unidade',
      condominio: condominio?.nome ?? 'condomínio',
      vencimento: formatDateBR(parcela.vencimento),
      valor: formatMoneyBR(parcela.valor),
      valor_parcela: formatMoneyBR(parcela.valor),
      valor_acordo: formatMoneyBR(acordo.valor_acordado),
      parcela_numero: parcela.numero ?? '',
      dias_atraso: Math.max(0, diasRelativos),
    }

    preview.push({
      ...acordo,
      parcela,
      dias_relativos_vencimento: diasRelativos,
      dias_atraso: Math.max(0, diasRelativos),
      elegivel,
      etapa,
      intensidade: etapa.tom,
      mensagem_preview: montarMensagem({
        tipo: 'acordo',
        etapa,
        intensidade: etapa.tom,
        contexto,
      }),
      fingerprint_preview: fingerprint,
      destinatario_preview: unidade?.telefone || unidade?.email || '',
    })
  }

  const existing = await loadExistingFingerprintSet(
    supabase,
    preview.map((row: any) => row.fingerprint_preview),
  )

  return preview.map((row: any) => ({
    ...row,
    ja_gerada_no_ciclo: existing.has(row.fingerprint_preview),
  }))
}

export async function carregarEtapasDeReguaAdmin(
  reguaId?: string | null,
  tipo: 'cobranca' | 'acordo' = 'cobranca',
) {
  if (!reguaId) return tipo === 'acordo' ? DEFAULT_ACORDO_ETAPAS : DEFAULT_COBRANCA_ETAPAS
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('regua_etapas')
    .select('id, regua_id, ordem, delay_dias, canal, template, template_id, categoria_template, tom, ativo')
    .eq('regua_id', reguaId)
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  if (error || !data?.length) return tipo === 'acordo' ? DEFAULT_ACORDO_ETAPAS : DEFAULT_COBRANCA_ETAPAS
  return data as ReguaEtapa[]
}

