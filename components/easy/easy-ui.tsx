import { ArrowLeft, Check, Compass, Sparkles } from 'lucide-react';
import Link from 'next/link';
import styles from './easy.module.css';

export function EasyHeader({ title, description, backHref, backLabel = 'Voltar ao painel' }: { title: string; description: string; backHref?: string; backLabel?: string }) {
  return <><Link className={styles.back} href={backHref ?? '/app/configuracoes/lab/easy'}><ArrowLeft size={14} aria-hidden="true" />{backLabel}</Link>
    <header className={styles.header}><span className={styles.icon}><Sparkles size={22} aria-hidden="true" /></span><div>
      <p className="!mt-0 text-[10px] font-bold uppercase tracking-[.2em] !text-cyan-700">Easy Cob</p>
      <h1>{title}</h1><p>{description}</p>
    </div></header></>;
}
export function EasySteps({ labels, current }: { labels: string[]; current: number }) {
  return <ol aria-label="Etapas da operação" className={styles.steps}>{labels.map((label, index) => <li key={label}
    className={`${styles.step} ${index < current ? styles.done : ''}`} aria-current={index === current ? 'step' : undefined}>
    <span>{index < current ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{label}
  </li>)}</ol>;
}
export function EasyEmpty({ title, description }: { title: string; description: string }) {
  return <div className={styles.empty}><span className={styles.icon}><Compass size={22} aria-hidden="true" /></span><strong>{title}</strong><p>{description}</p></div>;
}
