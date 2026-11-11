export function nomeCondominioEasy(nome: string, operacional?: string | null) {
  const oficial = nome.trim();
  const curto = operacional?.trim();
  return curto && curto.toLocaleLowerCase("pt-BR") !== oficial.toLocaleLowerCase("pt-BR")
    ? `${curto} — ${oficial}`
    : oficial;
}
