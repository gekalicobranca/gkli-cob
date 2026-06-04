export type AgreementInsightInput = {
  valorTotal: number;
  quantidadeCobrancas: number;
  primeiroVencimento?: string | null;
  ultimoVencimento?: string | null;
  reincidencia?: number;
  rompimentos?: number;
  unidadeBloqueadaPorJudicializacao?: boolean;
};

export type AgreementInsight = {
  elegibilidade: "alta" | "media" | "baixa";
  elegibilidadeLabel: string;
  elegibilidadeMotivo: string;
  reincidenciaLabel: string;
  reincidenciaNivel: "baixa" | "media" | "alta";
  score: number;
  scoreLabel: string;
  maiorAtrasoDias: number;
  restricaoPrincipal: string;
  bloqueado: boolean;
};

function diffDaysFromToday(date?: string | null) {
  if (!date) return 0;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - parsed.getTime()) / 86400000));
}

export function calculateAgreementInsight(input: AgreementInsightInput): AgreementInsight {
  const reincidencia = Math.max(0, Number(input.reincidencia ?? 0));
  const rompimentos = Math.max(0, Number(input.rompimentos ?? 0));
  const maiorAtrasoDias = diffDaysFromToday(input.primeiroVencimento);
  const mesesAtraso = maiorAtrasoDias / 30;
  const valorTotal = Math.max(0, Number(input.valorTotal ?? 0));
  const bloqueado = Boolean(input.unidadeBloqueadaPorJudicializacao);

  let score = 92;
  if (valorTotal > 20000) score -= 10;
  if (valorTotal > 50000) score -= 14;
  if (mesesAtraso > 12) score -= 12;
  if (mesesAtraso > 24) score -= 18;
  if (input.quantidadeCobrancas > 12) score -= 8;
  if (input.quantidadeCobrancas > 24) score -= 8;
  score -= reincidencia * 6;
  score -= rompimentos * 18;
  if (bloqueado) score = Math.min(score, 20);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let elegibilidade: AgreementInsight["elegibilidade"] = "alta";
  let elegibilidadeMotivo = "Boa janela operacional para negociação.";
  if (bloqueado || rompimentos >= 2 || mesesAtraso > 24 || score < 45) {
    elegibilidade = "baixa";
    elegibilidadeMotivo = bloqueado
      ? "Unidade com judicialização ativa."
      : "Exige análise mais cautelosa antes da proposta.";
  } else if (rompimentos === 1 || mesesAtraso > 12 || valorTotal > 20000 || score < 72) {
    elegibilidade = "media";
    elegibilidadeMotivo = "Negociação possível, com atenção às condições.";
  }

  const reincidenciaNivel: AgreementInsight["reincidenciaNivel"] =
    reincidencia >= 3 ? "alta" : reincidencia >= 1 ? "media" : "baixa";
  const reincidenciaLabel =
    reincidencia === 0
      ? "Nunca negociou"
      : reincidencia === 1
        ? "1 acordo anterior"
        : `${reincidencia} acordos anteriores`;

  const scoreLabel =
    score >= 75
      ? "Alta chance de recuperação"
      : score >= 45
        ? "Chance média de recuperação"
        : "Baixa chance de recuperação";

  const restricaoPrincipal = bloqueado
    ? "Bloqueado por judicialização"
    : elegibilidade === "baixa"
      ? "Revisar antes de propor"
      : "Elegível";

  return {
    elegibilidade,
    elegibilidadeLabel: elegibilidade === "alta" ? "Alta" : elegibilidade === "media" ? "Média" : "Baixa",
    elegibilidadeMotivo,
    reincidenciaLabel,
    reincidenciaNivel,
    score,
    scoreLabel,
    maiorAtrasoDias,
    restricaoPrincipal,
    bloqueado,
  };
}
