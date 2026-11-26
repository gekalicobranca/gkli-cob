export function activePairingRequest(control, now = Date.now()) {
  const age = now - Date.parse(control?.atualizado_em ?? '')
  return control?.vinculacao_pedido && control.vinculacao_pedido === control.reiniciar_id && age >= -30000 && age < 240000 ? control.vinculacao_pedido : null
}

export function pairingPublisher(db, session, requestId) {
  let pending = Promise.resolve()
  // Serialize events so a late QR upload cannot overwrite the clear on ready.
  return (payload = null, expiresAt = null) => {
    if (!requestId) return Promise.resolve()
    pending = pending.catch(() => {}).then(async () => {
      const { error } = await db.from('whatsapp_worker_controles').update({ vinculacao_payload: payload, vinculacao_expira_em: expiresAt })
        .eq('sessao', session).eq('reiniciar_id', requestId).eq('vinculacao_pedido', requestId)
      if (error) throw new Error('Não foi possível atualizar a vinculação no app.')
    })
    return pending
  }
}
