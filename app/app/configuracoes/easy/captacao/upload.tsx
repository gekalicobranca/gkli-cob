'use client';
import { useRef, useState } from 'react';
import { Download, FileUp, ArrowRight, CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { EasySteps, EasyEmpty } from '@/components/easy/easy-ui';
import { createConversionFormData } from '@/features/conversao-relatorio/prepare-upload';
import type { ResumoCaptacaoEasy } from '@/features/easy-cob/captacao-preview';
import { formatCurrency } from '@/utils/formatters/currency';
import { formatarVencimentoAcordo } from '@/features/acordos/formatar-vencimento';
import styles from '@/components/easy/easy.module.css';

type Resultado={ok:boolean; jaConfirmada?:boolean; error?:string; resumo?:{cobrancasCriadas:number;cobrancasIgnoradas:number;cobrancasAnterioresRemovidas:number;inconsistencias:string[]}};
export function CaptacaoEasy({condominios,canWrite,manualCondominio,onWorking,onContinuar}:{condominios:{id:string;nome:string;cnpj:string}[];canWrite:boolean;manualCondominio?:{id:string;nome:string;cnpj:string};onWorking?:(busy:boolean)=>void;onContinuar?:()=>void}) {
  const [selected,setSelected]=useState(manualCondominio?.id??'');
  const [reading,setReading]=useState(false);
  const [confirming,setConfirming]=useState(false);
  const [resumo,setResumo]=useState<ResumoCaptacaoEasy|null>(null);
  const [result,setResult]=useState<Resultado|null>(null);
  const [error,setError]=useState('');
  const [uploadKey,setUploadKey]=useState(0);
  const version=useRef(0);
  const planilhaInput=useRef<HTMLInputElement>(null);
  const condominio=condominios.find(c=>c.id===selected);
  function reset() {version.current++;setResumo(null);setResult(null);setError('');setReading(false);setUploadKey(k=>k+1);}
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
  async function confirm() {
    if(!resumo||confirming) return;
    setConfirming(true);setError('');onWorking?.(true);
    try {
      const response=await fetch('/api/conversao-relatorio/confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversaoId:resumo.conversaoId,condominioId:resumo.condominioId,carteiraId:resumo.carteiraId,easy:true,confirmacao:true})});
      const payload:Resultado=await response.json();
      if(!response.ok||!payload.ok) {
        if(payload.resumo) {setResult(payload);return;}
        throw new Error(payload.error??'Não foi possível confirmar a captação.');
      }
      setResult(payload);
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível receber o resultado. Tente consultar a captação novamente.');}
    finally {setConfirming(false);onWorking?.(false);}
  }
  return <div className="space-y-5">{!manualCondominio&&<EasySteps labels={['Condomínio','Arquivo','Conferência']} current={resumo||result?2:selected?1:0} />}
    {!manualCondominio&&<section className={styles.panel}><label htmlFor="capture-condominium" className="text-sm font-semibold">Qual condomínio?</label>
      <fieldset disabled={confirming||Boolean(result)} className="mt-3"><SearchableSelect id="capture-condominium" name="condominio" selectedValue={selected}
        options={condominios.map(c=>({value:c.id,label:c.nome}))} placeholder="Digite o nome do condomínio" inputClassName="w-full border bg-slate-50 p-3 text-sm"
        onValueChange={id=>{reset();setSelected(id);}} /></fieldset>
      <p className="mt-3 text-xs text-slate-500">Somente condomínios sem agente remoto configurado. A leitura usa o motor de conversão do GKLI Cob.</p>
    </section>}
    {!condominios.length&&<EasyEmpty title="Nenhum condomínio disponível" description="Os condomínios precisam estar ativos, com CNPJ cadastrado e sem agente remoto configurado." />}
    {condominio&&!resumo&&!result&&<section className={styles.panel}><label className={`${styles.upload} text-sm font-semibold`}>
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
    {resumo&&!result&&<section className={`${styles.panel} space-y-5`}>
      <header><h2>Confira a captação</h2><p className="mt-1 break-words text-xs text-slate-500">{resumo.condominio} · {resumo.arquivo}</p></header>
      <div className={styles.totalBand}><div><p>Inadimplência captada</p><strong>{formatCurrency(resumo.valor)}</strong></div><span className="text-sm">{resumo.unidades} unidade(s) · {resumo.cobrancas} cobrança(s)</span></div>
      {Boolean(resumo.acordos||resumo.juridicas)&&<p className="text-sm text-slate-700">{resumo.acordos??0} com marcador de acordo · {resumo.juridicas??0} com marcador jurídico</p>}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"><strong>{resumo.substituir} cobrança(s) anterior(es) serão substituídas.</strong>
        <p className="mt-1">Como no Maestro: status Regular, Novo e Cobrança ativa, com vencimento em {resumo.ano}, sem vínculo com acordo. Acordos e os demais status serão preservados.</p>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-semibold text-slate-600">Ver amostra do arquivo · {resumo.origem}</summary>
        <div className="mt-3 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><caption className="sr-only">Amostra de cobranças captadas</caption><thead className="bg-slate-50"><tr><th className="p-3">Unidade</th><th className="p-3">Vencimento</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{resumo.amostra.map((item,index)=><tr key={index} className="border-t border-slate-100"><td className="p-3">{item.bloco?`${item.bloco} · `:''}{item.unidade}</td><td className="whitespace-nowrap p-3">{formatarVencimentoAcordo(item.vencimento)}</td><td className="whitespace-nowrap p-3 text-right">{formatCurrency(item.valor)}</td></tr>)}</tbody></table></div>
      </details>
      {resumo.avisos.length>0&&<details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer">Observações do arquivo ({resumo.avisos.length})</summary><ul className="mt-2 list-inside list-disc space-y-2 text-xs text-slate-600">{resumo.avisos.map((aviso,index)=><li key={index}>{aviso}</li>)}</ul></details>}
      <p className="text-xs text-slate-500">Ao confirmar, você declara que conferiu o condomínio e enviou o relatório completo. Nenhuma cobrança foi substituída até aqui.</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={confirming} onClick={reset} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">Trocar arquivo</button>
        <button type="button" className={styles.primary} disabled={!canWrite||confirming} onClick={confirm}>{confirming?<LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />:<ArrowRight size={17} aria-hidden="true" />}{confirming?'Confirmando captação…':'Confirmar captação'}</button></div>
    </section>}
    {result&&<section role="status" className={`${styles.panel} space-y-4`}><div className="flex items-center gap-3"><CheckCircle2 size={24} className={result.ok?'text-emerald-600':'text-amber-600'} aria-hidden="true" /><h2>{result.ok?result.jaConfirmada?'Captação já confirmada':'Captação concluída':'Captação com falhas'}</h2></div>
      {result.error&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{result.error}</p>}
      {!result.jaConfirmada&&<dl className="grid gap-3 sm:grid-cols-3">{[['Novas cobranças',result.resumo?.cobrancasCriadas],['Anteriores removidas',result.resumo?.cobrancasAnterioresRemovidas],['Existentes ou fora da régua',result.resumo?.cobrancasIgnoradas]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-2 text-2xl font-bold">{value??0}</dd></div>)}</dl>}
      {!!result.resumo?.inconsistencias.length&&<details className="text-sm"><summary className="cursor-pointer">Observações da captação ({result.resumo.inconsistencias.length})</summary><ul className="mt-3 list-inside list-disc space-y-2 text-xs text-slate-600">{result.resumo.inconsistencias.map((text,index)=><li key={index}>{text}</li>)}</ul></details>}
      {manualCondominio&&result.ok?<button type="button" className={styles.primary} onClick={onContinuar}>Continuar para flows<ArrowRight size={15} aria-hidden="true" /></button>:<button type="button" className={styles.primary} onClick={()=>{reset();if(!manualCondominio)setSelected('');}}><RefreshCw size={15} aria-hidden="true" />{manualCondominio?'Enviar planilha corrigida':'Nova captação'}</button>}
    </section>}
  </div>;
}
