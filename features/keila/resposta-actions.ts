'use server'

import { AGENTES_VIRTUAIS, type AgenteVirtualId } from '../agentes-virtuais/perfis'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { createAdminClient } from '@/utils/supabase/admin'
import { carregarCaso, salvarCaso, casoId } from './casos-service'
import { getEmailRemetenteKey, getSmtpConfigStatus } from '../mensageria/email-provider'
import { validarConferenciaAtual } from './conferencia-proposta-service'
import { hashConferencia } from './conferencia-proposta'
import { anexosKeilaSchema, baixarAnexosKeila } from './anexos'
import {destinoRespostaKeila} from './destino-resposta'

export async function aprovarEnviarRespostaKeila(form: FormData) { return aprovarEnviarResposta('keila', form) }
export async function aprovarEnviarRespostaLidia(form: FormData) { return aprovarEnviarResposta('lidia', form) }

async function aprovarEnviarResposta(agenteId: AgenteVirtualId, form: FormData) {
  const agente = AGENTES_VIRTUAIS[agenteId]
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const id = String(form.get('id') ?? '')
  let erro = ''
  try {
    if (form.get('confirmar') !== 'sim') throw new Error('Confirme o destinatário, assunto e texto antes de enviar.')
    const db = createAdminClient()
    let caso = await carregarCaso(db, id, scope.carteiraIds, agenteId)
    if (['atendimento_humano', 'concluido'].includes(caso.payload.estado)) throw new Error(`Este atendimento não permite envio pela ${agente.nome}.`)
    const email = destinoRespostaKeila(caso.payload)
    const texto = caso.payload.resposta_simulada?.trim()
    if (!email || !texto || texto.length > 10000) throw new Error('Salve a resposta antes de aprovar.')
    if (caso.payload.resposta_email_chave && caso.payload.resposta_email_chave !== email.chave) throw new Error('O rascunho pertence a uma mensagem anterior. Revise e salve a resposta ao novo retorno.')
    if (String(form.get('updated_at')) !== caso.updated_at) throw new Error('O atendimento mudou. Recarregue e revise novamente.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.remetente) || /[\r\n]/.test(email.assunto)) throw new Error('Destinatário ou assunto inválido.')
    const { data: carteira, error: carteiraError } = await db.from('carteiras').select('email_transporte').eq('id', caso.carteira_id).single()
    if (carteiraError) throw new Error('Não foi possível consultar o transporte.')
    if (carteira.email_transporte === 'thunderbird') {
      const { data: dispositivos, error } = await db.from('thunderbird_dispositivos').select('email').eq('carteira_id', caso.carteira_id).eq('ativo', true).eq('automatico', true).not('testado_em', 'is', null)
      if (error || dispositivos?.length !== 1 || dispositivos[0].email.toLowerCase() !== agente.email) throw new Error(`Configure e teste o Thunderbird da ${agente.nome} nesta carteira antes de enviar.`)
    } else {
      const smtp = await getSmtpConfigStatus(caso.carteira_id)
      if (!smtp.active || !smtp.configured || smtp.from?.toLowerCase() !== agente.email) throw new Error(`Configure o remetente ${agente.email} nesta carteira antes de enviar.`)
    }
    const versaoHash = hashConferencia({texto, email_chave:email.chave, destinatario:email.remetente, assunto:email.assunto, anexos:caso.payload.resposta_anexos??[], conferencia:caso.payload.conferencia_proposta?.hash??null})
    if(caso.payload.resposta_aprovada) {
      const a=caso.payload.resposta_aprovada
      if(a.texto!==texto || a.destinatario!==email.remetente || (a.email_chave && a.email_chave!==email.chave) || (a.versao_hash && a.versao_hash!==versaoHash)) throw new Error('A versão mudou após a aprovação. Preserve o envio anterior e revise uma nova versão.')
      if(a.versao_hash && caso.payload.conferencia_proposta) await validarConferenciaAtual(db,caso)
    } else if(caso.payload.intencao==='parcelamento' || caso.payload.conferencia_proposta) await validarConferenciaAtual(db,caso)
    const remetente = await getEmailRemetenteKey(caso.carteira_id)
    if (!caso.payload.resposta_aprovada) {
      const anexos = anexosKeilaSchema.parse(caso.payload.resposta_anexos ?? [])
      await baixarAnexosKeila(db, id, anexos)
      const em = new Date().toISOString()
      const aprovada = { versao_hash:versaoHash, mensagem_id: casoId(caso.condominio_id, caso.payload.unidade_ids, `${id}:resposta:${caso.updated_at}`, agenteId), em, usuario_id: scope.userId, destinatario: email.remetente, assunto: email.proativo || /^re:/i.test(email.assunto) ? email.assunto : `Re: ${email.assunto}`, texto, email_chave: email.chave }
      await salvarCaso(db, caso, { ...caso.payload, resposta_aprovada: { ...aprovada, anexos },
        atividades: [...caso.payload.atividades, { em, usuario_id: scope.userId, descricao: `Resposta aprovada para ${aprovada.destinatario}. Registro ${aprovada.mensagem_id}.` }] }, scope.userId)
      caso = await carregarCaso(db, id, scope.carteiraIds, agenteId)
    }
    const aprovada = caso.payload.resposta_aprovada!
    const { data: existente, error: loadError } = await db.from('mensagens').select('id,status').eq('id', aprovada.mensagem_id).eq('carteira_id', caso.carteira_id).maybeSingle()
    if (loadError) throw new Error(loadError.message)
    if (existente && existente.status !== 'pendente_aprovacao') throw new Error('Resposta já encaminhada. Confira o status abaixo; nenhum novo envio foi criado.')
    if (!existente) {
      const { error } = await db.from('mensagens').insert({ id: aprovada.mensagem_id, carteira_id: caso.carteira_id,
        contexto: 'mensageria', canal: 'email', status: 'pendente_aprovacao', status_operacional: 'pendente_aprovacao', destinatario: aprovada.destinatario,
        email_assunto: aprovada.assunto, conteudo: aprovada.texto, conteudo_renderizado: aprovada.texto,
        aprovado_por: aprovada.usuario_id, aprovado_em: aprovada.em, payload: { keila_caso_id: id, agente_virtual: agenteId, resposta_supervisionada: true, keila_anexos: aprovada.anexos ?? [], ...(caso.payload.conferencia_proposta?.validade_regra ? {proposta_validade: {regra: caso.payload.conferencia_proposta.validade_regra, primeiro_vencimento: caso.payload.conferencia_proposta.vencimento, email_chave: aprovada.email_chave, hash: caso.payload.conferencia_proposta.hash}} : {}) } })
      if (error) throw new Error(error.message)
    }
    const { error } = await db.rpc('email_reservar_horario', { p_mensagem: aprovada.mensagem_id, p_remetente: remetente })
    if (error) throw new Error(error.message)
    await salvarCaso(db, caso, { ...caso.payload, estado: 'aguardando_retorno', proxima_acao: 'Acompanhar o envio aprovado e, após a entrega, aguardar a resposta do contato.',
      atividades: [...caso.payload.atividades, { em: new Date().toISOString(), usuario_id: scope.userId, descricao: `Resposta ${aprovada.mensagem_id} encaminhada à fila de e-mail. O status do transporte confirma o envio.` }] }, scope.userId)
  } catch (error) { erro = error instanceof Error ? error.message : 'Não foi possível encaminhar a resposta.' }
  revalidatePath(agente.caminho)
  redirect(`${agente.caminho}?${new URLSearchParams({ caso: id, ...(erro ? { erro } : { resultado: 'Resposta aprovada e encaminhada à fila de envio.' }) })}`)
}
