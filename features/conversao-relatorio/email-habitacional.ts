/** O cadastro da unidade aceita um único endereço. Mantém a ordem do relatório. */
export function primeiroEmailHabitacional(campo: unknown): string | undefined {
  if (typeof campo !== "string") return undefined;
  return campo.split(/[\s,;|]+/).find(email => /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i.test(email));
}
