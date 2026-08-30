const ADMINISTRADORA_ALIAS_LABELS: Record<string, string> = {
  bbz: 'BBZ',
  hflex: 'Hflex',
  lello: 'Lello',
  manager: 'Manager',
}

function compactAdministradoraName(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]/g, '')
}

export function getAdministradoraAliasKey(value: unknown) {
  const key = compactAdministradoraName(value)
  if (key === 'bbzcondopro') return 'bbz'
  return ADMINISTRADORA_ALIAS_LABELS[key] ? key : null
}

export function getAdministradoraAliasLabel(aliasKey: string) {
  return ADMINISTRADORA_ALIAS_LABELS[aliasKey] ?? aliasKey
}
