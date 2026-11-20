'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import styles from './easy.module.css';

const base = '/app/configuracoes/easy';
const sections = [
  ['acordos', 'Acordos'], ['cobrancas', 'Cobranças'], ['captacao', 'Easy Cap'],
  ['flow', 'Easy Flow'], ['pag', 'Easy Pag'], ['maestro', 'Easy Maestro'], ['espelhar', 'Espelhar'],
];

export function EasyNavigation() {
  const segment = useSelectedLayoutSegment();
  return <SectionMenu key={segment ?? 'inicio'} segment={segment} />;
}

function SectionMenu({ segment }: { segment: string | null }) {
  const [open, setOpen] = useState(false);
  const current = sections.find(([path]) => path === segment)?.[1] ?? 'Início';
  return <nav aria-label="Easy Cob" className={styles.navigation}>
    <a href="#conteudo-easy" className={styles.skip}>Pular para o conteúdo</a>
    <Link href={base} aria-current={segment === null ? 'page' : undefined} className={styles.home}>Easy Cob</Link>
    <button className={styles.menuToggle} aria-expanded={open} aria-controls="easy-destinos"
      onClick={() => setOpen(!open)}>Menu · {current}<ChevronDown size={16} aria-hidden="true" /></button>
    <div id="easy-destinos" className={styles.destinations} data-open={open}>
      {sections.map(([path, label]) => <Link key={path} href={base + '/' + path}
        aria-current={segment === path ? 'location' : undefined}>{label}</Link>)}
      <Link href="/app"><ArrowLeft size={15} aria-hidden="true" />Voltar ao GKLI</Link>
    </div>
  </nav>;
}
