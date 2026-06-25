import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { COBRANCA_STATUS_OPERACIONAIS_ATIVOS } from "@/lib/core/status";

export type ProximaAcaoInbox = {
  id: string;
  tipo: "importacao" | "cobranca" | "mensageria" | "cadastro" | "pendencia";
  prioridade: "alta" | "media" | "baixa";
  titulo: string;
  descricao: string;
  quantidade?: number;
  acaoLabel: string;
  acaoUrl: string;
};

function countValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasContact(row: any) {
  const unidade = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades;
  return Boolean(
    String(unidade?.telefone ?? "").trim() ||
      String(unidade?.email ?? "").trim(),
  );
}

async function safeCount(label: string, query: any) {
  const { count, error } = await query;
  if (error) {
    console.error(`Erro ao calcular próxima ação (${label}):`, error.message || error);
    return 0;
  }
  return countValue(count);
}

export async function getProximasAcoesInbox(scope: CarteiraScope): Promise<ProximaAcaoInbox[]> {
  const supabase = await createClient();

  let importacoesPendentesQuery = supabase
    .from("importacoes")
    .select("id", { count: "planned", head: true })
    .not("status", "in", "(confirmada,erro)");
  importacoesPendentesQuery = applyCarteiraScope(importacoesPendentesQuery, scope.carteiraIds);

  let pendenciasAbertasQuery = supabase
    .from("central_pendencias")
    .select("id", { count: "planned", head: true })
    .not("status", "in", "(resolvida,cancelada)");
  pendenciasAbertasQuery = applyCarteiraScope(pendenciasAbertasQuery, scope.carteiraIds);

  let pendenciasCriticasQuery = supabase
    .from("central_pendencias")
    .select("id", { count: "planned", head: true })
    .eq("prioridade", "critica")
    .not("status", "in", "(resolvida,cancelada)");
  pendenciasCriticasQuery = applyCarteiraScope(pendenciasCriticasQuery, scope.carteiraIds);

  let lotesComErroQuery = supabase
    .from("lotes")
    .select("id", { count: "planned", head: true })
    .or("status.eq.erro,status.eq.concluido_com_falhas,total_erros.gt.0");
  lotesComErroQuery = applyCarteiraScope(lotesComErroQuery, scope.carteiraIds);

  let lotesGeradosQuery = supabase
    .from("lotes")
    .select("id", { count: "planned", head: true })
    .eq("status", "gerado");
  lotesGeradosQuery = applyCarteiraScope(lotesGeradosQuery, scope.carteiraIds);

  let cobrancasContatoQuery = supabase
    .from("cobrancas")
    .select("id, unidades(telefone,email)")
    .in("status_operacional", COBRANCA_STATUS_OPERACIONAIS_ATIVOS as string[])
    .limit(500);
  cobrancasContatoQuery = applyCarteiraScope(cobrancasContatoQuery, scope.carteiraIds);

  const [
    importacoesPendentes,
    pendenciasAbertas,
    pendenciasCriticas,
    lotesComErro,
    lotesGerados,
    cobrancasContatoResult,
  ] = await Promise.all([
    safeCount("importações pendentes", importacoesPendentesQuery),
    safeCount("pendências abertas", pendenciasAbertasQuery),
    safeCount("pendências críticas", pendenciasCriticasQuery),
    safeCount("lotes com erro", lotesComErroQuery),
    safeCount("lotes gerados", lotesGeradosQuery),
    cobrancasContatoQuery,
  ]);

  if (cobrancasContatoResult.error) {
    console.error(
      "Erro ao calcular próxima ação (cobranças sem contato):",
      cobrancasContatoResult.error.message || cobrancasContatoResult.error,
    );
  }

  const cobrancasBase = cobrancasContatoResult.error ? [] : cobrancasContatoResult.data ?? [];
  const cobrancasSemContato = cobrancasBase.filter((row: any) => !hasContact(row)).length;
  const cobrancasComContato = cobrancasBase.filter(hasContact).length;

  const sugestoes: ProximaAcaoInbox[] = [];

  if (pendenciasCriticas > 0) {
    sugestoes.push({
      id: "pendencias-criticas",
      tipo: "pendencia",
      prioridade: "alta",
      titulo: `${pendenciasCriticas} pendência${pendenciasCriticas === 1 ? "" : "s"} crítica${pendenciasCriticas === 1 ? "" : "s"}`,
      descricao: "Há travas operacionais com prioridade crítica aguardando decisão do time.",
      quantidade: pendenciasCriticas,
      acaoLabel: "Ver críticas",
      acaoUrl: "/app/pendencias?prioridade=critica",
    });
  } else if (pendenciasAbertas > 0) {
    sugestoes.push({
      id: "pendencias-abertas",
      tipo: "pendencia",
      prioridade: "media",
      titulo: `${pendenciasAbertas} pendência${pendenciasAbertas === 1 ? "" : "s"} aberta${pendenciasAbertas === 1 ? "" : "s"}`,
      descricao: "Revise a fila antes de avançar com novas importações ou lotes.",
      quantidade: pendenciasAbertas,
      acaoLabel: "Abrir pendências",
      acaoUrl: "/app/pendencias?status=aberta",
    });
  }

  if (importacoesPendentes > 0) {
    sugestoes.push({
      id: "importacoes-pendentes",
      tipo: "importacao",
      prioridade: "alta",
      titulo: `${importacoesPendentes} importação${importacoesPendentes === 1 ? "" : "ões"} em revisão`,
      descricao: "Existe preview aguardando confirmação ou correção antes de gravar dados definitivos.",
      quantidade: importacoesPendentes,
      acaoLabel: "Ver importações",
      acaoUrl: "/app/importacoes",
    });
  }

  if (lotesComErro > 0) {
    sugestoes.push({
      id: "lotes-com-erro",
      tipo: "mensageria",
      prioridade: "alta",
      titulo: `${lotesComErro} lote${lotesComErro === 1 ? "" : "s"} com falha`,
      descricao: "Há processamento de régua ou mensageria que precisa de revisão operacional.",
      quantidade: lotesComErro,
      acaoLabel: "Revisar lotes",
      acaoUrl: "/app/lotes?resultado=com_erros",
    });
  } else if (lotesGerados > 0) {
    sugestoes.push({
      id: "lotes-gerados",
      tipo: "mensageria",
      prioridade: "media",
      titulo: `${lotesGerados} lote${lotesGerados === 1 ? "" : "s"} gerado${lotesGerados === 1 ? "" : "s"}`,
      descricao: "Confira os itens e aprove o próximo passo antes de qualquer envio.",
      quantidade: lotesGerados,
      acaoLabel: "Abrir lotes",
      acaoUrl: "/app/lotes?status=gerado",
    });
  }

  if (cobrancasSemContato > 0) {
    sugestoes.push({
      id: "cobrancas-sem-contato",
      tipo: "cadastro",
      prioridade: "media",
      titulo: `${cobrancasSemContato} cobrança${cobrancasSemContato === 1 ? "" : "s"} sem contato`,
      descricao: "Há cobranças acionáveis sem telefone ou e-mail vinculado à unidade.",
      quantidade: cobrancasSemContato,
      acaoLabel: "Ver saneamento",
      acaoUrl: "/app/mensageria/saneamento",
    });
  } else if (cobrancasComContato > 0) {
    sugestoes.push({
      id: "cobrancas-com-contato",
      tipo: "cobranca",
      prioridade: "baixa",
      titulo: `${cobrancasComContato} cobrança${cobrancasComContato === 1 ? "" : "s"} com contato`,
      descricao: "A base tem cobranças acionáveis com destinatário encontrado para simulação de régua.",
      quantidade: cobrancasComContato,
      acaoLabel: "Abrir simulador",
      acaoUrl: "/app/mensageria/simulador?aba=cobrancas&contato=com_destinatario",
    });
  }

  const prioridadePeso = { alta: 0, media: 1, baixa: 2 };
  return sugestoes.sort((a, b) => prioridadePeso[a.prioridade] - prioridadePeso[b.prioridade]);
}
