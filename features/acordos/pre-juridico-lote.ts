import { createAdminClient } from "@/utils/supabase/admin";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { registrarEventoOperacional } from "@/features/operacional/service";
import { resolveTemplateMensagem } from "@/features/mensageria/template-resolver";
import { renderTemplate } from "@/features/mensageria/render-template";
import { registrarLogMensageria } from "@/features/mensageria/engine/logs";
import {
  LOTE_ITEM_STATUS,
  LOTE_STATUS,
  LOTE_TIPO,
  MENSAGEM_STATUS,
} from "@/lib/core/status";
import { formatCurrency } from "@/utils/formatters/currency";

type PreJuridicoLoteParams = {
  acordoIds: string[];
  scope: CarteiraScope;
  userId?: string | null;
};

type LoteCounters = {
  avaliadas: number;
  criadas: number;
  puladas: number;
  duplicadas: number;
  erros: number;
};

const JURIDICO_TIPO_REGUA = "juridico";
const JURIDICO_INTENSIDADE = "medio";
const JURIDICO_CANAL = "email";

const TEMPLATE_DEFINITIONS = [
  {
    categoria: "pre_juridico_carteira",
    nome: "Pré-jurídico · Carteira · Laudo e procuração",
    assunto: "Pacote pré-jurídico - {{condominio}} - unidade {{unidade}}",
    conteudo:
      "Olá, {{primeiro_nome}}.\n\nO pacote pré-jurídico está pronto para conferência.\n\nCondomínio: {{condominio}}\nUnidade: {{unidade}}\nValor do acordo: {{valor_acordo}}\n\nLaudo: {{link_laudo}}\nProcuração: {{link_procuracao}}\n\nEsta mensagem foi gerada pela régua pré-jurídica.",
  },
  {
    categoria: "pre_juridico_administradora",
    nome: "Pré-jurídico · Administradora · Lista",
    assunto: "Lista pré-jurídica de acordos quebrados - {{administradora}}",
    conteudo:
      "Olá, {{primeiro_nome}}.\n\nSegue a lista pré-jurídica dos acordos quebrados por condomínio.\n\nAdministradora: {{administradora}}\nAcordos: {{total_acordos}}\n\nLista: {{link_lista_administradora}}\n\nPor favor, conferir os dados e apoiar os próximos encaminhamentos.",
  },
  {
    categoria: "pre_juridico_sindico",
    nome: "Pré-jurídico · Síndico · Procuração",
    assunto: "Procuração para assinatura - {{condominio}} - unidade {{unidade}}",
    conteudo:
      "Olá, {{primeiro_nome}}.\n\nSegue a procuração para assinatura referente ao encaminhamento pré-jurídico.\n\nCondomínio: {{condominio}}\nUnidade: {{unidade}}\n\nProcuração: {{link_procuracao}}\n\nApós assinatura, encaminhe o documento à equipe responsável.",
  },
] as const;

function getPublicBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

function firstName(value: string | null | undefined) {
  return String(value ?? "responsável").trim().split(/\s+/)[0] || "responsável";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function pdfLinks(acordoIds: string[]) {
  const base = getPublicBaseUrl();
  const ids = encodeURIComponent(acordoIds.join(","));
  return {
    laudo: `${base}/api/acordos/pre-juridico/pdf?ids=${ids}`,
    listaAdministradora: `${base}/api/acordos/pre-juridico/lista-administradora/pdf?ids=${ids}`,
    procuracao: `${base}/api/acordos/pre-juridico/procuracao/pdf?ids=${ids}`,
  };
}

async function ensureTemplates(supabase: ReturnType<typeof createAdminClient>) {
  for (const template of TEMPLATE_DEFINITIONS) {
    const { data } = await supabase
      .from("mensagens_templates")
      .select("id")
      .eq("tipo_regua", JURIDICO_TIPO_REGUA)
      .eq("categoria", template.categoria)
      .eq("canal", JURIDICO_CANAL)
      .is("carteira_id", null)
      .limit(1)
      .maybeSingle();

    if (data?.id) continue;

    await supabase.from("mensagens_templates").insert({
      nome: template.nome,
      tipo: JURIDICO_TIPO_REGUA,
      tipo_regua: JURIDICO_TIPO_REGUA,
      categoria: template.categoria,
      intensidade: JURIDICO_INTENSIDADE,
      canal: JURIDICO_CANAL,
      assunto: template.assunto,
      conteudo: template.conteudo,
      ativo: true,
      prioridade: 50,
      variaveis: [
        "primeiro_nome",
        "condominio",
        "unidade",
        "valor_acordo",
        "administradora",
        "total_acordos",
        "link_laudo",
        "link_procuracao",
        "link_lista_administradora",
      ],
    } as any);
  }
}

async function ensureReguaPreJuridico(
  supabase: ReturnType<typeof createAdminClient>,
  carteiraId: string,
) {
  const { data: specific } = await supabase
    .from("reguas")
    .select("id")
    .eq("tipo", JURIDICO_TIPO_REGUA)
    .eq("carteira_id", carteiraId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (specific?.id) return { id: specific.id as string, origem: "carteira" as const };

  const { data: global } = await supabase
    .from("reguas")
    .select("id")
    .eq("tipo", JURIDICO_TIPO_REGUA)
    .is("carteira_id", null)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (global?.id) return { id: global.id as string, origem: "global" as const };

  const { data, error } = await supabase
    .from("reguas")
    .insert({
      nome: "Régua pré-jurídico",
      tipo: JURIDICO_TIPO_REGUA,
      status: "ativa",
      descricao: "Régua de envio do pacote pré-jurídico: carteira, administradora e síndico.",
      prioridade: 90,
      padrao: false,
      destinatario_preferencial: "qualquer",
      ativo: true,
    } as any)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Erro ao criar régua pré-jurídico: ${error?.message ?? "régua não retornada"}`);
  }

  return { id: data.id as string, origem: "criada" as const };
}

async function carregarAcordos(
  supabase: ReturnType<typeof createAdminClient>,
  acordoIds: string[],
  scope: CarteiraScope,
) {
  let query: any = supabase
    .from("acordos")
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      status,
      status_financeiro,
      fluxo_status,
      valor_acordado,
      data_acordo,
      carteiras:carteira_id (id,nome),
      condominios:condominio_id (
        id,
        nome,
        administradora_id,
        administradoras:administradora_id (id,nome,email)
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome,
        email,
        telefone
      )
    `)
    .in("id", acordoIds);

  if (scope.carteiraIds !== null) {
    query = query.in("carteira_id", scope.carteiraIds.length ? scope.carteiraIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar acordos para lote pré-jurídico: ${error.message}`);

  const rows = (data ?? []) as any[];
  if (rows.length !== acordoIds.length) {
    throw new Error("Um ou mais acordos selecionados não estão disponíveis para a régua pré-jurídica.");
  }

  return rows.map((row) => ({
    ...row,
    carteiras: firstRelation(row.carteiras),
    condominios: {
      ...firstRelation(row.condominios),
      administradoras: firstRelation(firstRelation(row.condominios)?.administradoras),
    },
    unidades: firstRelation(row.unidades),
  }));
}

async function carregarContatosCarteira(
  supabase: ReturnType<typeof createAdminClient>,
  carteiraIds: string[],
) {
  const result = new Map<string, Array<{ nome: string; email: string }>>();
  if (!carteiraIds.length) return result;

  const { data } = await supabase
    .from("usuarios_carteiras")
    .select("carteira_id, profiles(nome,email,role)")
    .in("carteira_id", carteiraIds);

  for (const row of (data ?? []) as any[]) {
    const profile = firstRelation(row.profiles);
    const email = String(profile?.email ?? "").trim();
    if (!row.carteira_id || !email) continue;
    const list = result.get(row.carteira_id) ?? [];
    list.push({ nome: profile?.nome ?? email, email });
    result.set(row.carteira_id, list);
  }

  return result;
}

async function carregarContatosAdministradora(
  supabase: ReturnType<typeof createAdminClient>,
  administradoraIds: string[],
) {
  const result = new Map<string, Array<{ nome: string; email: string }>>();
  if (!administradoraIds.length) return result;

  const { data } = await supabase
    .from("administradora_contatos")
    .select("administradora_id,nome,email,principal,ativo")
    .in("administradora_id", administradoraIds)
    .eq("ativo", true)
    .order("principal", { ascending: false });

  for (const row of (data ?? []) as any[]) {
    const email = String((row as any).email ?? "").trim();
    if (!row.administradora_id || !email) continue;
    const list = result.get(row.administradora_id) ?? [];
    list.push({ nome: row.nome ?? email, email });
    result.set(row.administradora_id, list);
  }

  return result;
}

async function carregarContatosSindico(
  supabase: ReturnType<typeof createAdminClient>,
  condominioIds: string[],
) {
  const result = new Map<string, Array<{ nome: string; email: string }>>();
  if (!condominioIds.length) return result;

  const { data } = await supabase
    .from("portal_sindico_condominios")
    .select("condominio_id, status, portal_sindico_usuarios(nome,email,status)")
    .in("condominio_id", condominioIds)
    .eq("status", "ativo");

  for (const row of (data ?? []) as any[]) {
    const usuario = firstRelation((row as any).portal_sindico_usuarios);
    const email = String(usuario?.email ?? "").trim();
    if (!row.condominio_id || !email || usuario?.status === "inativo") continue;
    const list = result.get(row.condominio_id) ?? [];
    list.push({ nome: usuario?.nome ?? email, email });
    result.set(row.condominio_id, list);
  }

  return result;
}

async function criarLote(params: {
  supabase: ReturnType<typeof createAdminClient>;
  carteiraId: string;
  reguaId: string;
  reguaOrigem: string;
  userId?: string | null;
  acordoIds: string[];
}) {
  const { data, error } = await params.supabase
    .from("lotes")
    .insert({
      carteira_id: params.carteiraId,
      regua_id: params.reguaId,
      tipo: LOTE_TIPO.REGUA_ACORDO,
      status: LOTE_STATUS.PROCESSANDO,
      operador_id: params.userId ?? null,
      observacoes: "Lote gerado pela régua pré-jurídico.",
      iniciado_em: new Date().toISOString(),
      resumo: {
        contexto: "pre_juridico",
        regua_id: params.reguaId,
        regua_tipo: JURIDICO_TIPO_REGUA,
        regua_origem: params.reguaOrigem,
        acordo_ids: params.acordoIds,
      },
    } as any)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Erro ao criar lote pré-jurídico: ${error?.message ?? "lote não retornado"}`);
  }

  return data.id as string;
}

function contextoBase(acordo: any, contato: { nome: string; email: string }, extra: Record<string, unknown> = {}) {
  const condominio = acordo.condominios;
  const unidade = acordo.unidades;
  const carteira = acordo.carteiras;
  const administradora = condominio?.administradoras;
  return {
    carteira: carteira?.nome ?? carteira?.id ?? "Carteira",
    nome_carteira: carteira?.nome ?? carteira?.id ?? "Carteira",
    nome: contato.nome,
    responsavel: contato.nome,
    primeiro_nome: firstName(contato.nome),
    condominio: condominio?.nome ?? "Condomínio",
    unidade: unidade?.identificacao ?? "-",
    bloco: unidade?.bloco ?? "",
    valor: formatCurrency(Number(acordo.valor_acordado ?? 0)),
    valor_acordo: formatCurrency(Number(acordo.valor_acordado ?? 0)),
    administradora: administradora?.nome ?? "Administradora",
    email: contato.email,
    ...extra,
  };
}

async function criarMensagem(params: {
  supabase: ReturnType<typeof createAdminClient>;
  loteId: string;
  acordo: any;
  contato: { nome: string; email: string } | null;
  categoria: string;
  finalidade: "carteira" | "administradora" | "sindico";
  assuntoFallback: string;
  motivoSemContato: string;
  links: ReturnType<typeof pdfLinks>;
  payload?: Record<string, unknown>;
  counters: LoteCounters;
}) {
  const { supabase, acordo, counters } = params;
  counters.avaliadas += 1;

  const condominio = acordo.condominios;
  const unidade = acordo.unidades;

  if (!params.contato?.email) {
    const { error: itemError } = await supabase.from("lote_itens").insert({
      lote_id: params.loteId,
      acordo_id: acordo.id,
      unidade_id: unidade?.id ?? acordo.unidade_id ?? null,
      condominio_id: condominio?.id ?? acordo.condominio_id ?? null,
      status: LOTE_ITEM_STATUS.PULADA,
      motivo: params.motivoSemContato,
      payload: { finalidade: params.finalidade, ...(params.payload ?? {}) },
    } as any);
    if (itemError) throw new Error(`Erro ao criar item pulado do lote pré-jurídico: ${itemError.message}`);
    counters.puladas += 1;
    return null;
  }

  const variables = contextoBase(acordo, params.contato, {
    link_laudo: params.links.laudo,
    link_procuracao: params.links.procuracao,
    link_lista_administradora: params.links.listaAdministradora,
    total_acordos: params.payload?.total_acordos as any,
  });

  const template = await resolveTemplateMensagem({
    carteiraId: acordo.carteira_id,
    tipoRegua: JURIDICO_TIPO_REGUA,
    categoria: params.categoria,
    intensidade: JURIDICO_INTENSIDADE,
    canal: JURIDICO_CANAL,
    variables,
  });

  const assunto = template.assunto
    ? renderTemplate(template.assunto, variables)
    : renderTemplate(params.assuntoFallback, variables);
  const conteudo = template.renderizado;
  const fingerprint = [
    "pre_juridico",
    params.finalidade,
    acordo.id,
    params.contato.email.toLowerCase(),
    todayKey(),
  ].join(":");

  const { data: existente } = await supabase
    .from("mensagens")
    .select("id")
    .eq("fingerprint", fingerprint)
    .limit(1)
    .maybeSingle();

  if (existente?.id) {
    await supabase.from("lote_itens").insert({
      lote_id: params.loteId,
      acordo_id: acordo.id,
      unidade_id: unidade?.id ?? acordo.unidade_id ?? null,
      condominio_id: condominio?.id ?? acordo.condominio_id ?? null,
      mensagem_id: existente.id,
      status: LOTE_ITEM_STATUS.DUPLICADA,
      motivo: "Mensagem pré-jurídica já existia para esta finalidade/destinatário hoje.",
      fingerprint,
      payload: { finalidade: params.finalidade, ...(params.payload ?? {}) },
    } as any);
    counters.duplicadas += 1;
    return existente.id as string;
  }

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({
      carteira_id: acordo.carteira_id,
      contexto: "pre_juridico",
      acordo_id: acordo.id,
      canal: JURIDICO_CANAL,
      destinatario: params.contato.email,
      email_destinatario: params.contato.email,
      email_assunto: assunto,
      conteudo,
      conteudo_renderizado: conteudo,
      status: MENSAGEM_STATUS.PENDENTE_APROVACAO,
      status_operacional: MENSAGEM_STATUS.PENDENTE_APROVACAO,
      scheduled_at: new Date().toISOString(),
      agendada_para: new Date().toISOString(),
      lote_id: params.loteId,
      fingerprint,
      template_id: template.templateId,
      payload: {
        contexto: variables,
        template_resolvido: template,
        finalidade: params.finalidade,
        links: params.links,
        ...(params.payload ?? {}),
      },
    } as any)
    .select("id")
    .single();

  if (mensagemError || !mensagem?.id) {
    counters.erros += 1;
    throw new Error(`Erro ao criar mensagem pré-jurídica: ${mensagemError?.message ?? "mensagem não retornada"}`);
  }

  const { data: item, error: itemError } = await supabase
    .from("lote_itens")
    .insert({
      lote_id: params.loteId,
      acordo_id: acordo.id,
      unidade_id: unidade?.id ?? acordo.unidade_id ?? null,
      condominio_id: condominio?.id ?? acordo.condominio_id ?? null,
      mensagem_id: mensagem.id,
      status: LOTE_ITEM_STATUS.CRIADO,
      motivo: "Mensagem pré-jurídica criada.",
      fingerprint,
      payload: { finalidade: params.finalidade, links: params.links, ...(params.payload ?? {}) },
    } as any)
    .select("id")
    .single();

  if (itemError) throw new Error(`Erro ao criar item do lote pré-jurídico: ${itemError.message}`);

  await supabase.from("mensagens").update({ lote_item_id: item?.id ?? null } as any).eq("id", mensagem.id);
  await registrarLogMensageria(supabase as any, {
    carteira_id: acordo.carteira_id,
    lote_id: params.loteId,
    lote_item_id: item?.id ?? null,
    mensagem_id: mensagem.id,
    evento: "pre_juridico_mensagem_criada",
    status_novo: MENSAGEM_STATUS.PENDENTE_APROVACAO,
    descricao: "Mensagem da régua pré-jurídica criada.",
    payload: { finalidade: params.finalidade, acordo_id: acordo.id, destinatario: params.contato.email },
  });

  counters.criadas += 1;
  return mensagem.id as string;
}

async function finalizarLote(
  supabase: ReturnType<typeof createAdminClient>,
  loteId: string,
  reguaId: string,
  counters: LoteCounters,
) {
  const status = counters.erros > 0
    ? LOTE_STATUS.CONCLUIDO_COM_FALHAS
    : counters.criadas > 0
      ? LOTE_STATUS.PENDENTE_APROVACAO
      : LOTE_STATUS.CONCLUIDO;

  const { error } = await supabase
    .from("lotes")
    .update({
      status,
      total_avaliadas: counters.avaliadas,
      total_criadas: counters.criadas,
      total_puladas: counters.puladas,
      total_duplicadas: counters.duplicadas,
      total_erros: counters.erros,
      total_pendentes: counters.criadas,
      finalizado_em: new Date().toISOString(),
      resumo: {
        contexto: "pre_juridico",
        regua_id: reguaId,
        regua_tipo: JURIDICO_TIPO_REGUA,
        total_avaliadas: counters.avaliadas,
        total_criadas: counters.criadas,
        total_puladas: counters.puladas,
        total_duplicadas: counters.duplicadas,
        total_erros: counters.erros,
      },
    } as any)
    .eq("id", loteId);

  if (error) throw new Error(`Erro ao finalizar lote pré-jurídico: ${error.message}`);
}

export async function criarLotesPreJuridico(params: PreJuridicoLoteParams) {
  const supabase = createAdminClient();
  const acordos = await carregarAcordos(supabase, params.acordoIds, params.scope);

  await ensureTemplates(supabase);

  const carteiraIds = unique(acordos.map((acordo) => acordo.carteira_id));
  const administradoraIds = unique(acordos.map((acordo) => acordo.condominios?.administradora_id));
  const condominioIds = unique(acordos.map((acordo) => acordo.condominio_id));

  const [contatosCarteira, contatosAdministradora, contatosSindico] = await Promise.all([
    carregarContatosCarteira(supabase, carteiraIds),
    carregarContatosAdministradora(supabase, administradoraIds),
    carregarContatosSindico(supabase, condominioIds),
  ]);

  const lotes: string[] = [];
  const acordosPorCarteira = new Map<string, any[]>();
  for (const acordo of acordos) {
    if (!acordo.carteira_id) continue;
    const list = acordosPorCarteira.get(acordo.carteira_id) ?? [];
    list.push(acordo);
    acordosPorCarteira.set(acordo.carteira_id, list);
  }

  for (const [carteiraId, rows] of acordosPorCarteira) {
    const regua = await ensureReguaPreJuridico(supabase, carteiraId);
    const loteId = await criarLote({
      supabase,
      carteiraId,
      reguaId: regua.id,
      reguaOrigem: regua.origem,
      userId: params.userId,
      acordoIds: rows.map((row) => row.id),
    });
    lotes.push(loteId);

    const counters: LoteCounters = { avaliadas: 0, criadas: 0, puladas: 0, duplicadas: 0, erros: 0 };

    for (const acordo of rows) {
      const links = pdfLinks([acordo.id]);
      const carteiraContato = contatosCarteira.get(carteiraId)?.[0] ?? null;
      await criarMensagem({
        supabase,
        loteId,
        acordo,
        contato: carteiraContato,
        categoria: "pre_juridico_carteira",
        finalidade: "carteira",
        assuntoFallback: "Pacote pré-jurídico - {{condominio}} - unidade {{unidade}}",
        motivoSemContato: "Carteira sem usuário com e-mail vinculado para receber laudo/procuração.",
        links,
        counters,
      });

      const sindicoContato = contatosSindico.get(acordo.condominio_id)?.[0] ?? null;
      await criarMensagem({
        supabase,
        loteId,
        acordo,
        contato: sindicoContato,
        categoria: "pre_juridico_sindico",
        finalidade: "sindico",
        assuntoFallback: "Procuração para assinatura - {{condominio}} - unidade {{unidade}}",
        motivoSemContato: "Condomínio sem síndico ativo com e-mail para receber procuração.",
        links,
        counters,
      });
    }

    const porAdministradora = new Map<string, any[]>();
    for (const acordo of rows) {
      const admId = acordo.condominios?.administradora_id;
      if (!admId) continue;
      const list = porAdministradora.get(admId) ?? [];
      list.push(acordo);
      porAdministradora.set(admId, list);
    }

    for (const [administradoraId, admRows] of porAdministradora) {
      const primeiro = admRows[0];
      const contato = contatosAdministradora.get(administradoraId)?.[0]
        ?? (primeiro.condominios?.administradoras?.email
          ? { nome: primeiro.condominios?.administradoras?.nome ?? "Administradora", email: primeiro.condominios.administradoras.email }
          : null);
      const links = pdfLinks(admRows.map((row) => row.id));
      await criarMensagem({
        supabase,
        loteId,
        acordo: primeiro,
        contato,
        categoria: "pre_juridico_administradora",
        finalidade: "administradora",
        assuntoFallback: "Lista pré-jurídica de acordos quebrados - {{administradora}}",
        motivoSemContato: "Administradora sem contato ativo com e-mail para receber a lista.",
        links,
        payload: {
          administradora_id: administradoraId,
          acordo_ids: admRows.map((row) => row.id),
          total_acordos: admRows.length,
        },
        counters,
      });
    }

    await finalizarLote(supabase, loteId, regua.id, counters);

    await registrarEventoOperacional(supabase as any, {
      carteiraId,
      entidadeTipo: "lote",
      entidadeId: loteId,
      eventoCodigo: "acordo.pre_juridico.lote_criado",
      titulo: "Lote pré-jurídico criado",
      descricao: "Régua pré-jurídica preparada com mensagens para carteira, administradora e síndico.",
      severidade: counters.erros > 0 ? "alerta" : "info",
      payload: {
        lote_id: loteId,
        regua_id: regua.id,
        acordo_ids: rows.map((row) => row.id),
        counters,
      },
      origem: "manual",
      auditavel: true,
      userId: params.userId ?? null,
    });
  }

  return { loteId: lotes[0] ?? null, loteIds: lotes };
}
