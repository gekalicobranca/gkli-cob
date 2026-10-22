import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { conversaoPdfDeCobrancas, removerAusentesDaConversaoPdf } from '../features/importacoes/ausentes-conversao'

const source=readFileSync('app/api/conversao-relatorio/confirmar/route.ts','utf8')
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true)
const names=['POST','brDateToIso','buscarUnidadeLiteral','isCarteiraPermitida']
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')).map(n=>n.getText(ast)).join('\n')
const js=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
async function scenario(failure=false,allowCleanup=true) {
  const events:string[]=[]
  const preview={tipoConversao:'cobrancas',arquivo:'captacao.pdf',cobrancas:[{unidade:'101',vencimento:'10/09/2026',valorPrincipal:100,valorTotal:100,recibo:'123'}]}
  const supabase={from(table:string) {
    let inserted=false
    const result=()=>({data:null,error:null})
    const q={
      select(){return q},eq(){return q},or(){return q},
      insert(){inserted=true;events.push(`insert:${table}`);return q},
      update(){events.push(`update:${table}`);return q},
      then(resolve:(r:any)=>void){resolve(result())},
      async single(){
        if(table==='conversoes_relatorio')return {data:{id:'conv',status:'preview',carteira_id:'carteira',condominio_id:'condominio',preview_json:preview},error:null}
        assert.equal(table,'cobrancas');assert(inserted)
        return failure?{data:null,error:{message:'falha simulada'}}:{data:{id:'nova'},error:null}
      },
      async maybeSingle(){
        if(table==='profiles')return {data:{role:'admin'},error:null}
        if(table==='condominios')return {data:{carteira_id:'carteira'},error:null}
        if(table==='unidades')return {data:{id:'unidade',identificacao:'101',responsavel_nome:'Responsável',email:'teste@example.com',telefone:'11999999999'},error:null}
        throw Error(table)
      },
    };return q
  },async rpc(name:string){events.push(`rpc:${name}`);return {data:{removidas:2},error:null}}}
  const context=vm.createContext({
    exports:{},console,NextResponse:{json:(body:any,options?:any)=>({status:options?.status??200,json:async()=>body})},
    isCronSecretAuthorized:()=>false,requireAuthenticatedApiUser:async()=>({user:{id:'operador'}}),createAdminClient:()=>supabase,
    conversaoPdfDeCobrancas,removerAusentesDaConversaoPdf,
    anoCorrenteImportacao:()=>2026,formatOrigemImportacao:()=> 'conversao_relatorio',
    criarContextoClassificacaoJudicial:()=>({unidadesJudiciais:new Map()}),
    buscarPossivelUnidadePorNormalizacao:async()=>null,avaliarBloqueioGarantidora:()=>({bloqueada:false}),
    observacaoComBloqueioGarantidora:(s:string)=>s,observacoesComComposicao:(s:string)=>s,
    statusOperacionalParaCobrancaImportada:async()=> 'em_cobranca_ativa',statusComBloqueioGarantidora:(s:string)=>s,
    conciliarCobrancaImportada:async()=>({status:'novo'}),avaliarReguaImportacao:()=>({foraRegua:false}),
    isImportacaoAcordoHflex:()=>false,registrarSaneamentoConversao:async()=>{},
    limparCobrancasDaNovaImportacao:async()=>{throw Error('PDF não deve excluir antes da importação')},
    encontrarCobrancasAbertasAusentes:async()=>({total:0,mensagens:[],ausentes:[]}),registrarPendenciasCobrancasAusentes:async()=>({criadas:0}),
    buildRankingMensalFromCobrancas:()=>null,classificarRankingMensalComApp:async()=>null,
    persistirCaptacaoHistoricaSindico:async()=>({inseridas:0,retidas:0}),revalidatePath:()=>{},
  })
  vm.runInContext(js,context)
  const response=await context.exports.POST({json:async()=>({conversaoId:'conv',condominioId:'condominio',carteiraId:'carteira',limparCobrancasAnteriores:allowCleanup})})
  assert.equal(response.status,200)
  const data=await response.json()
  assert.equal(data.resumo.cobrancasAnterioresRemovidas,failure||!allowCleanup?0:2)
  const rpc=events.indexOf('rpc:conversao_remover_cobrancas_ausentes')
  if(failure||!allowCleanup)assert.equal(rpc,-1)
  else assert(rpc>events.indexOf('insert:cobrancas'),'Limpeza precisa ocorrer após importar as linhas')
}
async function main(){await scenario();await scenario(true);await scenario(false,false);console.log('OK: POST real confirma PDF antes da limpeza; falhas e opção de preservar impedem exclusão; nenhuma rotina de envio é chamada.')}
main().catch(error=>{console.error(error);process.exitCode=1})
