export const PRE_JURIDICO_EVENT_CODES = {
  historico: "acordo.pre_juridico.historico_gerado",
  listaAdministradora: "acordo.pre_juridico.lista_administradora_gerada",
  procuracao: "acordo.pre_juridico.procuracao_gerada",
} as const;

export type PreJuridicoStepKey = keyof typeof PRE_JURIDICO_EVENT_CODES;
export type PreJuridicoSteps = Record<PreJuridicoStepKey, boolean>;

export const PRE_JURIDICO_REQUIRED_STEPS = Object.keys(
  PRE_JURIDICO_EVENT_CODES,
) as PreJuridicoStepKey[];

export function criarPreJuridicoSteps(): PreJuridicoSteps {
  return {
    historico: false,
    listaAdministradora: false,
    procuracao: false,
  };
}

export function etapaPreJuridicoPorEvento(eventoCodigo: string | null | undefined) {
  const code = String(eventoCodigo ?? "");
  return PRE_JURIDICO_REQUIRED_STEPS.find(
    (step) => PRE_JURIDICO_EVENT_CODES[step] === code,
  ) ?? null;
}

export function preJuridicoStepsCompletos(steps: Partial<PreJuridicoSteps> | null | undefined) {
  return PRE_JURIDICO_REQUIRED_STEPS.every((step) => Boolean(steps?.[step]));
}
