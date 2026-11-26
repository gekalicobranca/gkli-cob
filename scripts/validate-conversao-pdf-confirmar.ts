import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { resolverRecibosLello } from '../features/importacoes/maestro-recibos-lello'
import { observacoesComMarcador } from '../features/importacoes/composicao-origem'
import { marcarCessaoDeOrigemConhecida } from '../features/importacoes/exclusao-cessao-conhecida'
import { excluirCessaoEspacoDaPrevia } from '../features/importacoes/exclusao-cessao-espaco'
import ts from 'typescript'
import { conversaoPdfDeCobrancas, removerAusentesDaConversaoPdf } from '../features/importacoes/ausentes-conversao'

const source=readFileSync('app/api/conversao-relatorio/confirmar/route.ts','utf8')
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true)
const names=['POST','brDateToIso','buscarUnidadeLiteral','isCarteiraPermitida']
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')).map(n=>n.getText(ast)).join('\n')
const js=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
async function scenario(failure=false,allowCleanup=true,maestro=false,cron=maestro,lello=maestro) {
  const events:string[]=[]
  const preview={tipoConversao:'cobrancas',padraoDetectado:lello?{id:'lello-cotas-atrasadas-xlsx-cobrancas-v1'}:undefined,captacaoAutomatizada:maestro,arquivo:maestro?'captacao.xlsx':'captacao.pdf',cobrancas:[{unidade:'101',vencimento:'10/09/2026',valorPrincipal:100,valorTotal:100,recibo:lello?'LELLO-123-101-20260910':'123'}]}
  const supabase={from(table:string) {
    let inserted=false
    const result=()=>({data:null,error:null})
    const q={
      select(){return q},eq(){return q},or(){return q},
      insert(){inserted=true;events.push(`insert:${table}`);return q},
      update(){events.push(`update:${table}`);return q},
      then(resolve:(r:any)=>void){resolve(result())},
      async single(){
        if(table==='conversoes_relatorio')return {data:{id:'conv',status:'preview',origem:lello?'captacao_automatizada:lello':maestro?'captacao_automatizada:bbz':null,carteira_id:'carteira',condominio_id:'condominio',preview_json:preview},error:null}
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
  },rpc(name:string,args:any){
    events.push(`rpc:${name}`)
    if (name==='captacao_recibos_cessao_espaco') return {range:async()=>({data:[],error:null})}
    if (name==='maestro_iniciar_conciliacao') return {data:{inicio:'2026-11-09'},error:null}
    if (name==='maestro_cobrancas_substituiveis') {
      assert.equal(preview.cobrancas[0].recibo,lello?'12345678':'123')
      return {data:[],error:null}
    }
    if (name==='maestro_substituir_captacao') {
      assert.equal(args.p_inicio,'2026-11-09')
      assert.equal(args.p_valores[0].id,'existente')
      assert.equal(args.p_valores[0].valor_atualizado,100)
      assert.equal(args.p_importadas[0].recibo,lello?'12345678':'123')
      return {data:{atualizadas:1,removidas:2,arquivadas:0,comAcordo:0},error:null}
    }
    return {data:{removidas:2},error:null}
  }}
  const context=vm.createContext({
    exports:{},console,NextResponse:{json:(body:any,options?:any)=>({status:options?.status??200,json:async()=>body})},
    isCronSecretAuthorized:()=>cron,requireAuthenticatedApiUser:async()=>({user:{id:'operador'},profile:{role:'admin'}}),createAdminClient:()=>supabase,
    conversaoPdfDeCobrancas,removerAusentesDaConversaoPdf,observacoesComMarcador,resolverRecibosLello,
    marcarCessaoDeOrigemConhecida,excluirCessaoEspacoDaPrevia,
    carregarCadastroRecibosLello:async()=>[{unidade_id:'unidade',unidades:{identificacao:'101',bloco:''},vencimento:'2026-09-10',valor_original:100,observacoes:'Recibo: 12345678',origem_importacao:'Espelhamento Lello 123 - 10/09/2026'}],
    carregarCobrancasPreservadasMaestro:async()=>new Map(),chaveConciliacaoCobranca:()=> 'chave',
    anoCorrenteImportacao:()=>2026,formatOrigemImportacao:()=> 'conversao_relatorio',
    criarContextoClassificacaoJudicial:()=>({unidadesJudiciais:new Map()}),
    buscarPossivelUnidadePorNormalizacao:async()=>null,avaliarBloqueioGarantidora:()=>({bloqueada:false}),
    observacaoComBloqueioGarantidora:(s:string)=>s,observacoesComComposicao:(s:string)=>s,
    statusOperacionalParaCobrancaImportada:async()=> 'em_cobranca_ativa',statusComBloqueioGarantidora:(s:string)=>s,
    conciliarCobrancaImportada:async(_db:any,_cobranca:any,modoMaestro:boolean)=>{
      assert.equal(modoMaestro,maestro)
      return maestro?{status:'atualizar',cobrancaId:'existente',atualizadoEm:'2026-11-01'}:{status:'novo'}
    },avaliarReguaImportacao:()=>({foraRegua:false}),
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
  if(maestro){
    assert.equal(data.resumo.conciliacaoMaestro.atualizadas,1)
    assert.equal(data.resumo.cobrancasAusentes,0)
    assert.equal(rpc,-1)
    assert(!events.includes('rpc:maestro_substituir_cobrancas_conversao'))
    assert(!events.includes('insert:cobrancas'))
    return
  }
  if(failure||!allowCleanup)assert.equal(rpc,-1)
  else assert(rpc>events.indexOf('insert:cobrancas'),'Limpeza precisa ocorrer após importar as linhas')
}
async function main(){await scenario();await scenario(true);await scenario(false,false);await scenario(false,true,true);await scenario(false,true,true,false);await scenario(false,true,true,true,false);console.log('OK: PDF mantém a ordem da confirmação e Maestro concilia cobranças existentes sem reinserção.')}
main().catch(error=>{console.error(error);process.exitCode=1})
