import Link from 'next/link';
import { ArrowRight, Bot, Handshake, FileUp, ReceiptText, ScanLine, Sparkles, Workflow } from 'lucide-react';
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras';
import styles from '@/components/easy/easy.module.css';
export default async function EasyModulePage() {
  await getPermittedCarteiras();
  return <div className={styles.container}><header className={styles.hero}>
    <span className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" />Easy Cob</span><h1>Sua operação, em poucos passos.</h1><p>Escolha por onde começar. Cada tarefa tem uma trilha simples até a confirmação.</p>
  </header><div className={`${styles.grid} ${styles.moduleGrid}`}>{[
    { title:'Acordos', text:'Consulte, simule, cancele e efetive acordos.', href:'/app/configuracoes/easy/acordos', icon:Handshake, tone:styles.blue },
    { title:'Easy Cap', text:'Atualize a inadimplência dos condomínios sem agente remoto usando o relatório da administradora ou a planilha modelo.', href:'/app/configuracoes/easy/captacao', icon:FileUp, tone:styles.green },
    { title:'Easy Flow', text:'Escolha a régua e a conta SMTP, monte os flows e libere para a agenda.', href:'/app/configuracoes/easy/flow', icon:Workflow, tone:styles.blue },
    { title:'Easy Pag', text:'Consulte pagamentos de parcelas de acordos por administradora ou gere uma planilha para conferência.', href:'/app/configuracoes/easy/pag', icon:ReceiptText, tone:styles.violet },
    { title:'Easy Maestro', text:'Capte a inadimplência automaticamente por administradora e acompanhe a atualização das cobranças.', href:'/app/configuracoes/easy/maestro', icon:Bot, tone:styles.green },
    { title:'Espelhar', text:'Prepare o prompt para conciliar cotas, acordos, baixas e repasses por administradora ou condomínio.', href:'/app/configuracoes/easy/espelhar', icon:ScanLine, tone:styles.violet },
  ].map(item=><Link key={item.href} href={item.href} className={`${styles.card} ${item.tone}`}><span className={styles.icon}><item.icon size={23} aria-hidden="true" /></span><div><h2>{item.title}</h2><p className="mt-2">{item.text}</p></div><span className={styles.cardFooter}>Começar<ArrowRight size={18} aria-hidden="true" /></span></Link>)}</div></div>;
}
