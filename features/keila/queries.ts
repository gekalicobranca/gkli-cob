import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { COBRANCA_STATUS } from "@/lib/core/status";
import {
  getCobrancaStatusFinanceiro,
  getCobrancaStatusOperacional,
} from "@/lib/core/cobranca-status";

type KeilaCobranca = {
  id: string;
  carteira_id: string | null;
  condominio_id: string | null;
  valor_atualizado: number | string | null;
  status: string | null;
  status_operacional?: string | null;
  status_financeiro?: string | null;
  condominios?:
    | { nome?: string | null; operacao_virtual_habilitada?: boolean | null }
    | Array<{ nome?: string | null; operacao_virtual_habilitada?: boolean | null }>
    | null;
};

const CLOSED_COBRANCA_STATUSES = [
  COBRANCA_STATUS.ACORDO_EFETIVADO,
  COBRANCA_STATUS.PRE_JURIDICO,
  COBRANCA_STATUS.JUDICIALIZADO,
  COBRANCA_STATUS.SUSPENSO,
  "quitado",
  "pago",
];

function money(value: unknown) {
  return Number(value ?? 0) || 0;
}

function relationOne<T>(relation?: T | T[] | null) {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function condominioName(row: KeilaCobranca) {
  return relationOne(row.condominios)?.nome ?? "Sem condomínio";
}

function virtualEnabled(row: KeilaCobranca) {
  return relationOne(row.condominios)?.operacao_virtual_habilitada === true;
}

function isActiveCobranca(row: KeilaCobranca) {
  const operationalStatus = getCobrancaStatusOperacional(row);
  const financialStatus = getCobrancaStatusFinanceiro(row);
  return !CLOSED_COBRANCA_STATUSES.includes(operationalStatus) && financialStatus !== "quitado";
}

export async function getKeilaEligibilitySummary(scope: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("cobrancas")
    .select(
      `
      id,
      carteira_id,
      condominio_id,
      valor_atualizado,
      status,
      status_operacional,
      status_financeiro,
      condominios(nome, operacao_virtual_habilitada)
    `,
    );

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao carregar elegibilidade da Keila: ${error.message}`);
  }

  const activeRows = ((data ?? []) as KeilaCobranca[]).filter(isActiveCobranca);
  const enabledRows = activeRows.filter(virtualEnabled);
  const blockedRows = activeRows.filter((row) => !virtualEnabled(row));
  const enabledCondominios = new Set(enabledRows.map((row) => row.condominio_id).filter(Boolean));
  const blockedCondominiosMap = new Map<string, { nome: string; count: number; value: number }>();

  for (const row of blockedRows) {
    const key = row.condominio_id ?? condominioName(row);
    const current = blockedCondominiosMap.get(key) ?? {
      nome: condominioName(row),
      count: 0,
      value: 0,
    };
    current.count += 1;
    current.value += money(row.valor_atualizado);
    blockedCondominiosMap.set(key, current);
  }

  return {
    activeTotal: activeRows.length,
    activeValue: activeRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0),
    enabledTotal: enabledRows.length,
    enabledValue: enabledRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0),
    blockedByCondominioFlag: blockedRows.length,
    blockedValue: blockedRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0),
    enabledCondominios: enabledCondominios.size,
    blockedCondominios: Array.from(blockedCondominiosMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  };
}

export async function listCondominiosKeilaTeste(scope: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("condominios")
    .select("id, nome, carteira_id, regua_cobranca_id")
    .eq("operacao_virtual_habilitada", true)
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao carregar condominios habilitados para Keila: ${error.message}`);
  }

  return (data ?? []) as Array<{
    id: string;
    nome: string | null;
    carteira_id: string | null;
    regua_cobranca_id: string | null;
  }>;
}
