'use client';
import { useRef, useState } from 'react';
import { Download, FileUp, LoaderCircle } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { EasySteps, EasyEmpty } from '@/components/easy/easy-ui';
import { createConversionFormData } from '@/features/conversao-relatorio/prepare-upload';
import type { ResumoCaptacaoEasy } from '@/features/easy-cob/captacao-preview';
import { formatCurrency } from '@/utils/formatters/currency';
import { formatarVencimentoAcordo } from '@/features/acordos/formatar-vencimento';
import styles from '@/components/easy/easy.module.css';

type ResultadoCap={ok:boolean;conversaoId?:string;jaConfirmada?:boolean;error?:string;code?:string;
  resumo?:{cobrancasCriadas:number;cobrancasAtualizadas:number;cobrancasArquivadas:number;cobrancasIgnoradas:number;unidadesCriadas:number;contatosAtualizados:number;inconsistencias:string[]}};

export function CaptacaoEasy({condominios,canWrite,manualCondominio,onWorking}:{condominios:{id:string;nome:string;cnpj:string}[];canWrite:boolean;manualCondominio?:{id:string;nome:string;cnpj:string};onWorking?:(busy:boolean)=>void}) {
  const [selected,setSelected]=useState(manualCondominio?.id??'');
  const [reading,setReading]=useState(false);
  const [confirming,setConfirming]=useState(false),[incerto,setIncerto]=useState(false),[retryChecked,setRetryChecked]=useState(false);
  const [resultado,setResultado]=useState<ResultadoCap|null>(null),[rejeitada,setRejeitada]=useState(false);
  const mutation=useRef(false);
  const [resumo,setResumo]=useState<ResumoCaptacaoEasy|null>(null);
  const [error,setError]=useState('');
  const [uploadKey,setUploadKey]=useState(0);
  const version=useRef(0);
  const planilhaInput=useRef<HTMLInputElement>(null);
  const condominio=condominios.find(c=>c.id===selected);
  function reset() {version.current++;setResumo(null);setResultado(null);setRejeitada(false);setIncerto(false);setRetryChecked(false);setError('');setReading(false);setUploadKey(k=>k+1);}
  async function read(file:File|null, usarModelo=Boolean(manualCondominio)) {
    reset(); if(!file||!condominio) return;
    const requestVersion=version.current; setReading(true);onWorking?.(true);
    try {
      const form=await createConversionFormData(file,'cobrancas',condominio.cnpj);
      form.set('condominio_id',condominio.id);
      if(usarModelo)form.set('modelo','easy_flow_v1');
      if(manualCondominio)form.set('contexto','easy_flow');
      const response=await fetch('/api/easy-cob/captacao',{method:'POST',body:form});
      const payload=await response.json();
      if(requestVersion!==version.current) return;
      if(!response.ok||!payload.ok) throw new Error(payload.error??'Não foi possível ler o arquivo.');
      setResumo(payload.resumo);
    } catch(e) {if(requestVersion===version.current) setError(e instanceof Error?e.message:'A leitura foi interrompida. Tente novamente.');}
    finally {if(requestVersion===version.current){setReading(false);onWorking?.(false);}}
  }
  async function confirmar() {
    if(!resumo||resumo.protocolo!==2||!canWrite||mutation.current||rejeitada||(incerto&&!retryChecked))return;
    mutation.current=true;setConfirming(true);setRetryChecked(false);setError('');onWorking?.(true);
    try {
      const response=await fetch('/api/conversao-relatorio/confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        conversaoId:resumo.conversaoId,condominioId:resumo.condominioId,carteiraId:resumo.carteiraId,easy:true,confirmacao:true})});
      const data:ResultadoCap=await response.json();
      if(!response.ok||!data.ok) {
        if(data.code==='EASY_CAP_COMMIT_REJECTED'){setRejeitada(true);setIncerto(false);setError(data.error??'A transação foi recusada. Envie nova prévia.');return;}
        throw Error(data.error??'Consulte o resultado antes de continuar.');
      }
      setResultado(data);setIncerto(false);
    } catch {setIncerto(true);setError('A resposta foi interrompida ou está indisponível. Consulte o resultado desta operação antes de continuar.');}
    finally {mutation.current=false;setConfirming(false);onWorking?.(false);}
  }
  async function recuperarResultado() {
    if(!resumo||mutation.current)return;mutation.current=true;setConfirming(true);setRetryChecked(false);setError('');onWorking?.(true);
    try {
      const response=await fetch(`/api/easy-cob/captacao/status?conversaoId=${encodeURIComponent(resumo.conversaoId)}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||!data.ok)throw Error('lookup_failed');
      if(data.execucao.resultado==='confirmado'&&data.execucao.resumo) {setResultado({ok:true,jaConfirmada:true,resumo:data.execucao.resumo});setIncerto(false);}
      else {setRetryChecked(data.execucao.status==='preview');setError('Ainda não há resultado confirmado. Você pode consultar novamente ou retomar a mesma confirmação, sem enviar outro arquivo.');}
    } catch {setError('Não foi possível consultar. Não inicie outra captação para este condomínio.');}
    finally {mutation.current=false;setConfirming(false);onWorking?.(false);}
  }
  return <div className="space-y-5"><DiagnosticoCaptacao conversaoId={resumo?.conversaoId}/>{!manualCondominio&&<EasySteps labels={['Condomínio','Arquivo','Conferência']} current={resumo?2:selected?1:0} />}
    {!manualCondominio&&<section className={styles.panel}><label htmlFor="capture-condominium" className="text-sm font-semibold">Qual condomínio?</label>
      <fieldset disabled={reading||confirming||incerto} className="mt-3"><SearchableSelect id="capture-condominium" name="condominio" selectedValue={selected}
        options={condominios.map(c=>({value:c.id,label:c.nome}))} placeholder="Digite o nome do condomínio" inputClassName="w-full border bg-slate-50 p-3 text-sm"
        onValueChange={id=>{reset();setSelected(id);}} /></fieldset>
      <p className="mt-3 text-xs text-slate-500">Somente condomínios sem agente remoto configurado. A leitura usa o motor de conversão do GKLI Cob.</p>
    </section>}
    {!condominios.length&&<EasyEmpty title="Nenhum condomínio disponível" description="Os condomínios precisam estar ativos, com CNPJ cadastrado e sem agente remoto configurado." />}
    {condominio&&!resumo&&<section className={styles.panel}><label className={`${styles.upload} text-sm font-semibold`}>
      <span className="mb-4 flex items-center gap-3"><span className={styles.icon}><FileUp size={22} aria-hidden="true" /></span><span>{manualCondominio?'Carregar planilha preenchida':'Relatório de inadimplência'}<span className="mt-1 block text-xs font-normal text-slate-500">{manualCondominio?'Use o modelo do Easy Flow com todas as cobranças do condomínio.':'Envie o arquivo completo da administradora.'}</span></span></span>
      <input key={`${selected}-${uploadKey}`} type="file" name="file" accept={manualCondominio?'.xlsx':'.pdf,.xls,.xlsx,.csv,.html,.htm'} disabled={!canWrite||reading} onChange={event=>read(event.target.files?.[0]??null)} className="block w-full min-w-0 font-normal" />
      <span className="mt-3 block text-xs font-normal text-slate-500">{manualCondominio?'Planilha XLSX do modelo · até 32 MB. Erros serão indicados por linha.':'PDF pesquisável, XLS, XLSX, CSV ou HTML · até 32 MB. Leitura automática ao escolher.'}</span>
    </label>
      {!manualCondominio&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
        <div>
          <h2 className="text-sm font-semibold">Planilha de carga de inadimplência</h2>
          <p className="mt-1 text-xs text-slate-600">Preencha todas as cobranças no modelo. Use o CNPJ <strong>{condominio.cnpj}</strong> na célula B3.</p>
          <p className="mt-1 text-xs text-slate-600">E-mail e telefone são opcionais. Para identificar acordos ou cobranças jurídicas, use a coluna “Marcador no PDF” após Recibo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/modelos/easy-flow-importacao.xlsx" download className={styles.primary}><Download size={16} aria-hidden="true" />Baixar planilha modelo</a>
          <button type="button" disabled={!canWrite||reading} onClick={()=>planilhaInput.current?.click()} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold disabled:opacity-50">Enviar planilha preenchida</button>
          <input key={`planilha-${selected}-${uploadKey}`} ref={planilhaInput} type="file" accept=".xlsx" hidden onChange={event=>read(event.target.files?.[0]??null,true)} />
        </div>
      </div>}
      {reading&&<p role="status" className="mt-4 flex items-center gap-2 text-sm text-cyan-800"><LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Lendo o arquivo e preparando o resumo…</p>}</section>}
    {error&&<p role="alert" className="whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}
    {resultado?.ok&&<section role="status" className={`${styles.panel} space-y-3`}><h2>Captação confirmada</h2>
      <p className="break-all text-xs">Operação {resumo?.conversaoId}</p>
      {resultado.resumo&&<p>{resultado.resumo.cobrancasCriadas} cobrança(s) criada(s), {resultado.resumo.cobrancasAtualizadas} atualizada(s) e {resultado.resumo.cobrancasArquivadas} arquivada(s). {resultado.resumo.cobrancasIgnoradas} linha(s) preservada(s) ou fora da régua.</p>}
      {resultado.resumo?.inconsistencias.map((aviso,index)=><p key={index} className="text-sm text-amber-900">{aviso}</p>)}
      <button type="button" className={styles.primary} onClick={reset}>Nova captação</button></section>}
    {resumo&&!resultado?.ok&&<section className={`${styles.panel} space-y-5`}>
      <header><h2>Confira a captação</h2><p className="mt-1 break-words text-xs text-slate-500">{resumo.condominio} · {resumo.arquivo}</p></header>
      <div className={styles.totalBand}><div><p>Inadimplência na prévia</p><strong>{formatCurrency(resumo.valor)}</strong></div><span className="text-sm">{resumo.unidades} unidade(s) · {resumo.cobrancas} cobrança(s)</span></div>
      {Boolean(resumo.acordos||resumo.juridicas)&&<p className="text-sm text-slate-700">{resumo.acordos??0} com marcador de acordo · {resumo.juridicas??0} com marcador jurídico</p>}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"><strong>{resumo.substituir} cobrança(s) anterior(es) no recorte de substituição. Esta prévia não altera a base.</strong>
        <p className="mt-1">Cobranças elegíveis com vencimento em {resumo.ano} serão atualizadas ou arquivadas. Pagamentos, acordos, bloqueios e histórico protegido serão preservados.</p>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-semibold text-slate-600">Ver amostra do arquivo · {resumo.origem}</summary>
        <div className="mt-3 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><caption className="sr-only">Amostra de cobranças captadas</caption><thead className="bg-slate-50"><tr><th className="p-3">Unidade</th><th className="p-3">Vencimento</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{resumo.amostra.map((item,index)=><tr key={index} className="border-t border-slate-100"><td className="p-3">{item.bloco?`${item.bloco} · `:''}{item.unidade}</td><td className="whitespace-nowrap p-3">{formatarVencimentoAcordo(item.vencimento)}</td><td className="whitespace-nowrap p-3 text-right">{formatCurrency(item.valor)}</td></tr>)}</tbody></table></div>
      </details>
      {resumo.avisos.length>0&&<details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer">Observações do arquivo ({resumo.avisos.length})</summary><ul className="mt-2 list-inside list-disc space-y-2 text-xs text-slate-600">{resumo.avisos.map((aviso,index)=><li key={index}>{aviso}</li>)}</ul></details>}
      <p className="break-all text-xs text-slate-500">Operação {resumo.conversaoId}. Ao confirmar, você declara que conferiu o condomínio e enviou o relatório completo.</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={reading||confirming||incerto} onClick={reset} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Trocar arquivo</button>
        {incerto&&<button type="button" disabled={confirming} onClick={recuperarResultado} className="rounded-xl border px-4 py-3 text-sm">Consultar resultado desta operação</button>}
        <button type="button" className={styles.primary} disabled={!canWrite||confirming||resumo.protocolo!==2||rejeitada||(incerto&&!retryChecked)} onClick={confirmar}>{confirming?'Consultando…':incerto?'Retomar mesma confirmação':'Confirmar captação'}</button></div>
    </section>}
  </div>;
}

function DiagnosticoCaptacao({conversaoId}:{conversaoId?:string}) {
  const [id,setId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const version=useRef(0);
  const selected=id.trim()||conversaoId||'';
  async function consultar() {
    const current=++version.current;setBusy(true);setMessage('');
    try {
      const response=await fetch(`/api/easy-cob/captacao/status?conversaoId=${encodeURIComponent(selected)}`,{cache:'no-store'});
      const data=await response.json();
      if(current!==version.current)return;
      if(!response.ok||!data.ok)throw Error(data.error??'Não foi possível consultar.');
      const result=data.execucao;
      const outcome=result.resultado==='confirmado'?'Conclusão registrada.':result.resultado==='sem_aplicacao_confirmada'
        ?'Prévia salva; nenhuma aplicação confirmada.':'O resultado exige conferência do histórico. Não repita a captação.';
      setMessage(`Operação ${result.id} · Estado: ${result.status} · ${outcome}`);
    } catch(e) {if(current===version.current)setMessage(e instanceof Error?e.message:'Não foi possível consultar. Não repita a confirmação.');}
    finally {if(current===version.current)setBusy(false);}
  }
  return <section className={`${styles.panel} space-y-3`} aria-label="Consultar resultado da captação">
    <label htmlFor="easy-cap-status" className="text-sm font-semibold">Consultar uma captação anterior</label>
    <input id="easy-cap-status" value={id} placeholder={conversaoId||'Identificador da operação'} className="w-full rounded-xl border p-3 text-sm"
      onChange={event=>{version.current++;setId(event.target.value);setMessage('');setBusy(false);}} />
    <button type="button" disabled={!selected||busy} onClick={consultar} className="rounded-xl border px-4 py-3 text-sm">{busy?'Consultando…':'Consultar resultado'}</button>
    {message&&<p role="status" className="text-sm">{message}</p>}
  </section>;
}
