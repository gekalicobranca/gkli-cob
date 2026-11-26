export const ACORDO_ORIGEM_LABEL = {
  carteira: "Da GEKALI",
  externo: "Externo à GEKALI",
  a_confirmar: "Origem a confirmar",
} as const;

export type AcordoOrigem = keyof typeof ACORDO_ORIGEM_LABEL;

export type FiltroOrigemAcordo = AcordoOrigem | "todas";

export function filtroOrigemAcordo(value: unknown): FiltroOrigemAcordo {
  return value === "todas" || isAcordoOrigem(value) ? value : "carteira";
}

export function isAcordoOrigem(value: unknown): value is AcordoOrigem {
  return typeof value === "string" && Object.hasOwn(ACORDO_ORIGEM_LABEL, value);
}
