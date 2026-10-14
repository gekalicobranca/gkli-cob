import {createClient} from '@supabase/supabase-js'
import {z} from 'zod'
import {prepararWhatsAppRetornoEmail} from '../features/keila/retorno-email-whatsapp-service'
async function main(){
 const [id,carteira]=z.array(z.uuid()).length(2).parse(process.argv.slice(2))
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 console.log(JSON.stringify(await prepararWhatsAppRetornoEmail(db,id,[carteira],null)))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
