import {createClient} from '@supabase/supabase-js'
import {carregarCaso} from '../features/keila/casos-service'
import {prepararPropostaConferida} from '../features/keila/conferencia-proposta-service'
import {z} from 'zod'
async function main(){const [casoId,carteiraId,arquivoId,quantidade,vencimento]=process.argv.slice(2);z.uuid().parse(casoId);z.uuid().parse(carteiraId);z.uuid().parse(arquivoId);const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});const caso=await carregarCaso(db,casoId,[carteiraId]);const c=await prepararPropostaConferida(db,caso,{arquivo_id:arquivoId,quantidade:Number(quantidade),vencimento},null);console.log(JSON.stringify({caso_id:caso.id,versao:c.hash,incluidas:c.plano.incluidas,excluidas:c.plano.excluidas,total_avista:c.plano.avista.total,total_parcelado:c.plano.parcelado.total,envio_realizado:false}));}
main().catch(e=>{console.error(e.message);process.exitCode=1})
