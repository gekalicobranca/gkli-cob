export type WorkspaceRiskLevel = "baixo" | "medio" | "alto" | "critico";

export type WorkspaceIntelligenceInput = {
  statusOperacional?: string | null;
  statusFinanceiro?: string | null;
  vencimento?: string | null;
  valorAtualizado?: number | null;
  valorNegociacao?: number | null;
  ultimaInteracaoAt?: string | null;
  temAcordoVigente?: boolean;
  totalInteracoes?: number;
  totalMensagens?: number;
};

export type WorkspaceIntelligence = {
  atraso: number;
  score: number;
  risco: WorkspaceRiskLevel;
  acaoPrincipal: string;
  foco: string;
  resumo: string;
  alertas: string[];
  sugestoes: string[];
};

export function calcularDiasDeAtraso(vencimento?: string | null) {
  if (!vencimento) return 0;

  const base = new Date(`${vencimento}T00:00:00`);
  if (Number.isNaN(base.getTime())) return 0;

  const hoje = new Date();
  const diff = Math.floor(
    (hoje.getTime() - base.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0, diff);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRisk(score: number): WorkspaceRiskLevel {
  if (score >= 85) return "critico";
  if (score >= 65) return "alto";
  if (score >= 40) return "medio";
  return "baixo";
}

export function getWorkspaceIntelligence(
  input: WorkspaceIntelligenceInput,
): WorkspaceIntelligence {
  const atraso = calcularDiasDeAtraso(input.vencimento);
  const valor = Number(input.valorNegociacao ?? input.valorAtualizado ?? 0);
  const semInteracao =
    !input.ultimaInteracaoAt && Number(input.totalInteracoes ?? 0) === 0;
  const temAcordo = Boolean(input.temAcordoVigente);
  const emNegociacao = input.statusOperacional === "em_negociacao";
  const preJuridico = input.statusOperacional === "pre_juridico";
  const judicializado = input.statusOperacional === "judicializado";

  let score = 10;
  score +=
    atraso >= 90
      ? 38
      : atraso >= 60
        ? 28
        : atraso >= 30
          ? 18
          : atraso >= 15
            ? 10
            : 4;
  score +=
    valor >= 20000
      ? 24
      : valor >= 10000
        ? 18
        : valor >= 5000
          ? 12
          : valor >= 2000
            ? 7
            : 3;
  score += semInteracao ? 14 : 0;
  score += emNegociacao ? 10 : 0;
  score -= temAcordo ? 25 : 0;
  score -= preJuridico ? 10 : 0;
  score -= judicializado ? 20 : 0;
  score = clamp(Math.round(score), 0, 100);

  const risco = getRisk(score);
  const alertas: string[] = [];
  const sugestoes: string[] = [];

  if (temAcordo) {
    alertas.push(
      "Acordo vigente: priorize preservação de cumprimento, não reabertura da cobrança.",
    );
    sugestoes.push(
      "Conferir próxima parcela e registrar contato preventivo se houver risco de atraso.",
    );
  }

  if (semInteracao) {
    alertas.push(
      "Sem interação registrada: a primeira anotação aumenta rastreabilidade e reduz ruído futuro.",
    );
    sugestoes.push(
      "Registrar contato objetivo com canal utilizado e retorno esperado.",
    );
  }

  if (atraso >= 60) {
    alertas.push(
      "Atraso avançado: caso pede prazo de resposta e proposta estruturada.",
    );
    sugestoes.push(
      "Enviar abordagem direta com valor atualizado, alternativa de acordo e data limite.",
    );
  } else if (atraso >= 30) {
    sugestoes.push(
      "Cobrança madura para proposta simples e registro imediato da próxima ação.",
    );
  }

  if (valor >= 10000) {
    alertas.push(
      "Valor relevante: não deixar o caso sem próximo passo agendado.",
    );
  }

  if (emNegociacao) {
    sugestoes.push(
      "Negociação aberta: formalizar proposta ou converter em acordo para evitar dispersão.",
    );
  }

  if (preJuridico) {
    alertas.push(
      "Pré-jurídico: cobrança fora da cadência extrajudicial e em preparação documental.",
    );
    sugestoes.push(
      "Registrar checklist de documentos e próximo marco antes da judicialização.",
    );
  }

  if (alertas.length === 0) {
    alertas.push(
      "Caso operacionalmente controlado. Melhor ganho está em manter cadência e registrar próximo passo.",
    );
  }

  if (sugestoes.length === 0) {
    sugestoes.push(
      "Validar contato, registrar interação e manter a cobrança visível na fila operacional.",
    );
  }

  const acaoPrincipal = temAcordo
    ? "Acompanhar acordo"
    : preJuridico
      ? "Preparar documentação"
    : emNegociacao
      ? "Formalizar proposta"
      : semInteracao
        ? "Fazer primeiro contato"
        : atraso >= 60
          ? "Enviar proposta objetiva"
          : "Registrar próximo passo";

  const foco = temAcordo
    ? "Cumprimento"
    : preJuridico
      ? "Pré-jurídico"
    : risco === "critico"
      ? "Intervenção imediata"
      : risco === "alto"
        ? "Negociação ativa"
        : risco === "medio"
          ? "Cadência de contato"
          : "Monitoramento";

  const resumo = `${foco} · risco ${risco} · ${atraso} dias de atraso`;

  return {
    atraso,
    score,
    risco,
    acaoPrincipal,
    foco,
    resumo,
    alertas: alertas.slice(0, 3),
    sugestoes: sugestoes.slice(0, 3),
  };
}
