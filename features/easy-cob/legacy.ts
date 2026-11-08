export function easyLegacyUrl(query: Record<string, string | string[] | undefined>, simulation = false) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value ? [value] : []) params.append(key, item);
  const base = simulation ? '/app/configuracoes/easy/acordos/simular' : query.operacao ? '/app/configuracoes/easy/acordos' : '/app/configuracoes/easy';
  return `${base}${params.size ? `?${params}` : ''}`;
}
