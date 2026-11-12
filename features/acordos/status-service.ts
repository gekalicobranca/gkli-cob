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
  acordoIds?: string[];
};

type ParcelaAcordoStatusRow = {
  id: string;
  acordo_id: string;
  vencimento: string;
  status: string;
};

export async function checkAcordosStatus(
  options: CheckAcordosStatusOptions = {},
  dependencies = { createAdminClient, registrarEventoOperacional },
) {
  const diasParaRomper = options.diasParaRomper ?? 30;
  const hojeISO = dataOperacionalAcordos();

  const supabase = dependencies.createAdminClient();

  // Reparos pontuais não devem processar outros acordos da carteira.
  if (options.acordoIds?.length === 0) throw new Error('Informe pelo menos um acordo.');
  const escopo = (query: any) => options.acordoIds ? query.in('acordo_id', options.acordoIds) : query;

  // A pausa de envios, sozinha, não suspende a apuração financeira. Esta marca
  // explícita impede inferir atraso, quebra ou quitação antes da conciliação.
  const emConciliacao = new Set<string>();
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await escopo(supabase.from('regua_pausas')
      .select('id, acordo_id, pausa_ate, payload').eq('ativo', true)
      .eq('payload->>conciliacao_pagamentos_pendente', 'true')
      .order('id').range(inicio, inicio + 499));
    if (error) throw new Error('Erro ao conferir pausas de conciliação: ' + error.message);
    for (const pausa of data ?? []) {
      const vigente = !pausa.pausa_ate || (pausa.pausa_ate.length === 10
        ? pausa.pausa_ate >= hojeISO : Date.parse(pausa.pausa_ate) >= Date.now());
      if (pausa.acordo_id && vigente) emConciliacao.add(pausa.acordo_id);
    }
    if ((data ?? []).length < 500) break;
  }

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

  const parcelasParaVencer = ((parcelasAbertasVencidas ??
    []) as ParcelaAcordoStatusRow[]).filter(p => !emConciliacao.has(p.acordo_id));

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
    if (emConciliacao.has(parcela.acordo_id)) continue;
    const lista = porAcordo.get(parcela.acordo_id) ?? [];
    lista.push(parcela);
    porAcordo.set(parcela.acordo_id, lista);
  }
  const candidatosQuitacao = [...porAcordo].filter(([, parcelas]) => parcelas.length > 0
    && parcelas.every(p => p.status === 'paga' || Boolean(p.data_pagamento))).map(([id]) => id);
  const valoresContratados = new Map<string, number>();
  const acordosElegiveisQuitacao = new Set<string>();
  for (let i = 0; i < candidatosQuitacao.length; i += 100) {
    const { data, error } = await supabase.from('acordos').select('id, valor_acordado, status')
      .in('id', candidatosQuitacao.slice(i, i + 100));
    if (error) throw new Error('Erro ao conferir saldo dos acordos: ' + error.message);
    for (const row of data ?? []) {
      valoresContratados.set(row.id, row.valor_acordado);
      if ([...ACORDO_STATUS_VIGENTES, ACORDO_STATUS.QUEBRADO].includes(row.status)) acordosElegiveisQuitacao.add(row.id);
    }
  }
  const classificados = [...porAcordo].map(([id, parcelas]) => ({
    id,
    status: classificarPrazoAcordo(parcelas, hojeISO, valoresContratados.get(id)),
  }));
  const acordoIdsComAtraso = classificados.filter(a => a.status === 'em_atraso').map(a => a.id);


  for (const status of [ACORDO_STATUS.ATIVO, ACORDO_STATUS.EM_DIA]) {
    for (const financeiro of ['em_aberto', 'parcial']) {
      const ids = classificados.filter(a => a.status === status
        && (porAcordo.get(a.id)!.some(p => p.status === 'paga' || Boolean(p.data_pagamento)) ? 'parcial' : 'em_aberto') === financeiro).map(a => a.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('acordos').update({ status, status_financeiro: financeiro })
          .in('id', ids.slice(i, i + 100)).in('status', [...ACORDO_STATUS_VIGENTES, ACORDO_STATUS.VENCIDO])
          .neq('status_financeiro', 'quitado');
        if (error) throw new Error('Erro ao atualizar situação do período: ' + error.message);
      }
    }
  }

  let acordosMarcadosEmAtraso = 0;
  const acordosRompidos = 0;
  const cobrancasAguardandoLiberacao = 0;
  let acordosQuitados = 0;

  for (const acordo of classificados.filter(a => a.status === 'quitado' && acordosElegiveisQuitacao.has(a.id))) {
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
    const idsAtraso = acordoIdsComAtraso;

    if (idsAtraso.length > 0) {
      const { error: atrasoError, count } = await supabase
        .from("acordos")
        .update({ status: ACORDO_STATUS.EM_ATRASO, status_financeiro: "vencido" }, { count: "exact" })
        .in("id", idsAtraso)
        .in("status", [ACORDO_STATUS.ATIVO, ACORDO_STATUS.EM_DIA])
        .neq("status_financeiro", "quitado");

      if (atrasoError) {
        throw new Error(
          `Erro ao marcar acordos em atraso: ${atrasoError.message}`,
        );
      }

      acordosMarcadosEmAtraso = count ?? 0;
    }
  }


  return {
    ok: true,
    quebraAutomatica: false,
    confirmacaoAdministradoraObrigatoria: true,
    hoje: hojeISO,
    diasParaRomper,
    diasParaAtraso: 1,
    parcelasMarcadasVencidas: parcelasParaVencer.length,
    acordosMarcadosEmAtraso,
    acordosRompidos,
    acordosQuitados,
    cobrancasAguardandoLiberacao,
  };
}
