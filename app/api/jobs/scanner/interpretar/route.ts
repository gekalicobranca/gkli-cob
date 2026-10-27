import {randomUUID,timingSafeEqual} from 'node:crypto'
import {NextRequest,NextResponse} from 'next/server'
import {createAdminClient} from '@/utils/supabase/admin'
import {getOpenAIClient} from '@/lib/ai/openai'
import {interpretarEvidencia,promptInterpretacao} from '@/scripts/scanner/interpretacao.mjs'

export const runtime='nodejs'
export const maxDuration=60
function autorizado(request:NextRequest){
 const expected=process.env.SCANNER_INTERPRETACAO_TOKEN,provided=request.headers.get('authorization')?.replace(/^Bearer /,'')??''
 return !!expected&&Buffer.byteLength(provided)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(provided),Buffer.from(expected))
}
export async function GET(request:NextRequest){
 if(!autorizado(request))return NextResponse.json({erro:'Não autorizado'},{status:401})
 return NextResponse.json({ok:!!process.env.OPENAI_API_KEY,ia_configurada:!!process.env.OPENAI_API_KEY,modo:'revisao_sem_baixa',limite_diario:20},{status:process.env.OPENAI_API_KEY?200:503,headers:{'Cache-Control':'no-store'}})
}
export async function POST(request:NextRequest){
 if(!autorizado(request))return NextResponse.json({erro:'Não autorizado'},{status:401})
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({erro:'IA não configurada; fila preservada para retomada'},{status:503})
 if(Number(request.headers.get('content-length')??0)>1024)return NextResponse.json({erro:'Corpo excede o limite'},{status:413})
 let body:{autorizacao?:string}={}
 try{const text=await request.text();if(text.length>1024)throw Error();body=text?JSON.parse(text):{};if(Object.keys(body).some(k=>k!=='autorizacao')||(body.autorizacao&&!/^[0-9a-f-]{36}$/i.test(body.autorizacao)))throw Error()}
 catch{return NextResponse.json({erro:'Requisição inválida'},{status:400})}
 const db=createAdminClient(),token=randomUUID()
 const {data:job,error}=await db.rpc('scanner_analise_reivindicar',{p_token:token,p_autorizacao:body.autorizacao??null})
 if(error)return NextResponse.json({erro:'Fila de interpretação indisponível'},{status:503})
 if(!job)return NextResponse.json({analisadas:0})
 const model=process.env.SCANNER_IA_MODELO?.trim()||process.env.KEILA_OPENAI_MODEL?.trim()||'gpt-6.1-sol'
 const gerar=process.env.OPENAI_API_KEY?async(entrada:unknown,schema:object)=>{
  const response=await getOpenAIClient().responses.create({model,store:false,max_output_tokens:2500,reasoning:{effort:'low'},
   input:[{role:'system',content:promptInterpretacao},{role:'user',content:JSON.stringify(entrada)}],
   text:{format:{type:'json_schema',name:'scanner_revisao',strict:true,schema:{...schema}}},
  },{timeout:20000,maxRetries:0})
  if(response.status!=='completed'||!response.output_text)throw Error('Resposta incompleta')
  return {resultado:JSON.parse(response.output_text),modelo:response.model,uso:{entrada:response.usage?.input_tokens,saida:response.usage?.output_tokens}}
 }:null
 const resultado=await interpretarEvidencia(job.entrada,gerar)
 const {data:estado,error:saveError}=await db.rpc('scanner_analise_concluir',{p_token:token,p_resultado:resultado,p_modelo:resultado.modelo??'regras'})
 if(saveError)return NextResponse.json({erro:'Análise não persistida; fila preservada para retomada'},{status:503})
 return NextResponse.json({analisadas:1,id:job.id,estado,ia_status:resultado.ia_status,sugestoes:resultado.sugestoes.length,baixas:0})
}
