import {createClient} from '@supabase/supabase-js'
import {z} from 'zod'
import {carregarCaso} from '../features/keila/casos-service'
import {prepararPropostaConferida} from '../features/keila/conferencia-proposta-service'
import {CADIZ_ID,CADIZ_CARTEIRA} from '../features/lidia/conferencia-manager'
async function main(){
 const [casoId,arquivoId,quantidade,vencimento]=process.argv.slice(2)
 z.uuid().parse(casoId);z.uuid().parse(arquivoId)
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const caso=await carregarCaso(db,casoId,[CADIZ_CARTEIRA],'lidia')
 if(caso.condominio_id!==CADIZ_ID)throw new Error('Conferência Manager restrita ao Cádiz.')
 const c=await prepararPropostaConferida(db,caso,{arquivo_id:arquivoId,quantidade:Number(quantidade),vencimento},null)
 console.log(JSON.stringify({caso_id:caso.id,versao:c.hash,fonte:c.fonte_formato,envio_realizado:false,aprovacao_necessaria:true}))
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
