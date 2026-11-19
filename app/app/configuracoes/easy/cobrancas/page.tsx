import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { EasyHeader, EasyEmpty, EasySteps } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { EasyFilters } from '../acordos/filters'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { createClient } from '@/utils/supabase/server'
import { formatCurrency } from '@/utils/formatters/currency'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import { nomeCondominioEasy } from '@/features/easy-cob/nome-condominio'
import { excluirCobranca } from './actions'

const path = '/app/configuracoes/easy/cobrancas'
const operations = [
  { key:'consultar', title:'Consultar', description:'Localize a cobrança e consulte o histórico.', icon:Search, tone:styles.blue },
  { key:'criar', title:'Criar', description:'Cadastre uma cobrança para a unidade.', icon:Plus, tone:styles.green },
  { key:'editar', title:'Editar', description:'Revise os valores e encargos da cobrança.', icon:Pencil, tone:styles.violet },
  { key:'excluir', title:'Excluir', description:'Retire uma cobrança da operação e preserve o histórico.', icon:Trash2, tone:styles.rose },
]

type Row = {id:string; nome?:string; nome_operacional?:string; identificacao?:string; bloco?:string; vencimento?:string; valor_original?:number; valor_atualizado?:number; status_operacional?:string; status_financeiro?:string;data_pagamento?:string;valor_pago?:number}
async function pages(request: {range:(a:number,b:number)=>PromiseLike<{data:Row[]|null;error:unknown}>}) {
  const rows: Row[] = []
  for(let offset=0;;offset+=500) {
    const {data,error} = await request.range(offset, offset+499)
    if(error || !data) throw new Error('Não foi possível carregar a seleção.')
    rows.push(...data)
    if(data.length<500) return rows
  }
}

export default async function EasyCobrancas({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const q = await searchParams
  const scope = await getPermittedCarteiras()
  const write = ['admin','gestor','operador'].includes(scope.perfil)
  const remove = ['admin','gestor'].includes(scope.perfil)
  const available = operations.filter(op => op.key==='consultar' || (op.key==='excluir' ? remove : write))
  if(!q.operacao) return <main className={styles.container}>
    <EasyHeader title="Cobranças" description="Escolha uma operação." />
    {q.resultado==='excluida' && <p role="status">Cobrança excluída da operação.</p>}
    <div className={styles.grid}>{available.map(op=><Link key={op.key} className={styles.card+' '+op.tone}
      href={op.key==='criar'?'/app/cobrancas/nova':path+'?operacao='+op.key}>
      <span className={styles.icon}><op.icon aria-hidden="true"/></span><h2>{op.title}</h2><p>{op.description}</p>
      <span className={styles.cardFooter}>Continuar <ArrowRight size={16}/></span>
    </Link>)}</div>
  </main>
  const op = available.find(item=>item.key===q.operacao)
  if(!op || op.key==='criar') notFound()
  const db = await createClient()
  const scoped = (table:string,fields:string) => applyCarteiraScope(db.from(table).select(fields),scope.carteiraIds)
  const condos = await pages(scoped('condominios','id,nome,nome_operacional').order('nome').order('id'))
  const condo = condos.find(item=>item.id===q.condominio)
  if(q.condominio && !condo) notFound()
  const units = condo ? await pages(scoped('unidades','id,identificacao,bloco').eq('condominio_id',condo.id).order('identificacao').order('id')) : []
  const unit = units.find(item=>item.id===q.unidade)
  if(q.unidade && !unit) notFound()
  const charges = condo && unit ? await pages(somenteCobrancasCanonicas(scoped('cobrancas','id,vencimento,valor_original,valor_atualizado,status_operacional,status_financeiro,data_pagamento,valor_pago')
    .eq('condominio_id',condo.id).eq('unidade_id',unit.id)).order('vencimento').order('id')) : []
  return <main className={styles.container+' '+op.tone+' space-y-5'}>
    <EasyHeader title={op.title+' cobrança'} description={op.description} backHref={path} backLabel="Voltar às cobranças"/>
    <EasySteps labels={['Localizar unidade','Escolher cobrança']} current={unit?1:0}/>
    <EasyFilters operation={op.key} basePath={path} condominium={condo?.id??''} unit={unit?.id??''}
      condominiums={condos.map(c=>({id:c.id,label:nomeCondominioEasy(c.nome??'',c.nome_operacional)}))}
      units={units.map(u=>({id:u.id,label:[u.bloco && 'Bloco '+u.bloco,u.identificacao].filter(Boolean).join(' · ')}))}/>
    {unit && !charges.length && <EasyEmpty title="Nenhuma cobrança encontrada" description="Selecione outra unidade."/>}
    {charges.map(c=><section key={c.id} className={styles.panel+' space-y-3'}>
      <h2>{formatCurrency(c.valor_atualizado??c.valor_original??0)} · {c.vencimento?.split('-').reverse().join('/')}</h2>
      <p>{c.status_operacional?.replaceAll('_',' ')} · {c.status_financeiro?.replaceAll('_',' ')}</p>
      {op.key==='excluir' && (c.status_financeiro!=='em_aberto' || c.data_pagamento || Number(c.valor_pago)>0 || !['novo','regular','em_cobranca_ativa','suspenso'].includes(c.status_operacional??'')) ? <p>Esta cobrança não está disponível para exclusão.</p> : op.key==='excluir' ? <details><summary className="cursor-pointer">Revisar exclusão</summary>
        <form action={excluirCobranca} className="mt-4 grid gap-3">
          <input type="hidden" name="id" value={c.id}/>
          <label>Motivo da exclusão<textarea name="motivo" required minLength={10} className="block w-full border p-2"/></label>
          <label><input type="checkbox" name="confirmar" required/> Confirmo a retirada desta cobrança da operação.</label>
          <button className={styles.primary}>Excluir cobrança</button>
        </form></details> : <Link className={styles.primary} href={'/app/cobrancas/'+c.id+(op.key==='editar'?'?acao=editar-financeiro#financeiro':'')}>{op.title} cobrança</Link>}
    </section>)}
  </main>
}
