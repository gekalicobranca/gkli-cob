export function assertMessageRoute(route, session, phone, wallet) {
  if (!route || route.transporte !== 'web' || route.sessao !== session ||
      route.numero !== phone || route.carteira_id !== wallet) {
    throw new Error('Configuração do remetente da mensagem mudou.')
  }
}
