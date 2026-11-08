import type { ReactNode } from 'react';
import styles from '@/components/easy/easy.module.css';
export default function EasyLayout({ children }: { children: ReactNode }) {
  return <div className={styles.workspace}>{children}</div>;
}
