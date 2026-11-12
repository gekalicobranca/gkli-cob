import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Bot, Handshake, FileUp, ReceiptText, ScanLine, Sparkles, Workflow } from 'lucide-react';
import styles from '@/components/easy/easy.module.css';

export const metadata: Metadata = { title: 'Easy Cob' };

export default function EasyModuleLayout({ children }: { children: ReactNode }) {
  return <main className={`${styles.workspace} h-dvh overflow-y-auto px-4 pt-5 sm:px-6`}><nav aria-label="Módulo Easy Cob" className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
    <Link href="/app/configuracoes/easy" className="mr-auto inline-flex items-center gap-2 pr-5 text-sm font-bold text-slate-900"><Sparkles size={17} className="text-cyan-700" aria-hidden="true" />Easy Cob</Link>
    <Link href="/app/configuracoes/easy/acordos" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><Handshake size={15} aria-hidden="true" />Acordos</Link>
    <Link href="/app/configuracoes/easy/captacao" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><FileUp size={15} aria-hidden="true" />Easy Cap</Link>
    <Link href="/app/configuracoes/easy/flow" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><Workflow size={15} aria-hidden="true" />Easy Flow</Link>
    <Link href="/app/configuracoes/easy/pag" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><ReceiptText size={15} aria-hidden="true" />Easy Pag</Link>
    <Link href="/app/configuracoes/easy/maestro" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><Bot size={15} aria-hidden="true" />Easy Maestro</Link>
    <Link href="/app/configuracoes/easy/espelhar" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><ScanLine size={15} aria-hidden="true" />Espelhar</Link>
    <Link href="/app" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-cyan-50"><ArrowLeft size={15} aria-hidden="true" />Voltar ao GKLI</Link>
  </nav>{children}</main>;
}
