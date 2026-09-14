import { NextResponse } from "next/server";
import { criarExcelExportacaoCondominio, type CondominioExportTipo } from "@/features/condominios/exportacao-cadastro-excel";
import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";

function sanitizeFileName(value: string) {
  return String(value || "condominio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "condominio";
}

function toDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calcularValorRepasseParcela(acordo: any, parcelaValor: unknown) {
  const valorParcela = money(parcelaValor);
  const despesaCobrancaValor = money(acordo.despesa_cobranca_valor);
  const valorAcordado = money(acordo.valor_acordado);
  const despesaCobrancaPercentual = money(acordo.despesa_cobranca_percentual);

  if (despesaCobrancaValor > 0 && valorAcordado > 0) {
    return roundCurrency((despesaCobrancaValor * valorParcela) / valorAcordado);
  }

  return roundCurrency((valorParcela * despesaCobrancaPercentual) / 100);
}

async function loadCondominio(id: string) {
  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  let query = supabase
    .from("condominios")
    .select("id, carteira_id, nome, cnpj")
    .eq("id", id)
    .maybeSingle();

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar condomínio: ${error.message}`);
  return { supabase, scope, condominio: data as any | null };
}

async function exportUnidades(id: string) {
  const { supabase, scope, condominio } = await loadCondominio(id);
  if (!condominio) return null;

  let query = supabase
    .from("unidades")
    .select("identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email, status, observacoes, carteira_id, condominio_id")
    .eq("condominio_id", condominio.id)
    .order("identificacao", { ascending: true });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar unidades: ${error.message}`);

  const rows = (data ?? []).map((row: any) => ({
    condominio_cnpj: condominio.cnpj ?? "",
    identificacao: row.identificacao ?? "",
    bloco: row.bloco ?? "",
    tipo: row.tipo ?? "unidade",
    responsavel_nome: row.responsavel_nome ?? "",
    responsavel_documento: row.responsavel_documento ?? "",
    telefone: row.telefone ?? "",
    email: row.email ?? "",
    status: row.status ?? "ativo",
    observacoes: row.observacoes ?? "",
  }));

  return { condominio, buffer: await criarExcelExportacaoCondominio("unidades", rows) };
}

async function exportCobrancas(id: string) {
  const { supabase, scope, condominio } = await loadCondominio(id);
  if (!condominio) return null;

  let query = supabase
    .from("cobrancas")
    .select(`
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      observacoes,
      carteira_id,
      condominio_id,
      unidades:unidade_id (
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        telefone,
        email
      )
    `)
    .eq("condominio_id", condominio.id)
    .order("vencimento", { ascending: false });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar cobranças: ${error.message}`);

  const rows = (data ?? []).map((row: any) => {
    const unidade = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades;
    return {
      condominio_cnpj: condominio.cnpj ?? "",
      unidade: unidade?.identificacao ?? "",
      bloco: unidade?.bloco ?? "",
      responsavel_nome: unidade?.responsavel_nome ?? "",
      responsavel_documento: unidade?.responsavel_documento ?? "",
      telefone: unidade?.telefone ?? "",
      email: unidade?.email ?? "",
      competencia: row.competencia ?? "",
      vencimento: toDate(row.vencimento),
      valor_original: money(row.valor_original),
      valor_atualizado: money(row.valor_atualizado),
      status: row.status ?? "novo",
      observacoes: row.observacoes ?? "",
    };
  });

  return { condominio, buffer: await criarExcelExportacaoCondominio("cobrancas", rows) };
}

async function exportAcordos(id: string) {
  const { supabase, scope, condominio } = await loadCondominio(id);
  if (!condominio) return null;

  let query = supabase
    .from("acordos")
    .select(`
      id,
      data_acordo,
      valor_acordado,
      quantidade_parcelas,
      entrada,
      despesa_cobranca_percentual,
      despesa_cobranca_valor,
      status,
      documento_url,
      observacoes,
      carteira_id,
      condominio_id,
      unidades:unidade_id (
        identificacao,
        bloco,
        responsavel_nome
      )
    `)
    .eq("condominio_id", condominio.id)
    .order("data_acordo", { ascending: false });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar acordos: ${error.message}`);

  const acordoIds = (data ?? []).map((row: any) => row.id).filter(Boolean);
  const parcelasPorAcordo = new Map<string, any[]>();

  if (acordoIds.length > 0) {
    const { data: parcelas, error: parcelasError } = await supabase
      .from("parcelas_acordo")
      .select("id, acordo_id, numero, tipo_parcela, valor, vencimento, status, data_pagamento")
      .in("acordo_id", acordoIds)
      .order("numero", { ascending: true });

    if (parcelasError) throw new Error(`Erro ao carregar parcelas dos acordos: ${parcelasError.message}`);

    for (const parcela of parcelas ?? []) {
      const key = String((parcela as any).acordo_id);
      const list = parcelasPorAcordo.get(key) ?? [];
      list.push(parcela);
      parcelasPorAcordo.set(key, list);
    }
  }

  const rows = (data ?? []).map((row: any) => {
    const unidade = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades;
    const parcelas = parcelasPorAcordo.get(row.id) ?? [];
    const primeiroVencimento = parcelas[0]?.vencimento ?? "";
    const valorOriginal = money(row.valor_acordado) - money(row.despesa_cobranca_valor);
    const quantidadeParcelas = Number(row.quantidade_parcelas || parcelas.length || 0);

    return {
      condominio_cnpj: condominio.cnpj ?? "",
      unidade: unidade?.identificacao ?? "",
      bloco: unidade?.bloco ?? "",
      responsavel_nome: unidade?.responsavel_nome ?? "",
      data_acordo: toDate(row.data_acordo),
      valor_original: Math.max(0, valorOriginal),
      despesa_cobranca_percentual: money(row.despesa_cobranca_percentual),
      despesa_cobranca_valor: money(row.despesa_cobranca_valor),
      entrada: money(row.entrada),
      quantidade_parcelas: quantidadeParcelas || "",
      primeiro_vencimento: toDate(primeiroVencimento),
      status: row.status ?? "ativo",
      documento_url: row.documento_url ?? "",
      observacoes: row.observacoes ?? "",
    };
  });

  const parcelasRows: Array<Record<string, unknown>> = (data ?? []).flatMap((row: any) => {
    const unidade = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades;
    const parcelas = parcelasPorAcordo.get(row.id) ?? [];
    const quantidadeParcelas = Number(row.quantidade_parcelas || parcelas.length || 0);
    const baseRow = {
      condominio_cnpj: condominio.cnpj ?? "",
      acordo_id: row.id ?? "",
      unidade: unidade?.identificacao ?? "",
      bloco: unidade?.bloco ?? "",
      responsavel_nome: unidade?.responsavel_nome ?? "",
      data_acordo: toDate(row.data_acordo),
      valor_acordo: money(row.valor_acordado),
      quantidade_parcelas: quantidadeParcelas || "",
      documento_url: row.documento_url ?? "",
      observacoes: row.observacoes ?? "",
    };

    if (parcelas.length === 0) {
      return [{
        ...baseRow,
        parcela_id: "",
        parcela_numero: null,
        parcela_tipo: null,
        parcela_vencimento: null,
        parcela_valor: null,
        parcela_valor_repasse: null,
        parcela_status: null,
        parcela_data_pagamento: null,
      }];
    }

    return parcelas.map((parcela) => ({
      ...baseRow,
      parcela_id: parcela.id ?? "",
      parcela_numero: parcela.numero ?? "",
      parcela_tipo: parcela.tipo_parcela ?? "parcela",
      parcela_vencimento: toDate(parcela.vencimento),
      parcela_valor: money(parcela.valor),
      parcela_valor_repasse: calcularValorRepasseParcela(row, parcela.valor),
      parcela_status: parcela.status ?? "",
      parcela_data_pagamento: toDate(parcela.data_pagamento),
    }));
  });

  return {
    condominio,
    buffer: await criarExcelExportacaoCondominio("acordos", rows, new Date(), { parcelas: parcelasRows }),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; tipo: string }> },
) {
  const { id, tipo: rawTipo } = await context.params;
  const tipo = rawTipo as CondominioExportTipo;

  if (!["unidades", "cobrancas", "acordos"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo de exportação inválido." }, { status: 400 });
  }

  const result =
    tipo === "unidades"
      ? await exportUnidades(id)
      : tipo === "cobrancas"
        ? await exportCobrancas(id)
        : await exportAcordos(id);

  if (!result) return NextResponse.json({ error: "Condomínio não encontrado." }, { status: 404 });

  const fileName = `gkli-exportacao-${tipo}-${sanitizeFileName(result.condominio.nome)}.xlsx`;

  return new Response(result.buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
