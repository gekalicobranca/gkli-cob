import { COBRANCA_STATUS_OPERACIONAL } from "@/lib/constants/cobrancas";

type SupabaseLike = {
  from: (table: string) => any;
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

  let query = supabase
    .from("cobrancas")
    .delete()
    .in("condominio_id", condominioIds)
    .in("status_operacional", statusOperacionais)
    .gte("vencimento", `${anoCorrente}-01-01`)
    .lte("vencimento", `${anoCorrente}-12-31`);

  if (params.carteiraId) {
    query = query.eq("carteira_id", params.carteiraId);
  }

  const { data, error } = await query.select("id");

  if (error) {
    throw new Error(`Erro ao limpar cobranças anteriores: ${error.message}`);
  }

  return data?.length ?? 0;
}
