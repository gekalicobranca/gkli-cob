import type { ReactNode } from 'react';
import Link from 'next/link';
import { Handshake, FileUp, ReceiptText, Sparkles, Workflow } from 'lucide-react';
import styles from '@/components/easy/easy.module.css';

export default function EasyModuleLayout({ children }: { children: ReactNode }) {
  return <div className={styles.workspace}><nav aria-label="Módulo Easy Cob" className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
    <Link href="/app/configuracoes/easy" className="mr-auto inline-flex items-center gap-2 pr-5 text-sm font-bold text-slate-900"><Sparkles size={17} className="text-cyan-700" aria-hidden="true" />Easy Cob</Link>
    <Link href="/app/configuracoes/easy/acordos" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><Handshake size={15} aria-hidden="true" />Acordos</Link>
    <Link href="/app/configuracoes/easy/captacao" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><FileUp size={15} aria-hidden="true" />Captação de inadimplência</Link>
    <Link href="/app/configuracoes/easy/flow" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><Workflow size={15} aria-hidden="true" />Easy Flow</Link>
    <Link href="/app/configuracoes/easy/pag" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><ReceiptText size={15} aria-hidden="true" />Easy Pag</Link>
  </nav>{children}</div>;
}
