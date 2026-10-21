export function supervisorConfiguration(value) {
  if (value === undefined) return { sessions: ['genske', 'gekali', 'azevedo'], lock: 'supervisor.lock' }
  // Keep the new connector isolated from the supervisor already serving the other wallets.
  if (value === 'escritorio') return { sessions: ['escritorio'], lock: 'supervisor-escritorio.lock' }
  throw new Error('Grupo de sessões inválido. Use escritorio ou omita WHATSAPP_WEB_SUPERVISOR_SESSIONS.')
}
