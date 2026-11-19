'use client';
import {useRef,useState} from 'react';
import {conferirRecuperacaoEasy,reconciliarRecuperacaoEasy} from './actions';
export function RecuperacaoEasy(){
  const [id,setId]=useState(''),[motivo,setMotivo]=useState(''),[erro,setErro]=useState(''),[busy,setBusy]=useState(false);
  const [run,setRun]=useState<NonNullable<Awaited<ReturnType<typeof conferirRecuperacaoEasy>>['run']>|null>(null);
  const operacao=useRef<string|null>(null),enviando=useRef(false);
  async function conferir(){if(enviando.current)return;enviando.current=true;setBusy(true);setErro('');try{
    const result=await conferirRecuperacaoEasy(id.trim());if(result.error||!result.run)throw Error(result.error);setRun(result.run);operacao.current=null;
  }catch{setRun(null);setErro('Conferência indisponível para esta execução.');}finally{setBusy(false);enviando.current=false;}}
  async function reconciliar(){if(!run||enviando.current)return;enviando.current=true;setBusy(true);setErro('');operacao.current??=crypto.randomUUID();try{
    const result=await reconciliarRecuperacaoEasy(run.id,run.versao,motivo,operacao.current);if(result.error||!result.run)throw Error(result.error);setRun(result.run);operacao.current=null;
  }catch{setErro('Não foi possível confirmar. Consulte novamente antes de continuar; nenhum envio é autorizado por esta ação.');}finally{setBusy(false);enviando.current=false;}}
  return <section className="space-y-4 rounded-xl border p-4"><label className="block text-sm">Identificador da execução<input value={id} disabled={busy} onChange={e=>{setId(e.target.value);setRun(null);operacao.current=null;}} className="mt-2 block w-full rounded border p-3"/></label>
    <button type="button" disabled={busy||!id} onClick={conferir} className="rounded border px-4 py-2">Conferir execução</button>
    {run&&<><p role="status">Estado: {run.status} · {run.parte} parte(s) montada(s) · {run.liberadas} de {run.flows} liberação(ões) registrada(s).</p>
      {run.protocolo===3?<><label className="block text-sm">Motivo da reconciliação<textarea value={motivo} maxLength={2000} disabled={busy} onChange={e=>{setMotivo(e.target.value);operacao.current=null;}} className="mt-2 block w-full rounded border p-3"/></label><button type="button" disabled={busy||motivo.trim().length<10} onClick={reconciliar} className="rounded border px-4 py-2">Reconciliar contadores por recibos</button></>:<p>Execução legada exige revisão manual; vínculos não serão inferidos.</p>}</>}
    {erro&&<p role="alert" className="text-rose-800">{erro}</p>}
  </section>;
}
