export type PerfilUsuario = 'admin' | 'gestor' | 'operador' | 'leitura' | string

export function canAccessAdmin(perfil: PerfilUsuario) {
  return perfil === 'admin'
}

export function canAccessGestao(perfil: PerfilUsuario) {
  return perfil === 'admin' || perfil === 'gestor'
}

export function canWriteOperational(perfil: PerfilUsuario) {
  return perfil === 'admin' || perfil === 'gestor' || perfil === 'operador'
}

export function canReadOperational(perfil: PerfilUsuario) {
  return ['admin', 'gestor', 'operador', 'leitura'].includes(perfil)
}
