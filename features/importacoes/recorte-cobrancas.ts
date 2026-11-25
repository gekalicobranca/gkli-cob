import { somenteCobrancasCanonicas } from '../../lib/core/cobranca-arquivamento'
import { COBRANCA_STATUS_OPERACIONAL } from "@/lib/constants/cobrancas";

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: { removidas: number; retidas_por_envio: number } | null; error: { message: string } | null }>;
};

const TIMEZONE_OPERACIONAL = "America/Sao_Paulo";

export function anoCorrenteImportacao(referenceDate = new Date()) {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_OPERACIONAL,
    year: "numeric",
  }).format(referenceDate);

  return Number(year);
}

export function anoDoVencimento(value?: string | null) {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (iso) return Number(iso[1]);

  const br = raw.match(/^\d{2}\/\d{2}\/(\d{4})$/);
  if (br) return Number(br[1]);

  return null;
}

export function avaliarRecorteAnoCorrente(
  vencimento?: string | null,
  anoCorrente = anoCorrenteImportacao(),
) {
  const anoVencimento = anoDoVencimento(vencimento);
  const dentroDoAnoCorrente = anoVencimento === anoCorrente;

  return {
    anoCorrente,
    anoVencimento,
    dentroDoAnoCorrente,
    motivo: dentroDoAnoCorrente
      ? null
      : anoVencimento
        ? `Vencimento ${vencimento} pertence a ${anoVencimento}; a importação operacional considera apenas ${anoCorrente}.`
        : `Vencimento ${vencimento || "vazio"} sem ano válido; a importação operacional considera apenas ${anoCorrente}.`,
  };
}

export async function limparCobrancasDaNovaImportacao(
  supabase: SupabaseLike,
  params: {
    condominioIds: string[];
    carteiraId?: string | null;
    anoCorrente?: number;
    statusOperacionais?: string[];
  },
) {
  const condominioIds = Array.from(
    new Set(params.condominioIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  );

  if (condominioIds.length === 0) {
    throw new Error(
      "Não foi possível identificar os condomínios para limpar as cobranças anteriores.",
    );
  }

  const anoCorrente = params.anoCorrente ?? anoCorrenteImportacao();
  const statusOperacionais = params.statusOperacionais?.length
    ? params.statusOperacionais
    : [COBRANCA_STATUS_OPERACIONAL.NOVO];

  let query = somenteCobrancasCanonicas(supabase
    .from("cobrancas")
    // Preserva tanto o vínculo direto do acordo quanto as cobranças agrupadas.
    // O status operacional pode continuar como Novo mesmo com acordo existente.
    .select("id, acordo_cobrancas!left(id), acordos!left(id)"))
    .is("acordo_cobrancas", null)
    .is("acordos", null)
    .in("condominio_id", condominioIds)
    .in("status_operacional", statusOperacionais)
    .gte("vencimento", `${anoCorrente}-01-01`)
    .lte("vencimento", `${anoCorrente}-12-31`);

  if (params.carteiraId) {
    query = query.eq("carteira_id", params.carteiraId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao limpar cobranças anteriores: ${error.message}`);
  }

  const cobrancaIds = (data ?? [])
    .map((item: { id?: string | null }) => String(item.id ?? "").trim())
    .filter(Boolean);

  let removidas = 0;
  let retidasPorEnvio = 0;
  for (let index = 0; index < cobrancaIds.length; index += 500) {
    const { data: lote, error: limpezaError } = await supabase.rpc("limpar_lote_importacao_manual", {
      p_ids: cobrancaIds.slice(index, index + 500),
      p_ano: anoCorrente,
      p_status: statusOperacionais,
    });
    if (limpezaError || !lote) {
      throw new Error(`Erro ao limpar cobranças anteriores: ${limpezaError?.message ?? "resultado indisponível"}`);
    }
    removidas += lote.removidas;
    retidasPorEnvio += lote.retidas_por_envio;
  }

  return { removidas, retidasPorEnvio };
}
