'use client';

import { useRef, useState } from 'react';
import { conferirRecuperacaoEasy, reconciliarRecuperacaoEasy } from './actions';
import styles from '@/components/easy/easy.module.css';

type Execucao = NonNullable<Awaited<ReturnType<typeof conferirRecuperacaoEasy>>['run']>;

export function RecuperacaoEasy() {
  const [id, setId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [atividade, setAtividade] = useState<'consulta' | 'reconciliacao' | null>(null);
  const [run, setRun] = useState<Execucao | null>(null);
  const [precisaConferir, setPrecisaConferir] = useState(false);
  const ocupado = useRef(false);
  const operacao = useRef<{ chave: string; versao: string } | null>(null);

  async function conferir() {
    if (ocupado.current || !id.trim()) return;
    ocupado.current = true;
    setAtividade('consulta');
    setErro('');
    setAviso('');
    try {
      const resultado = await conferirRecuperacaoEasy(id.trim());
      if (!resultado.run) throw Error();
      setRun(resultado.run);
      if (operacao.current?.versao !== resultado.run.versao) operacao.current = null;
      setPrecisaConferir(false);
      setAviso('Consulta atualizada. Confira os contadores abaixo.');
    } catch {
      setPrecisaConferir(true);
      setErro('Consulta indisponível. Confira o identificador e tente consultar novamente.');
    } finally {
      ocupado.current = false;
      setAtividade(null);
    }
  }

  async function reconciliar() {
    if (!run || ocupado.current || precisaConferir || run.protocolo !== 3 || motivo.trim().length < 10) return;
    ocupado.current = true;
    setAtividade('reconciliacao');
    setErro('');
    setAviso('');
    try {
      operacao.current ??= { chave: crypto.randomUUID(), versao: run.versao };
      const resultado = await reconciliarRecuperacaoEasy(run.id, run.versao, motivo, operacao.current.chave);
      if (!resultado.run) throw Error();
      setRun(resultado.run);
      operacao.current = null;
      setMotivo('');
      setAviso('Reconciliação confirmada. Confira os contadores atualizados.');
    } catch {
      setPrecisaConferir(true);
      setErro('Reconciliação sem confirmação. Consulte a execução antes de prosseguir.');
    } finally {
      ocupado.current = false;
      setAtividade(null);
    }
  }

  return <section className={styles.panel + ' space-y-4'}>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void conferir(); }}>
      <label className="block text-sm">Identificador da execução
        <input value={id} disabled={Boolean(atividade)} onChange={event => {
          setId(event.target.value);
          setRun(null);
          setMotivo('');
          setErro('');
          setAviso('');
          setPrecisaConferir(false);
          operacao.current = null;
        }} className="mt-2 block w-full rounded border p-3"/>
      </label>
      <div className={styles.operationActions}><button disabled={Boolean(atividade) || !id.trim()} className={styles.primary}>Conferir execução</button></div>
    </form>
    <p role="status">{atividade === 'consulta' ? 'Consultando execução…' : atividade === 'reconciliacao' ? 'Reconciliando contadores…' : aviso}</p>
    {erro && <p role="alert" className="text-rose-800">{erro}</p>}
    {run && <>
      <p>{precisaConferir && 'Última leitura disponível. '}Estado da execução · {run.status === 'preview' ? 'Prévia' : run.status.replaceAll('_', ' ')}. Partes montadas · {run.parte}. Liberações registradas · {run.liberadas} de {run.flows}.</p>
      {run.protocolo === 3 ? <>
        <label className="block text-sm">Motivo da reconciliação (10 a 2.000 caracteres)
          <textarea value={motivo} maxLength={2000} disabled={Boolean(atividade) || precisaConferir} onChange={event => {
            setMotivo(event.target.value);
            operacao.current = null;
            setAviso('');
          }} className="mt-2 block w-full rounded border p-3"/>
        </label>
        <div className={styles.operationActions}><button type="button" disabled={Boolean(atividade) || precisaConferir || motivo.trim().length < 10}
          onClick={reconciliar} className={styles.primary}>Reconciliar contadores por recibos</button></div>
      </> : <p>Execução legada. Revise manualmente os vínculos e os recibos no histórico do Flow.</p>}
    </>}
  </section>;
}
