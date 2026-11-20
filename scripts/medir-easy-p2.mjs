import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const { fixtureOperacional } = require('./easy-p1-operacional-fixture.ts')
const { fixtureId: id } = require('./easy-p0-fixture.ts')
const { lerPlanilhaManualEasy } = require('../features/easy-cob/planilha-manual.ts')
const { validarPreviaCaptacao } = require('../features/easy-cob/captacao-preview.ts')
const { prepararPlanoCaptacao, hashPlanoCaptacao } = require('../features/easy-cob/captacao-plano.ts')
const { gerarAssinaturaCaptacao, verificarAssinaturaCaptacao } = require('../features/easy-cob/captacao-assinatura.ts')
const { dividirCriacaoFlows } = require('../features/flows/cobranca/dividir-criacao.ts')
const { Client } = createRequire(resolve(process.argv[3], 'package.json'))('pg')
const bin = resolve(process.argv[2])
const root = await mkdtemp(join(tmpdir(), 'easy-p2-carga-'))
const data = join(root, 'data')
const password = randomBytes(32).toString('hex')
const port = randomInt(30000, 59000)
const carteira = id(1), operador = id(10), chave = randomBytes(32).toString('hex')
const cnpj = '00000000000000'
const clients = []
let started = false
function pg(cmd, args) {
  execFileSync(join(bin, cmd + (process.platform === 'win32' ? '.exe' : '')), args, { windowsHide: true, stdio: 'ignore' })
}
async function connect() {
  const db = new Client({ host: '127.0.0.1', port, database: 'postgres', user: 'lab', password, ssl: false })
  await db.connect()
  clients.push(db)
  return db
}
function stats(values) {
  const sorted = values.toSorted((a,b) => a-b)
  const quantile = p => +sorted[Math.ceil(p*sorted.length)-1].toFixed(2)
  return { n: sorted.length, p50: quantile(.5), p95: quantile(.95), max: quantile(1) }
}
function workbook(size, year) {
  const rows = [['Easy Flow - importação manual v1'],[],['',cnpj],[],[],[],[],
    ['Bloco','Unidade *','Vencimento *','Valor original *','Multa','Juros','Correção','Valor atualizado','Responsável *','E-mail','Telefone','Recibo']]
  for (let i=0; i<size; i++) {
    const unit = String(1000+Math.floor(i/3))
    rows.push(['A',unit,'01/01/'+year,100,0,0,0,100,'Pessoa '+unit,'p'+unit+'@example.invalid','',String(100000+i)])
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Cobranças')
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true})
}
async function previa(db, condo, bytes) {
  const inicio = performance.now()
  const source = lerPlanilhaManualEasy(bytes,'sintetico.xlsx',{cnpj,nome:'Sintético'})
  const resumo = validarPreviaCaptacao(source)
  delete source.csv
  delete source.xlsxBase64
  const plano = prepararPlanoCaptacao(source)
  const {rows:[{snapshot}]} = await db.query('select easy_captacao_snapshot($1,$2) snapshot',[condo,carteira])
  const key = randomUUID()
  const marker = {operadorId:operador,arquivoSha256:createHash('sha256').update(bytes).digest('hex'),substituicao:snapshot,plano,planoHash:hashPlanoCaptacao(plano),assinatura:''}
  const preview = {...source,easyCaptacao:marker}
  marker.assinatura = gerarAssinaturaCaptacao(chave,key,condo,carteira,preview)
  await db.query("insert into conversoes_relatorio(id,condominio_id,carteira_id,origem,status,nome_arquivo,total_cobrancas,valor_total,preview_json,inconsistencias_json) values($1,$2,$3,'easy_captacao','preview','sintetico.xlsx',$4,$5,$6,'[]')",[key,condo,carteira,resumo.cobrancas,resumo.valor,preview])
  return {key,condo,ms:performance.now()-inicio}
}
async function confirmar(db, job) {
  const {rows:[{preview_json:p}]} = await db.query('select preview_json from conversoes_relatorio where id=$1 and carteira_id=$2',[job.key,carteira])
  verificarAssinaturaCaptacao(chave,job.key,job.condo,carteira,p,operador)
  const m = p.easyCaptacao
  assert.equal(hashPlanoCaptacao(m.plano),m.planoHash)
  assert.equal(hashPlanoCaptacao(prepararPlanoCaptacao(p)),m.planoHash)
  const {rows:[{r}]} = await db.query('select easy_captacao_confirmar($1,$2,$3,$4) r',[job.key,operador,m.assinatura,m.planoHash])
  return r
}
async function medirCap(db, lanes, year) {
  const condos = lanes.map(()=>randomUUID())
  for(const c of condos) await db.query("insert into condominios(id,carteira_id,cnpj,status) values($1,$2,$3,'ativo')",[c,carteira,cnpj])
  for(const size of [10,100,500]) {
    const bytes = workbook(size,year)
    const previews=[], commits=[], recuperacoes=[]
    let tentativas=0
    for(let r=0;r<5;r++) {
      const jobs = await Promise.all(lanes.map((c,i)=>previa(c,condos[i],bytes)))
      previews.push(...jobs.map(j=>j.ms))
      await Promise.all(lanes.map(async(c,i)=>{
        const start=performance.now()
        const result=await confirmar(c,jobs[i])
        commits.push(performance.now()-start)
        assert.equal(result.ok,true)
        assert.equal(result.resumo.cobrancasCriadas+result.resumo.cobrancasAtualizadas,size)
      }))
      // Simula clientes que perderam a resposta depois do commit: nenhuma saída do primeiro POST é usada.
      await Promise.all(lanes.map(async(c,i)=>{
        tentativas++
        const start=performance.now()
        const job=jobs[i]
        const {rows} = await c.query('select resultado from easy_captacao_resultados where conversao_id=$1 and carteira_id=$2 and operador_id=$3',[job.key,carteira,operador])
        assert.equal(rows.length,1)
        const replay=await confirmar(c,job)
        assert.equal(replay.jaConfirmada,true)
        assert.equal(replay.conversaoId,job.key)
        assert.deepEqual(replay.resumo,rows[0].resultado.resumo)
        recuperacoes.push(performance.now()-start)
      }))
    }
    console.log(JSON.stringify({cap:size,bytes:bytes.length,previa_ms:stats(previews),commit_ms:stats(commits),perdas:tentativas,recuperadas:recuperacoes.length,recuperacao_ms:stats(recuperacoes)}))
  }
  return condos
}
function medirPartes() {
  for(const size of [10,100,500,5000]) {
    const rows=[]
    const groups=[1,3,7,12,21,40]
    for(let unit=0;rows.length<size;unit++) {
      const n=Math.min(groups[unit%groups.length],size-rows.length)
      for(let i=0;i<n;i++) rows.push({id:randomUUID(),unidade_id:String(unit)})
    }
    const parts=dividirCriacaoFlows(rows)
    assert.deepEqual(parts.flat().map(r=>r.id),rows.map(r=>r.id))
    const unidades=parts.flatMap(part=>[...new Set(part.map(r=>r.unidade_id))])
    assert.equal(unidades.length,new Set(unidades).size)
    console.log(JSON.stringify({flow:size,partes:parts.length,cobrancas_por_parte:stats(parts.map(p=>p.length)),bytes_ids:stats(parts.map(p=>Buffer.byteLength(JSON.stringify(p.map(r=>r.id)))))}))
  }
}
async function recuperarFlows(lanes, condos) {
  const tempos=[], bytes=[]
  let perdas=0
  await Promise.all(lanes.map(async (db,i)=>{
    const condo=condos[i]
    const {rows}=await db.query('select id,unidade_id from cobrancas where condominio_id=$1 order by unidade_id,id limit 60',[condo])
    assert.equal(rows.length,60)
    const partes=dividirCriacaoFlows(rows)
    const {rows:[{snapshot}]}=await db.query('select easy_flow_snapshot($1,$2) snapshot',[condo,id(4)])
    const {rows:[{run}]}=await db.query("select to_jsonb(easy_flow_iniciar($1,$2,$3,$4,$5,'{}','config',$6,$7)) run",
      [operador,condo,id(4),id(6),JSON.stringify(partes.map(p=>p.map(r=>r.id))),{canais:['email']},snapshot])
    let totalMensagens=0
    for (const [indice,parte] of partes.entries()) {
      const grupos=Map.groupBy(parte,r=>r.unidade_id)
      const mensagens=Array.from(grupos.values(),grupo=>({cobranca_ids:grupo.map(r=>r.id),etapa_id:id(5),canal:'email',
        destinatario:'sintetico@example.invalid',conteudo:'Comunicado de teste',template_id:null,payload:{}}))
      totalMensagens+=mensagens.length
      const manifesto={mensagens}
      bytes.push(Buffer.byteLength(JSON.stringify(manifesto)))
      await db.query('select easy_flow_montar($1,$2,$3,$4)',[run.id,indice,operador,manifesto])
      perdas++
      const start=performance.now()
      const {rows:[{replay}]}=await db.query('select to_jsonb(easy_flow_montar($1,$2,$3,$4)) replay',[run.id,indice,operador,{mensagens:[]}])
      assert.equal(replay.parte,indice+1)
      assert.equal(replay.mensagens,totalMensagens)
      tempos.push(performance.now()-start)
    }
    for(const [indice,parte] of partes.entries()) {
      const params=[run.id,indice,operador,'sintetico']
      await db.query('select easy_flow_liberar($1,$2,$3,$4)',params)
      perdas++
      const start=performance.now()
      const {rows:[{n}]}=await db.query('select easy_flow_liberar($1,$2,$3,$4) n',params)
      assert.equal(n,new Set(parte.map(r=>r.unidade_id)).size)
      tempos.push(performance.now()-start)
    }
    const {rows:[{r}]}=await db.query('select to_jsonb(easy_flow_reconciliar($1,$2)) r',[run.id,operador])
    assert.equal(r.status,'concluido')
    const {rows:[contagem]}=await db.query("select count(*)::int agendas,count(distinct m.id)::int mensagens from mensagens m join email_agenda a on a.mensagem_id=m.id where m.payload->>'easy_execucao_id'=$1",[run.id])
    assert.equal(contagem.agendas,totalMensagens)
    assert.equal(contagem.mensagens,totalMensagens)
  }))
  console.log(JSON.stringify({flow_perdas:perdas,recuperadas:tempos.length,recuperacao_ms:stats(tempos),manifesto_bytes:stats(bytes)}))
}
async function medirFila(db, lanes) {
  const ids=(await db.query("insert into condominios(id,carteira_id,status,administradora) select gen_random_uuid(),$1,'ativo','sintetica' from generate_series(1,500) returning id",[carteira])).rows.map(r=>r.id)
  await db.query("insert into agente_receitas select gen_random_uuid(),$1,true,'lab',jsonb_build_object('condominio_id',x::text) from unnest($2::uuid[]) x",[id(9),ids])
  await db.query('analyze')
  for(const size of [10,100,500]) {
    const selected=ids.slice(0,size), waits=[]
    for(let round=0;round<3;round++) {
      const lote=randomUUID()
      const {rows:[{e}]}=await db.query('select easy_maestro_efeitos($1,$2,$3,true) e',[operador,'sintetica',selected])
      const {rows:[{n}]}=await db.query("select easy_maestro_captar_confirmado($1,'sintetica',$2,true,$3,$4,$5) n",[operador,lote,selected,e.versao,e.ativacaoAutomatica])
      assert.equal(n,size)
      const fila=await db.query('select id,pg_xact_commit_timestamp(xmin)::text entrada from agente_execucoes where easy_maestro_lote_id=$1 order by id',[lote])
      // Distribuição determinística FIFO de uma rajada já confirmada; capacidade de serviço controlada.
      let proximo=0
      await Promise.all(lanes.map(async c=>{
        while(proximo<fila.rowCount) {
          const job=fila.rows[proximo++]
          const claim=await c.query("update agente_execucoes set status='em_execucao' where id=$1 and status='pendente' returning xmin::text xid",[job.id])
          assert.equal(claim.rowCount,1)
          const {rows:[{ms}]}=await c.query('select extract(epoch from(pg_xact_commit_timestamp($1::xid)-$2::timestamptz))*1000 ms',[claim.rows[0].xid,job.entrada])
          assert.ok(ms!==null && Number(ms)>=0)
          waits.push(Number(ms))
          await delay(20)
        }
      }))
    }
    assert.equal(waits.length,size*3)
    console.log(JSON.stringify({fila:size,espera_ms:stats(waits)}))
  }
}
try {
  await writeFile(join(root,'pw'),password)
  pg('initdb',['-D',data,'-U','lab','--encoding=UTF8','--locale=C','--no-sync','--auth=scram-sha-256','--pwfile='+join(root,'pw')])
  pg('pg_ctl',['start','-D',data,'-l',join(root,'servidor.log'),'-o','-h 127.0.0.1 -p '+port+' -c track_commit_timestamp=on','-w'])
  started=true
  const db=await connect()
  console.log((await db.query('show server_version')).rows[0])
  await fixtureOperacional({query:db.query.bind(db),exec:db.query.bind(db)})
  await db.query(await readFile('supabase/migrations/20261120000100_easy_retencao_previas.sql','utf8'))
  const lanes=await Promise.all(Array.from({length:4},connect))
  medirPartes()
  const {rows:[{ano:year}]}=await db.query("select extract(year from now() at time zone 'America/Sao_Paulo')::int as ano")
  const condos = await medirCap(db,lanes,year)
  await recuperarFlows(lanes,condos)
  await medirFila(db,lanes)
} finally {
  await Promise.all(clients.map(c=>c.end()))
  if(started) pg('pg_ctl',['stop','-D',data,'-m','fast','-w'])
  assert.equal(dirname(resolve(root)),resolve(tmpdir()))
  assert.ok(basename(root).startsWith('easy-p2-carga-'))
  await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})
}
