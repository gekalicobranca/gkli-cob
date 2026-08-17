import { ACORDO_STATUS_VIGENTES } from "@/lib/constants/acordos";
import { COBRANCA_STATUS_OPERACIONAL } from "@/lib/constants/cobrancas";
import { normalizeStatus } from "@/lib/core/status";

type SupabaseLike = {
  from: (table: string) => any;
};

function textFromParts(parts: unknown[]) {
  return parts
    .map((part) => String(part ?? ""))
    .filter(Boolean)
    .join(" ");
}

export function isImportacaoPossivelAcordo(payload: Record<string, any> | null | undefined) {
  const observacoes = String(payload?.observacoes ?? "");
  const markerText = textFromParts([
    observacoes,
    payload?.marcadorOrigem,
    payload?.marcador_origem,
    payload?.marcador,
  ]);
  const situationText = textFromParts([
    observacoes,
    payload?.situacaoOrigem,
    payload?.situacao_origem,
    payload?.situacao,
  ]);

  return (
    /\bmarcador origem:\s*AE\b/i.test(markerText) ||
    normalizeStatus(markerText) === "ae" ||
    normalizeStatus(situationText).includes("acordo_extrajudicial")
  );
}

export async function unidadeTemAcordoVigente(
  supabase: SupabaseLike,
  unidadeId: string | null | undefined,
) {
  if (!unidadeId) return false;

  const { data, error } = await supabase
    .from("acordos")
    .select("id")
    .eq("unidade_id", unidadeId)
    .in("status", ACORDO_STATUS_VIGENTES as string[])
    .limit(1);

  if (error) {
    throw new Error(`Erro ao verificar acordo vigente da unidade: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

export async function statusOperacionalParaCobrancaImportada(
  supabase: SupabaseLike,
  payload: Record<string, any>,
) {
  const unidadeId = String(payload.unidade_id ?? "");
  if (unidadeId) {
    const { data: unidade, error } = await supabase
      .from("unidades")
      .select("acao_judicial")
      .eq("id", unidadeId)
      .maybeSingle();
    if (error) throw new Error(`Erro ao verificar ação judicial da unidade: ${error.message}`);
    if (unidade?.acao_judicial) return COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO;
  }

  if (!isImportacaoPossivelAcordo(payload)) return COBRANCA_STATUS_OPERACIONAL.NOVO;

  const temAcordo = await unidadeTemAcordoVigente(supabase, String(payload.unidade_id ?? ""));
  return temAcordo
    ? COBRANCA_STATUS_OPERACIONAL.NOVO
    : COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO;
}
