/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

function harness() {
  const cobranca = { id: 'receipt', carteira_id: 'wallet', condominio_id: 'condo', unidade_id: 'unit', status: 'novo', status_operacional: 'novo',
    valor_original: 100, valor_atualizado: 100, vencimento: '2025-12-01', competencia: '12/2025',
    condominios: { id: 'condo', nome: 'Condomínio sintético', parcelas_acordo_sem_aprovacao_sindico: 3 },
    unidades: { id: 'unit', identificacao: '1', responsavel_nome: 'Responsável sintético', email: 'test@example.invalid', telefone: '11999999999', credito_administradora: 0 } }
  const state = { cobranca, memos: [], writes: [], financial: null, pending: true }
  const client = { from(table) {
    let kind='read', payload
    const result = single => {
      if(kind !== 'read') return { data: { id:'created',token:'synthetic-token' },error:null }
      if(table==='cobrancas') return { data:[cobranca],error:null }
      if(table==='acordos') return { data:{ id:'agreement',exige_aprovacao_sindico:state.pending,fluxo_status:state.pending?'aguardando_aprovacao_sindico':'rascunho' },error:null }
      return { data:single?null:[],error:null }
    }
    const q={}
    for(const method of ['select','eq','neq','in','is','order','limit','or','not']) q[method]=()=>q
    for(const method of ['insert','update','delete']) q[method]=value=>{ kind=method;payload=value;state.writes.push({table,kind,payload});return q }
    q.single=async()=>result(true);q.maybeSingle=async()=>result(true)
    q.then=(ok,bad)=>Promise.resolve(result(false)).then(ok,bad)
    return q
  }, async rpc(name,params) { if(name!=='criar_acordo_com_contato') throw Error('Unexpected RPC '+name);state.financial=params.p_financeiro;return {data:'agreement',error:null} } }
  const cache={}
  function load(file) {
    let absolute=path.resolve(root,file)
    if(fs.existsSync(absolute)&&fs.statSync(absolute).isDirectory()) absolute=fs.existsSync(absolute+'.ts')?absolute+'.ts':path.join(absolute,'index.ts')
    if(!fs.existsSync(absolute)) absolute+=fs.existsSync(absolute+'.ts')?'.ts':'.tsx'
    if(cache[absolute]) return cache[absolute].exports
    const mod={exports:{}};cache[absolute]=mod
    const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
    const mockedRequire=name=>{
      if(name==='react') return {useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useMemo:fn=>{const result=fn();state.memos.push(result);return result},useActionState:()=>[{error:null},()=>{},false]}
      if(name==='react/jsx-runtime') return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}
      if(name==='next/navigation') return {redirect:url=>{throw Error('REDIRECT '+url)}}
      if(name==='next/cache') return {revalidatePath:()=>{}}
      if(name==='@/utils/supabase/server') return {createClient:async()=>client}
      if(name==='@/utils/supabase/admin') return {createAdminClient:()=>{throw Error('Unexpected privileged client')}}
      if(name.includes('/utils/auth/')) return {requireRole:async()=>({id:'operator'}),requireUser:async()=>({id:'operator'}),getPermittedCarteiras:async()=>({carteiraIds:['wallet']})}
      if(name==='@/features/operacional/service') return {registrarEventoOperacional:async()=>{}}
      if(name==='@/features/acordos/status-service'||name==='@/features/acordos/pre-juridico-lote') return {}
      if(name==='lucide-react'||name.startsWith('@/components/')) return {}
      if(name==='@/features/acordos/actions'&&absolute.endsWith('.tsx')) return {}
      if(name.startsWith('@/')) return load(name.slice(2))
      if(name.startsWith('.')) return load(path.relative(root,path.resolve(path.dirname(absolute),name)))
      return require(name)
    }
    new vm.Script(code,{filename:absolute}).runInNewContext({module:mod,exports:mod.exports,require:mockedRequire,URLSearchParams,URL,FormData,Date,Intl,console,process:{env:{}}})
    return mod.exports
  }
  return {state,load}
}
module.exports={harness}
