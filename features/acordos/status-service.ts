import { createAdminClient } from "@/utils/supabase/admin";
import {
  ACORDO_STATUS,
  PARCELA_ACORDO_STATUS,
} from "@/lib/core/status";
import { registrarEventoOperacional } from "@/features/operacional/service";
import { ACORDO_STATUS_VIGENTES } from '@/lib/constants/acordos';
import { dataOperacionalAcordos, classificarPrazoAcordo } from './atraso-calendario';

type CheckAcordosStatusOptions = {
  diasParaRomper?: number;
  diasParaAtraso?: number;
  acordoIds?: string[];
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

export async function checkAcordosStatus(
  options: CheckAcordosStatusOptions = {},
  dependencies = { createAdminClient, registrarEventoOperacional },
) {
  const diasParaRomper = options.diasParaRomper ?? 30;
  const diasParaAtraso = options.diasParaAtraso ?? 15;
  if (diasParaAtraso < 1 || diasParaRomper <= diasParaAtraso) throw new Error('Prazos de atraso e quebra inválidos.');
  const hojeISO = dataOperacionalAcordos();

  const supabase = dependencies.createAdminClient();

  // Reparos pontuais não devem processar outros acordos da carteira.
  if (options.acordoIds?.length === 0) throw new Error('Informe pelo menos um acordo.');
  const escopo = (query: any) => options.acordoIds ? query.in('acordo_id', options.acordoIds) : query;

  const { data: parcelasAbertasVencidas, error: parcelasError } = await escopo(supabase
    .from("parcelas_acordo")
    .select("id, acordo_id, vencimento, status")
    .eq("status", PARCELA_ACORDO_STATUS.PENDENTE)
    .is("data_pagamento", null)
    .lt("vencimento", hojeISO));

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
      .in("id", ids)
      .eq("status", PARCELA_ACORDO_STATUS.PENDENTE)
      .is("data_pagamento", null);

    if (updateParcelasError) {
      throw new Error(
        `Erro ao atualizar parcelas vencidas: ${updateParcelasError.message}`,
      );
    }
  }

  // A quitação precisa do cronograma completo, além do limite padrão da API.
  const parcelasConferidas: any[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await escopo(supabase.from('parcelas_acordo')
      .select('id, acordo_id, numero, vencimento, status, data_pagamento, valor')
      .order('id').range(inicio, inicio + 499));
    if (error) throw new Error('Erro ao conferir cronograma dos acordos: ' + error.message);
    parcelasConferidas.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }

  const porAcordo = new Map<string, any[]>();
  for (const parcela of parcelasConferidas) {
    const lista = porAcordo.get(parcela.acordo_id) ?? [];
    lista.push(parcela);
    porAcordo.set(parcela.acordo_id, lista);
  }
  const candidatosQuitacao = [...porAcordo].filter(([, parcelas]) => parcelas.length > 0
    && parcelas.every(p => p.status === 'paga' || Boolean(p.data_pagamento))).map(([id]) => id);
  const valoresContratados = new Map<string, number>();
  for (let i = 0; i < candidatosQuitacao.length; i += 100) {
    const { data, error } = await supabase.from('acordos').select('id, valor_acordado')
      .in('id', candidatosQuitacao.slice(i, i + 100));
    if (error) throw new Error('Erro ao conferir saldo dos acordos: ' + error.message);
    for (const row of data ?? []) valoresContratados.set(row.id, row.valor_acordado);
  }
  const classificados = [...porAcordo].map(([id, parcelas]) => ({ id,
    status: classificarPrazoAcordo(parcelas, hojeISO, diasParaAtraso, diasParaRomper, valoresContratados.get(id)) }));
  const acordoIdsComAtraso = classificados.filter(a => a.status === 'em_atraso').map(a => a.id);
  const acordoIdsParaRomper = classificados.filter(a => a.status === 'quebrado').map(a => a.id);

  for (const status of [ACORDO_STATUS.ATIVO, ACORDO_STATUS.EM_DIA]) {
    for (const financeiro of ['em_aberto', 'parcial']) {
      const ids = classificados.filter(a => a.status === status
        && (porAcordo.get(a.id)!.some(p => p.status === 'paga' || Boolean(p.data_pagamento)) ? 'parcial' : 'em_aberto') === financeiro).map(a => a.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('acordos').update({ status, status_financeiro: financeiro })
          .in('id', ids.slice(i, i + 100)).in('status', ACORDO_STATUS_VIGENTES);
        if (error) throw new Error('Erro ao atualizar situação do período: ' + error.message);
      }
    }
  }

  let acordosMarcadosEmAtraso = 0;
  let acordosRompidos = 0;
  let cobrancasAguardandoLiberacao = 0;
  let acordosQuitados = 0;

  for (const acordo of classificados.filter(a => a.status === 'quitado')) {
    const pagamentos = porAcordo.get(acordo.id)!.map(p => p.data_pagamento).filter(Boolean).sort();
    const dataQuitacao = pagamentos.at(-1) ?? hojeISO;
    const { data, error } = await supabase.from('acordos').update({
      status: ACORDO_STATUS.QUITADO, status_financeiro: 'quitado', data_quitacao: dataQuitacao,
    }).eq('id', acordo.id).eq('valor_acordado', valoresContratados.get(acordo.id))
      .in('status', [...ACORDO_STATUS_VIGENTES, ACORDO_STATUS.QUEBRADO])
      .select('id,carteira_id,status');
    if (error) throw new Error('Erro ao quitar acordo sem saldo: ' + error.message);
    for (const row of data ?? []) {
      acordosQuitados++;
      await dependencies.registrarEventoOperacional(supabase as any, {
        carteiraId: row.carteira_id, entidadeTipo: 'acordo', entidadeId: row.id,
        eventoCodigo: 'acordo.quitado', titulo: 'Acordo quitado pela conferência das parcelas',
        descricao: 'Todas as parcelas pagas e total pago cobrindo o valor contratado.',
        depois: { status: 'quitado', status_financeiro: 'quitado', data_quitacao: dataQuitacao },
        origem: 'sistema', auditavel: true, required: true,
      });
    }
  }

  if (acordoIdsComAtraso.length > 0) {
    const idsAtraso = acordoIdsComAtraso.filter(
      (id) => !acordoIdsParaRomper.includes(id),
    );

    if (idsAtraso.length > 0) {
      const { error: atrasoError, count } = await supabase
        .from("acordos")
        .update({ status: ACORDO_STATUS.EM_ATRASO, status_financeiro: "vencido" }, { count: "exact" })
        .in("id", idsAtraso)
        .in("status", [ACORDO_STATUS.ATIVO, ACORDO_STATUS.EM_DIA]);

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
      .in("status", ACORDO_STATUS_VIGENTES);

    if (acordosError) {
      throw new Error(
        `Erro ao carregar acordos para romper: ${acordosError.message}`,
      );
    }

    let acordos = (acordosParaRomper ?? []) as AcordoStatusRow[];
    let acordoIds = acordos.map((acordo) => acordo.id);

    if (acordoIds.length > 0) {
      const { data: alterados, error: rompidoError, count } = await supabase
        .from("acordos")
        .update(
          {
            status: ACORDO_STATUS.QUEBRADO,
            status_financeiro: "vencido",
            data_quebra: hojeISO,
          },
          { count: "exact" },
        )
        .in("id", acordoIds)
        .in("status", ACORDO_STATUS_VIGENTES)
        .select('id');

      if (rompidoError) {
        throw new Error(
          `Erro ao marcar acordos quebrados: ${rompidoError.message}`,
        );
      }

      acordosRompidos = count ?? 0;
      const idsAlterados = new Set((alterados ?? []).map((row) => row.id));
      acordos = acordos.filter((acordo) => idsAlterados.has(acordo.id));
      acordoIds = acordos.map((acordo) => acordo.id);

      for (const acordo of acordos) {
        if (!acordo.unidade_id) continue;
        await dependencies.registrarEventoOperacional(supabase as any, {
          carteiraId: acordo.carteira_id,
          entidadeTipo: "unidade",
          entidadeId: acordo.unidade_id,
          eventoCodigo: "unidade.acordo.quebrado",
          titulo: `Acordo quebrado em D+${diasParaRomper}`,
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
    diasParaAtraso,
    parcelasMarcadasVencidas: parcelasParaVencer.length,
    acordosMarcadosEmAtraso,
    acordosRompidos,
    acordosQuitados,
    cobrancasAguardandoLiberacao,
  };
}
