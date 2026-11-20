'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Workflow,LoaderCircle,CheckCircle2,Mail} from 'lucide-react';
import {SearchableSelect} from '@/components/ui/searchable-select';
import {EasySteps,EasyEmpty} from '@/components/easy/easy-ui';
import {formatCurrency} from '@/utils/formatters/currency';
import type {EasyFlowOptions,EasyFlowView} from '@/features/easy-cob/flow-model';
import {opcoesFlowEasy,prepararFlowEasy,montarParteFlowEasy,liberarParteFlowEasy,consultarFlowEasy,descartarResumoFlowEasy} from './actions';
import styles from '@/components/easy/easy.module.css';
import {CaptacaoEasy} from '../captacao/upload';

const etapasMontagem = ['preview', 'montando', 'entre_partes'];
const titulosEstado: Record<string, string> = {
  preview: 'Confira a montagem', montando: 'Montagem em andamento',
  entre_partes: 'Montagem parcial', pronto: 'Flows montados e prontos para liberação',
  liberando: 'Liberação em andamento', concluido: 'Flows liberados para a agenda',
  atencao: 'Execução precisa de conferência', cancelado: 'Operação cancelada',
};

export function EasyFlow({condominios,canWrite,condominioInicial='',dadosIniciais}:{condominioInicial?:string;dadosIniciais?:Awaited<ReturnType<typeof opcoesFlowEasy>>;condominios:{id:string;nome:string;cnpj:string|null}[];canWrite:boolean}){
  const [selected,setSelected]=useState(condominioInicial),[regua,setRegua]=useState(dadosIniciais?.options?.reguaPadrao??''),[smtp,setSmtp]=useState(dadosIniciais?.options?.smtpPadrao??'');
  const [options,setOptions]=useState<EasyFlowOptions|null>(dadosIniciais?.options??null),[run,setRun]=useState<EasyFlowView|null>(dadosIniciais?.run??null);
  const [empty,setEmpty]=useState<{pendencias:{motivo:string;quantidade:number}[]}|null>(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState(dadosIniciais?.error??'');const version=useRef(0);
  const [needsReview,setNeedsReview]=useState(Boolean(dadosIniciais?.error));
  const mutating=useRef(false);
  const [manual,setManual]=useState(false),[manualBusy,setManualBusy]=useState(false);
  const condominio=condominios.find(c=>c.id===selected);
  async function select(id:string){
    const v=++version.current;setSelected(id);setOptions(null);setRun(null);setEmpty(null);setError('');setRegua('');setSmtp('');setNeedsReview(false);if(!id){setBusy('');return;}setBusy('Carregando réguas e contas…');
    try{const p=await opcoesFlowEasy(id);if(v!==version.current)return;if(p.error)throw Error(p.error);setOptions(p.options??null);setRegua(p.options?.reguaPadrao??'');setSmtp(p.options?.smtpPadrao??'');setRun(p.run??null);setNeedsReview(false);}catch(e){if(v===version.current){setNeedsReview(true);setError(e instanceof Error?e.message:'Não foi possível carregar.');}}finally{if(v===version.current)setBusy('');}
  }
  async function preview(){if(mutating.current||needsReview||!canWrite)return;mutating.current=true;setBusy('Conferindo cobranças e contatos…');setError('');setEmpty(null);try{const p=await prepararFlowEasy(selected,regua,smtp);if(p.error)throw Error(p.error);setRun(p.run??null);setEmpty(p.empty??null);}catch(e){setNeedsReview(true);setError(e instanceof Error?e.message:'Não foi possível preparar. Consulte o andamento.');}finally{mutating.current=false;setBusy('');}}
  async function process(release:boolean){
    if(!run||mutating.current||needsReview||!canWrite)return;mutating.current=true;let current=run;setError('');
    try{
      while(release?current.status==='pronto':['preview','entre_partes'].includes(current.status)){
        setBusy(release?`Liberando flow ${current.liberadas+1} de ${current.flowIds.length}…`:`Montando parte ${current.parte+1} de ${current.partes}…`);
        const old=release?current.liberadas:current.parte;
        const p=release?await liberarParteFlowEasy(current.id,current.liberadas):await montarParteFlowEasy(current.id,current.parte);
        if(p.error)throw Error(p.error);if(!p.run)throw Error('Consulte o andamento antes de continuar.');current=p.run;setRun(current);
        if((release?current.liberadas:current.parte)===old)break;
      }
    }catch(e){setNeedsReview(true);setError(e instanceof Error?e.message:'Operação interrompida. Consulte o andamento antes de continuar.');}finally{mutating.current=false;setBusy('');}
  }
  async function refresh(){if(!run){await select(selected);return;}setBusy('Consultando andamento…');try{const p=await consultarFlowEasy(run.id);if(p.error||!p.run)throw Error(p.error??'Resultado indisponível.');setRun(p.run);setNeedsReview(false);setError('');}catch(e){setNeedsReview(true);setError(e instanceof Error?e.message:'Não foi possível consultar. Não repita a operação.');}finally{setBusy('');}}
  async function adjust(){if(!run||mutating.current||needsReview||!canWrite)return;mutating.current=true;setBusy('Descartando a prévia para ajustar a seleção…');try{const p=await descartarResumoFlowEasy(run.id);if(p.error)throw Error(p.error);setRun(null);setError('');}catch(e){setNeedsReview(true);setError(e instanceof Error?e.message:'Não foi possível consultar o resultado.');}finally{mutating.current=false;setBusy('');}}
  const chosen=options?.reguas.find(r=>r.id===regua),email=chosen?.canais.includes('email');
  const monitor=`/app/flows/cobranca/${run?.canais.includes('email')?'email':'whatsapp'}?condominio=${selected}&aba=flows`;
  return <div className="space-y-5"><EasySteps labels={['Condomínio e envio','Conferir e montar','Liberar flows']} current={run?(etapasMontagem.includes(run.status)?1:2):0}/>
    <section className={styles.panel}><label htmlFor="easy-flow-condominio" className="text-sm font-semibold">Qual condomínio?</label><fieldset className="mt-3" disabled={Boolean(busy)||Boolean(run)||manual}><SearchableSelect id="easy-flow-condominio" name="condominio" selectedValue={selected} options={condominios.map(c=>({value:c.id,label:c.nome}))} placeholder="Digite o nome do condomínio" onValueChange={select} inputClassName="w-full border bg-slate-50 p-3 text-sm"/></fieldset><p className="mt-3 text-xs text-slate-500">Condomínios sem agente remoto configurado. As regras de cobrança e os contatos são os mesmos do GKLI Cob.</p></section>
    {!condominios.length&&<EasyEmpty title="Nenhum condomínio disponível" description="Esta rotina atende condomínios ativos sem agente remoto configurado."/>}
    {condominio&&!run&&!manual&&<section className={`${styles.panel} flex flex-wrap items-center justify-between gap-3`}><div><h2>Conversão não deu certo?</h2><p className="mt-1 text-xs text-slate-500">Preencha o modelo e confira as cobranças antes de confirmar a carga.</p></div><button type="button" disabled={!canWrite||Boolean(busy)} onClick={()=>{setManual(true);setEmpty(null);setError('');}} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold">Conferir planilha manual</button></section>}
    {manual&&condominio&&<><section className={`${styles.panel} space-y-3`}><h2>Importação manual</h2><p className="text-sm text-slate-600">Baixe o modelo, preencha as cobranças e envie o arquivo completo para conferência. CNPJ para preencher em B3: <strong>{condominio.cnpj||'não cadastrado'}</strong>.</p><div className="flex flex-wrap gap-3"><a href="/modelos/easy-flow-importacao.xlsx" download className={styles.primary}>Baixar planilha modelo</a><button type="button" disabled={manualBusy} onClick={()=>{setManual(false);void select(selected);}} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Voltar para flows</button></div></section>{condominio.cnpj?.replace(/\D/g,'').length===14?<CaptacaoEasy key={condominio.id} condominios={[{...condominio,cnpj:condominio.cnpj}]} manualCondominio={{...condominio,cnpj:condominio.cnpj}} canWrite={canWrite} onWorking={setManualBusy}/>:<EasyEmpty title="Complete o CNPJ do condomínio" description="O CNPJ é necessário para conferir se a planilha pertence ao condomínio selecionado."/>}</>}
    {options&&!run&&!manual&&<section className={`${styles.panel} space-y-4`}><div><label htmlFor="easy-flow-regua" className="text-sm font-semibold">Qual régua vamos usar?</label><select id="easy-flow-regua" value={regua} disabled={Boolean(busy)} onChange={e=>{setRegua(e.target.value);setEmpty(null);setError('');}} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><option value="">Selecione a régua</option>{options.reguas.map(r=><option key={r.id} value={r.id}>{r.nome} · {r.canais.map(c=>c==='email'?'E-mail':'WhatsApp').join(' + ')}</option>)}</select></div>
      {email&&<div><label htmlFor="easy-flow-smtp" className="flex items-center gap-2 text-sm font-semibold"><Mail size={16} aria-hidden="true"/>Por qual conta SMTP?</label><select id="easy-flow-smtp" value={smtp} disabled={Boolean(busy)||options.smtpFixo} onChange={e=>setSmtp(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><option value="">Selecione uma conta da carteira</option>{options.smtp.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select><p className="mt-2 text-xs text-slate-500">{options.smtpFixo?'Este condomínio tem uma rota SMTP específica. A conta configurada será preservada.':'A conta escolhida será usada pelos flows e pelas próximas etapas da régua.'}</p>{!options.smtp.length&&<p className="mt-2 text-sm text-amber-800">Cadastre uma conta SMTP ativa nesta carteira para continuar com e-mail.</p>}</div>}
      <button type="button" className={styles.primary} disabled={!canWrite||Boolean(busy)||needsReview||!regua||(email&&!smtp)} onClick={preview}>Conferir cobranças<ArrowRight size={16} aria-hidden="true"/></button></section>}
    {busy&&<p role="status" className="flex items-center gap-2 text-sm text-cyan-800"><LoaderCircle size={17} aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>{busy}</p>}
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}
    {needsReview&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{options || run ? 'Consulte o andamento antes de repetir a operação.' : 'Confira se há uma execução aberta para este condomínio.'} <button type="button" disabled={Boolean(busy)} className="underline" onClick={refresh}>{options || run ? 'Consultar andamento' : 'Recarregar opções e andamento'}</button></p>}
    {empty&&<section className={`${styles.panel} space-y-4`}><h2>Nenhuma cobrança apta para novos flows</h2><p className="text-sm text-slate-500">Confira as pendências ou acompanhe os flows que já existem para este condomínio.</p><Reasons rows={empty.pendencias}/></section>}
    {run&&<section className={`${styles.panel} space-y-5`}><h2 aria-live="polite" className="flex items-center gap-2">{run.status==='concluido'?<CheckCircle2 size={22} className="text-emerald-600" aria-hidden="true"/>:<Workflow size={22} className="text-cyan-700" aria-hidden="true"/>}{run.legado ? 'Execução anterior: confira o histórico' : titulosEstado[run.status] ?? 'Consulte o andamento da operação'}</h2>
      <div className={styles.totalBand}><div><p>{run.cobrancas} cobrança(s) · {run.unidades} unidade(s)</p><strong>{formatCurrency(run.valor)}</strong></div><span className="text-sm">{run.flowIds.length||run.partes} flow(s){!run.flowIds.length?' previstos':''}</span></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Régua</dt><dd className="mt-1 font-semibold">{run.regua}</dd></div><div><dt className="text-xs text-slate-500">Conta SMTP</dt><dd className="mt-1 break-all font-semibold">{run.smtp}</dd></div></dl>
      {!run.legado && run.status==='preview'?<><p className="text-sm text-slate-600">A montagem prepara os flows pausados. Você confere o resultado e libera os envios no próximo passo.</p><details className="text-sm"><summary className="cursor-pointer font-semibold">Ver amostra das cobranças</summary><ul className="mt-3 space-y-2">{run.amostra.map((r,i)=><li key={i} className="flex flex-wrap justify-between gap-3 rounded-lg bg-slate-50 p-2"><span>{r.unidade}</span><span>{formatCurrency(r.valor)}</span></li>)}</ul></details></>:<p className="text-sm text-slate-600">{run.mensagens} mensagem(ns) preparada(s) · {run.liberadas} de {run.flowIds.length} flow(s) liberado(s).</p>}
      <Reasons rows={run.pendencias}/>
      <p className="break-all text-xs text-slate-500">Operação {run.id} · Atualizada em: {run.atualizadaEm}</p>
      {run.legado && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">Confira os flows, a agenda e as tentativas no monitor antes de decidir como prosseguir.</p>}
      {!run.legado && run.requerConferencia&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">Esta execução continua bloqueando outra montagem para este condomínio. Consulte o andamento para conferir os recibos e recuperar etapas confirmadas. Divergências e execuções antigas exigem revisão dos flows e mensagens.</p>}
      {run.erro&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{run.erro} Consulte os flows montados antes de iniciar outra operação.</p>}
      {!run.legado && run.status==='pronto'&&<p className="rounded-xl bg-cyan-50 p-4 text-sm text-cyan-950">Ao liberar, os envios serão agendados para os contatos das unidades aptas deste condomínio, respeitando os horários e limites da carteira.{run.canais.includes('email')?` E-mails pela conta ${run.smtp}.`:''}</p>}
      <div className={styles.operationActions}>
        {!run.legado && run.status==='preview'&&<><button type="button" disabled={!canWrite||Boolean(busy)||needsReview} onClick={adjust} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Ajustar</button><button type="button" className={styles.primary} disabled={!canWrite||Boolean(busy)||needsReview} onClick={()=>process(false)}>Montar flows<ArrowRight size={16} aria-hidden="true"/></button></>}
        {!run.legado && run.status==='entre_partes'&&<button type="button" className={styles.primary} disabled={!canWrite||Boolean(busy)||needsReview} onClick={()=>process(false)}>Continuar montagem</button>}
        {!run.legado && run.status==='pronto'&&<button type="button" className={styles.primary} disabled={!canWrite||Boolean(busy)||needsReview} onClick={()=>process(true)}>Liberar {run.flowIds.length-run.liberadas} flow(s)<ArrowRight size={16} aria-hidden="true"/></button>}
        {['montando','liberando','atencao'].includes(run.status)&&!busy&&!needsReview&&<button type="button" className={styles.primary} onClick={refresh}>Consultar andamento</button>}
        {(run.legado||run.flowIds.length>0||run.status==='atencao')&&<Link href={monitor} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Ver flows e mensagens</Link>}
        {['concluido','cancelado'].includes(run.status)&&<button type="button" disabled={Boolean(busy)||needsReview} onClick={()=>{setRun(null);select('');}} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Nova operação</button>}
      </div>
    </section>}
  </div>;
}
function Reasons({rows}:{rows:{motivo:string;quantidade:number}[]}){return rows.length?<details className="rounded-xl bg-slate-50 p-4 text-sm"><summary className="cursor-pointer font-semibold">Cobranças fora da montagem ({rows.reduce((n,r)=>n+r.quantidade,0)})</summary><ul className="mt-3 space-y-2 text-xs text-slate-600">{rows.map(r=><li key={r.motivo}>{r.quantidade} · {r.motivo}</li>)}</ul></details>:null;}
