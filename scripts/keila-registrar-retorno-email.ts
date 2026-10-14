import {readFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {z} from 'zod'
import {classificarRetornoEmail} from '../features/mensageria/retorno-email'
import {prepararWhatsAppRetornoEmail} from '../features/keila/retorno-email-whatsapp-service'
const schema=z.object({carteira_id:z.uuid(),unidade_id:z.uuid(),destinatario:z.email(),mensagem_chave:z.string().min(1),recebido_em:z.iso.datetime(),diagnostico:z.string().min(1).max(2000),codigo:z.string().max(100).optional(),outlook_url:z.url().refine(v=>new URL(v).hostname==='outlook.cloud.microsoft')})
async function main(){const r=schema.parse(JSON.parse(await readFile(process.argv[2],'utf8')));const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});const classificacao=classificarRetornoEmail(r.diagnostico);const {diagnostico,...registro}=r;const {data,error}=await db.rpc('email_registrar_retorno',{p_registro:{...registro,destinatario:r.destinatario.toLowerCase(),classificacao,motivo:diagnostico}});if(error)throw error;const whatsapp=await prepararWhatsAppRetornoEmail(db,String(data),[r.carteira_id],null);console.log(JSON.stringify({id:data,classificacao,bloqueado:classificacao==='inexistente',whatsapp}));}
main().catch(e=>{console.error(e.message);process.exitCode=1})
