import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { EasyNavigation } from '@/components/easy/easy-navigation';
import styles from '@/components/easy/easy.module.css';

export const metadata: Metadata = { title: 'Easy Cob' };

export default function EasyModuleLayout({ children }: { children: ReactNode }) {
  return <div className={`${styles.workspace} h-dvh overflow-y-auto px-4 pt-5 sm:px-6`}>
    <EasyNavigation />
    <main id="conteudo-easy" tabIndex={-1}>{children}</main>
  </div>;
}
