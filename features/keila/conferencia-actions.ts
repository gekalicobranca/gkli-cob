'use server'
import {revalidatePath} from 'next/cache'
import {redirect} from 'next/navigation'
import {requireRole} from '@/utils/auth/require-role'
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras'
import {createAdminClient} from '@/utils/supabase/admin'
import {carregarCaso} from './casos-service'
import {prepararPropostaConferida} from './conferencia-proposta-service'
export async function conferirRascunhoKeila(form: FormData) {
 await requireRole(['admin','gestor','operador'])
 const scope=await getPermittedCarteiras(),db=createAdminClient(),id=String(form.get('id')??'')
 let erro=''
 try {
  const caso=await carregarCaso(db,id,scope.carteiraIds)
  if(caso.updated_at!==String(form.get('updated_at')))throw new Error('Caso atualizado. Recarregue antes de conferir.')
  if(caso.payload.resposta_aprovada || ['atendimento_humano','concluido'].includes(caso.payload.estado))throw new Error('Preserve a versão aprovada ou o atendimento humano. Conciliação necessária antes de substituir.')
  const {data: arquivos,error}=await db.from('agente_arquivos').select('id,nome_arquivo').eq('execucao_id',caso.payload.execucao_id)
  const candidatos=arquivos?.filter(a=>/\.xlsx?$/i.test(a.nome_arquivo))??[]
  if(error || candidatos.length!==1)throw new Error('Selecione uma coleta com um único relatório Lello conferível.')
  await prepararPropostaConferida(db,caso,{arquivo_id:candidatos[0].id,quantidade:Number(form.get('quantidade')),vencimento:String(form.get('vencimento'))},scope.userId)
 }catch(e){erro=e instanceof Error?e.message:'Conferência indisponível.'}
 revalidatePath('/app/gestao/keila')
 redirect(`/app/gestao/keila?${new URLSearchParams({caso:id,...(erro?{erro}:{resultado:'Rascunho conferido; revise antes de aprovar.'})})}`)
}
