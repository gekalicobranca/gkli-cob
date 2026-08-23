import { createAdminClient } from "@/utils/supabase/admin";
import {
  ACORDO_STATUS,
  PARCELA_ACORDO_STATUS,
} from "@/lib/core/status";
import { registrarEventoOperacional } from "@/features/operacional/service";

type CheckAcordosStatusOptions = {
  diasParaRomper?: number;
};

type ParcelaAcordoStatusRow = {
  id: string;
  acordo_id: string;
  vencimento: string;
  status: string;
};

type AcordoStatusRow = {
  id: string;
  cobranca_id: string | null;
  carteira_id: string | null;
  condominio_id: string | null;
  unidade_id: string | null;
  status: string;
};

type AcordoCobrancaStatusRow = {
  acordo_id: string;
  cobranca_id: string;
};

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function diffDays(from: Date, to: Date) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function checkAcordosStatus(
  options: CheckAcordosStatusOptions = {},
) {
  const diasParaRomper = options.diasParaRomper ?? 7;
  const hoje = new Date();
  const hojeISO = toISODate(hoje);

  const supabase = createAdminClient();

  const { data: parcelasAbertasVencidas, error: parcelasError } = await supabase
    .from("parcelas_acordo")
    .select("id, acordo_id, vencimento, status")
    .eq("status", PARCELA_ACORDO_STATUS.PENDENTE)
    .lt("vencimento", hojeISO);

  if (parcelasError) {
    throw new Error(
      `Erro ao buscar parcelas vencidas: ${parcelasError.message}`,
    );
  }

  const parcelasParaVencer = (parcelasAbertasVencidas ??
    []) as ParcelaAcordoStatusRow[];

  if (parcelasParaVencer.length > 0) {
    const ids = parcelasParaVencer.map((parcela) => parcela.id);

    const { error: updateParcelasError } = await supabase
      .from("parcelas_acordo")
      .update({ status: PARCELA_ACORDO_STATUS.VENCIDA })
      .in("id", ids);

    if (updateParcelasError) {
      throw new Error(
        `Erro ao atualizar parcelas vencidas: ${updateParcelasError.message}`,
      );
    }
  }

  const { data: parcelasVencidas, error: vencidasError } = await supabase
    .from("parcelas_acordo")
    .select("id, acordo_id, vencimento, status")
    .eq("status", PARCELA_ACORDO_STATUS.VENCIDA);

  if (vencidasError) {
    throw new Error(
      `Erro ao carregar parcelas vencidas: ${vencidasError.message}`,
    );
  }

  const vencidas = (parcelasVencidas ?? []) as ParcelaAcordoStatusRow[];
  const acordoIdsComAtraso = [
    ...new Set(vencidas.map((parcela) => parcela.acordo_id)),
  ];
  const acordoIdsParaRomper = [
    ...new Set(
      vencidas
        .filter(
          (parcela) =>
            diffDays(new Date(`${parcela.vencimento}T00:00:00`), hoje) >=
            diasParaRomper,
        )
        .map((parcela) => parcela.acordo_id),
    ),
  ];

  let acordosMarcadosEmAtraso = 0;
  let acordosRompidos = 0;
  let cobrancasAguardandoLiberacao = 0;

  if (acordoIdsComAtraso.length > 0) {
    const idsAtraso = acordoIdsComAtraso.filter(
      (id) => !acordoIdsParaRomper.includes(id),
    );

    if (idsAtraso.length > 0) {
      const { error: atrasoError, count } = await supabase
        .from("acordos")
        .update({ status: ACORDO_STATUS.EM_ATRASO, status_financeiro: "vencido" }, { count: "exact" })
        .in("id", idsAtraso)
        .in("status", [ACORDO_STATUS.ATIVO]);

      if (atrasoError) {
        throw new Error(
          `Erro ao marcar acordos em atraso: ${atrasoError.message}`,
        );
      }

      acordosMarcadosEmAtraso = count ?? 0;
    }
  }

  if (acordoIdsParaRomper.length > 0) {
    const { data: acordosParaRomper, error: acordosError } = await supabase
      .from("acordos")
      .select("id, cobranca_id, carteira_id, condominio_id, unidade_id, status")
      .in("id", acordoIdsParaRomper)
      .in("status", [ACORDO_STATUS.ATIVO, ACORDO_STATUS.EM_ATRASO]);

    if (acordosError) {
      throw new Error(
        `Erro ao carregar acordos para romper: ${acordosError.message}`,
      );
    }

    const acordos = (acordosParaRomper ?? []) as AcordoStatusRow[];
    const acordoIds = acordos.map((acordo) => acordo.id);

    if (acordoIds.length > 0) {
      const { error: rompidoError, count } = await supabase
        .from("acordos")
        .update(
          {
            status: ACORDO_STATUS.QUEBRADO,
            status_financeiro: "vencido",
            data_quebra: hojeISO,
          },
          { count: "exact" },
        )
        .in("id", acordoIds);

      if (rompidoError) {
        throw new Error(
          `Erro ao marcar acordos quebrados: ${rompidoError.message}`,
        );
      }

      acordosRompidos = count ?? 0;

      for (const acordo of acordos) {
        if (!acordo.unidade_id) continue;
        await registrarEventoOperacional(supabase as any, {
          carteiraId: acordo.carteira_id,
          entidadeTipo: "unidade",
          entidadeId: acordo.unidade_id,
          eventoCodigo: "unidade.acordo.quebrado",
          titulo: "Acordo quebrado em D+7",
          descricao: "Unidade aguardando decisão do operador para voltar à cobrança ativa ou seguir para outro destino.",
          severidade: "alerta",
          payload: { acordo_id: acordo.id, condominio_id: acordo.condominio_id, cobranca_id: acordo.cobranca_id },
          estadoAnterior: acordo.status,
          estadoNovo: ACORDO_STATUS.QUEBRADO,
          origem: "sistema",
          auditavel: true,
          required: true,
        });
      }
    }

    const { data: vinculosCobrancas, error: vinculosError } = await supabase
      .from("acordo_cobrancas")
      .select("acordo_id, cobranca_id")
      .in("acordo_id", acordoIds);

    if (vinculosError) {
      throw new Error(
        `Erro ao carregar cobranças vinculadas aos acordos: ${vinculosError.message}`,
      );
    }

    const cobrancaIds = [
      ...new Set(
        [
          ...((vinculosCobrancas ?? []) as AcordoCobrancaStatusRow[]).map(
            (vinculo) => vinculo.cobranca_id,
          ),
          ...acordos.map((acordo) => acordo.cobranca_id),
        ]
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    cobrancasAguardandoLiberacao = cobrancaIds.length;
  }

  return {
    ok: true,
    hoje: hojeISO,
    diasParaRomper,
    parcelasMarcadasVencidas: parcelasParaVencer.length,
    acordosMarcadosEmAtraso,
    acordosRompidos,
    cobrancasAguardandoLiberacao,
  };
}
