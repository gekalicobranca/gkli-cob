// A due date is a calendar day, not a UTC instant.
export function formatarVencimentoAcordo(value: string | null | undefined) {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "-";
}
