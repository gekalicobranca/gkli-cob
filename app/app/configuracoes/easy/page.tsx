import Link from 'next/link';
import { ArrowRight, Handshake, FileUp, Sparkles } from 'lucide-react';
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras';
import styles from '@/components/easy/easy.module.css';
export default async function EasyModulePage() {
  await getPermittedCarteiras();
  return <div className={styles.container}><header className={styles.hero}>
    <span className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" />Easy Cob</span><h1>Sua operação, em poucos passos.</h1><p>Escolha por onde começar. Cada tarefa tem uma trilha simples até a confirmação.</p>
  </header><div className={styles.grid}>{[
    { title:'Acordos', text:'Consulte, simule, cancele e efetive acordos.', href:'/app/configuracoes/easy/acordos', icon:Handshake, tone:styles.blue },
    { title:'Captação de inadimplência', text:'Atualize as cobranças dos condomínios sem agente remoto a partir do arquivo da administradora.', href:'/app/configuracoes/easy/captacao', icon:FileUp, tone:styles.green },
  ].map(item=><Link key={item.href} href={item.href} className={`${styles.card} ${item.tone}`}><span className={styles.icon}><item.icon size={23} aria-hidden="true" /></span><div><h2>{item.title}</h2><p className="mt-2">{item.text}</p></div><span className={styles.cardFooter}>Começar<ArrowRight size={18} aria-hidden="true" /></span></Link>)}</div></div>;
}
