import { AVISO_VALIDADE_PROPOSTA } from '../agentes-virtuais/validade-proposta'
import { AGENTES_VIRTUAIS, type AgenteVirtualId } from '../agentes-virtuais/perfis'
import { createHash } from 'node:crypto'
import { montarPropostaKeila } from './acordos'

export type CotaFonte = { vencimento: string; valor: number; linha: number; recibo?:string; planilha?:string; linha_planilha?:number }
export type CotaCadastro = { id: string; vencimento: string; valor_atualizado?: number | string | null; status_operacional?: string | null; status_financeiro?: string | null; duplicada_de_id?: string | null; observacoes?: string | null }
export type RegrasConferencia = { custo_emissao_boleto?: number | null; dias_apos_vencimento_regua: number; despesas_acordo_avista_percentual: number | null; despesas_acordo_parcelado_percentual: number | null; parcelas_acordo_sem_aprovacao_sindico: number | null }
export function hashConferencia(value: unknown): string {
 const canonico = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonico).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico((v as Record<string,unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
 return createHash('sha256').update(canonico(value)).digest('hex')
}
export function incluirAcolhimentoProposta(texto:string,acolhimento?:'desculpas_whatsapp_sem_retorno'){
 return acolhimento==='desculpas_whatsapp_sem_retorno'?texto.replace('\n\n','\n\nPedimos desculpas pela falta de retorno à sua tentativa de contato pelo WhatsApp.\n\n'):texto
}
/** Varre a planilha inteira: a Lello repete o cabeçalho da unidade a cada cota. */
export function extrairCotasLello(rows: unknown[][], codigo: string): CotaFonte[] {
 const cotas: CotaFonte[] = []
 for (let inicio = 0; inicio < rows.length; inicio++) {
  const header = rows[inicio].map(String)
  if (!header.includes('Unidade') || !header.includes(codigo)) continue
  let fim = inicio + 1
  while (fim < rows.length && !rows[fim].includes('Unidade')) fim++
  for (let i = inicio + 1; i < fim; i++) {
   const data = String(rows[i][8] ?? '')
   if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) continue
   const vencimento = data.split('/').reverse().join('-')
   const valor = typeof rows[i][21] === 'number' ? rows[i][21] as number : Number(String(rows[i][21]).replace(/\./g, '').replace(',', '.'))
   if (!Number.isFinite(valor) || valor <= 0 || new Date(`${vencimento}T12:00:00Z`).toISOString().slice(0,10) !== vencimento) throw new Error(`Cota inválida na linha ${i+1}. Revisão necessária.`)
   for (let j=i+1;j<fim;j++) {
    const rubrica=String(rows[j][14]??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
    if (/MULTA.*INFRAC/.test(rubrica) && Number(String(rows[j][17]??'').replace(/\./g,'').replace(',','.'))!==0) throw new Error(`Multa por infração na fonte, linha ${j+1}. Revisão necessária.`)
   }
   cotas.push({ vencimento, valor, linha: i+1 })
  }
 }
 if (!cotas.length) throw new Error('Unidade sem cotas identificáveis no relatório Lello. Conferência necessária.')
 // Pré-2026 permanece integralmente na evidência e é excluído do cálculo.
 // Repetições desse grupo suspenso não podem bloquear as cotas elegíveis.
 const negociaveis=cotas.filter(c=>c.vencimento>='2026-01-01')
 if (new Set(negociaveis.map(c => c.vencimento)).size !== negociaveis.length) throw new Error('Mais de uma cota no mesmo vencimento. Concilie os recibos antes de propor.')
 return cotas.sort((a,b) => a.vencimento.localeCompare(b.vencimento))
}
export function conferirProposta(cotas: CotaFonte[], cadastro: CotaCadastro[], regras: RegrasConferencia, quantidade: number, vencimento: string, hoje = new Date(), politica: {suspenderAntesDe:string|null} = {suspenderAntesDe:'2026-01-01'}) {
 if (!Number.isFinite(regras.dias_apos_vencimento_regua) || regras.dias_apos_vencimento_regua < 0 ||
  ![regras.despesas_acordo_avista_percentual,regras.despesas_acordo_parcelado_percentual].every(v=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=100) ||
  !Number.isInteger(regras.parcelas_acordo_sem_aprovacao_sindico) || (regras.parcelas_acordo_sem_aprovacao_sindico??0)<1) throw new Error('Regras do condomínio incompletas ou inválidas. Conferência necessária.')
 const dia = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(hoje)
 const excluidas: (CotaFonte & { motivo: string })[] = []
 const incluidas: (CotaFonte & { cobranca_id: string })[] = []
 const snapshot: (CotaCadastro & {valor_atualizado: number})[] = []
 const divergencias: {vencimento:string;cadastro:number;fonte:number;motivo:string}[] = []
 for (const cota of cotas) {
  const atraso = Math.round((Date.parse(`${dia}T12:00:00Z`)-Date.parse(`${cota.vencimento}T12:00:00Z`))/86400000)
  if (politica.suspenderAntesDe && cota.vencimento < politica.suspenderAntesDe) { excluidas.push({...cota,motivo:'Anterior a 2026 — suspensa'}); continue }
  if (atraso < regras.dias_apos_vencimento_regua) { excluidas.push({...cota,motivo:`Fora da régua de ${regras.dias_apos_vencimento_regua} dias`}); continue }
  const correspondentes = cadastro.filter(c => !c.duplicada_de_id && c.vencimento === cota.vencimento)
  if (correspondentes.length !== 1) throw new Error(`Conciliação pendente em ${cota.vencimento}: ${correspondentes.length} cobranças no cadastro para a cota da fonte.`)
  const c = correspondentes[0]
  if(c.valor_atualizado!==null && c.valor_atualizado!==undefined && Math.round(Number(c.valor_atualizado)*100)!==Math.round(cota.valor*100)) divergencias.push({vencimento:cota.vencimento,cadastro:Number(c.valor_atualizado),fonte:cota.valor,motivo:'Valor da fonte atual difere do cadastro. Usado o relatório somente nesta proposta; cadastro preservado. Conferir antes de aprovar.'})
  // O cálculo puro aplica bloqueios financeiros, judiciais e de natureza da cobrança.
  try { montarPropostaKeila([{...c,valor_atualizado:cota.valor}],regras.dias_apos_vencimento_regua,1,vencimento,hoje,regras) }
  catch { throw new Error(`Cota ${cota.vencimento} consta na fonte, mas está bloqueada ou baixada no cadastro. Revisão necessária.`) }
  incluidas.push({...cota,cobranca_id:c.id}); snapshot.push({...c,valor_atualizado:cota.valor})
 }
 for (const c of cadastro.filter(c=>!c.duplicada_de_id && c.status_financeiro==='em_aberto' && (!politica.suspenderAntesDe || c.vencimento >= politica.suspenderAntesDe))) {
  if (!cotas.some(f=>f.vencimento===c.vencimento)) throw new Error(`Cobrança ${c.vencimento} está aberta no cadastro e ausente da fonte. Concilie antes de propor.`)
 }
 const avista = montarPropostaKeila(snapshot,regras.dias_apos_vencimento_regua,1,vencimento,hoje,regras)
 const parcelado = montarPropostaKeila(snapshot,regras.dias_apos_vencimento_regua,quantidade,vencimento,hoje,regras)
 if (parcelado.exige_aprovacao) throw new Error('Quantidade de parcelas depende de aprovação do condomínio.')
 if (Math.round(parcelado.parcelas.reduce((s,p)=>s+p.valor,0)*100)!==Math.round(parcelado.total*100)) throw new Error('Parcelas não fecham com o total.')
 const cotasBloqueioGarantidora=cadastro.filter(c=>!c.duplicada_de_id&&c.status_operacional==='suspenso'&&/bloqueio.*garantidora/i.test(c.observacoes??'')).map(c=>c.vencimento).sort()
 return { incluidas, excluidas, divergencias, regras, avista, parcelado,...(cotasBloqueioGarantidora.length?{cotas_bloqueio_garantidora:cotasBloqueioGarantidora}:{}) }
}
export function renderizarPropostaConferida(nome: string, unidade: string, condominio: string, dataFonte: string, plano: ReturnType<typeof conferirProposta>, orientacao?:{parcelamento_solicitado:true;segunda_via_vencimento?:string;administradora:string}, politica?:{historica?:boolean;agenteId?:AgenteVirtualId}) {
 const texto=renderizarPropostaSemValidade(nome,unidade,condominio,dataFonte,plano,orientacao)
 if(politica?.historica)return texto
 const agente=AGENTES_VIRTUAIS[politica?.agenteId??'keila']
 return texto.replace('Keila | GEKALI',`${AVISO_VALIDADE_PROPOSTA}\n\n${agente.nome} | ${agente.marca}`)
}
function renderizarPropostaSemValidade(nome: string, unidade: string, condominio: string, dataFonte: string, plano: ReturnType<typeof conferirProposta>, orientacao?:{parcelamento_solicitado:true;segunda_via_vencimento?:string;administradora:string}) {
 const moeda=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
 const data=(d:string)=>d.split('-').reverse().join('/')
 const bloqueadas=new Set(plano.cotas_bloqueio_garantidora??[])
 const excluidasResposta=plano.excluidas.filter(c=>!bloqueadas.has(c.vencimento))
 const observacaoGarantidora=bloqueadas.size?'Observação: há cotas em bloqueio que devem ser verificadas diretamente com a garantidora. Essas cotas não integram esta proposta.\n\n':''
 if(plano.parcelado.parcelas.length===1)return `Olá, ${nome}.\n\nPara ${unidade}, do ${condominio}, segue a proposta de pagamento à vista das cotas abaixo, conferidas no relatório da administradora de ${data(dataFonte)}:\n\n${plano.incluidas.map(c=>`• Cota com vencimento em ${data(c.vencimento)}: ${moeda(c.valor)}.`).join('\n')}\nTotal atualizado das cotas: ${moeda(plano.avista.base)}.\nDespesas de cobrança (${plano.avista.percentual}%): ${moeda(plano.avista.despesas)}.\nTotal à vista: ${moeda(plano.avista.total)}${plano.avista.custoBoletos > 0 ? ` (emissão incluída: ${moeda(plano.avista.custoBoletos)})` : ""}.\nVencimento proposto: ${data(plano.avista.parcelas[0].vencimento)}.\n\n${excluidasResposta.length?`Cotas não incluídas nesta proposta:\n${excluidasResposta.map(c=>`• ${data(c.vencimento)}: ${c.motivo}.`).join('\n')}\n\n`:''}${observacaoGarantidora}Você confirma o pagamento nessas condições e no vencimento proposto? Após sua confirmação, o acordo e o boleto serão providenciados junto à administradora.\n\nKeila | GEKALI`
 if(orientacao){
  const meses=plano.parcelado.parcelas.map(p=>new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'}).format(new Date(`${p.vencimento}T12:00:00Z`))).join(' e ')
  if(orientacao.segunda_via_vencimento&&!plano.excluidas.some(c=>c.vencimento===orientacao.segunda_via_vencimento&&c.motivo.startsWith('Fora da régua')))throw new Error('Orientação de segunda via requer cota confirmada fora da régua.')
  const segundaVia=orientacao.segunda_via_vencimento?`Quanto ao boleto com vencimento em ${data(orientacao.segunda_via_vencimento)}, essa cota ainda está fora da régua de cobrança e não integra o parcelamento abaixo. Solicite a segunda via diretamente à ${orientacao.administradora}. Como você relatou a mensagem de boleto sem registro, peça também a confirmação do registro bancário antes de tentar o pagamento.\n\n`:''
  return `Olá, ${nome}.\n\n${segundaVia}Conforme sua solicitação de parcelamento, propomos os pagamentos em ${meses}. A proposta para ${unidade}, do ${condominio}, considera o relatório da administradora de ${data(dataFonte)}:\n\n${plano.incluidas.map(c=>`• Cota com vencimento em ${data(c.vencimento)}: ${moeda(c.valor)}.`).join('\n')}\nTotal atualizado das cotas: ${moeda(plano.parcelado.base)}.\nDespesas de cobrança (${plano.parcelado.percentual}%): ${moeda(plano.parcelado.despesas)}.\nTotal do acordo proposto: ${moeda(plano.parcelado.total)}${plano.parcelado.custoBoletos > 0 ? ` (emissão incluída: ${moeda(plano.parcelado.custoBoletos)})` : ""}.\n\n${plano.parcelado.parcelas.map(p=>`${p.numero}ª parcela: ${moeda(p.valor)}, com vencimento proposto em ${data(p.vencimento)}.`).join('\n')}\n\n${observacaoGarantidora}Você confirma essas condições e os vencimentos propostos? Após sua confirmação, o acordo e os respectivos boletos serão providenciados junto à ${orientacao.administradora}.\n\nKeila | GEKALI`
 }
 return `Olá, ${nome}.\n\nPara ${unidade}, do ${condominio}, o relatório da administradora de ${data(dataFonte)} apresenta as seguintes cotas incluídas na proposta:\n\n${plano.incluidas.map(c=>`• Vencimento ${data(c.vencimento)}: ${moeda(c.valor)}.`).join('\n')}\nTotal atualizado das cotas: ${moeda(plano.avista.base)}.\n\nOpções conforme as regras atuais do condomínio:\n• À vista: ${moeda(plano.avista.total)}${plano.avista.custoBoletos > 0 ? ` (emissão incluída: ${moeda(plano.avista.custoBoletos)})` : ""}, incluindo ${moeda(plano.avista.despesas)} de despesas de cobrança (${plano.avista.percentual}%), vencimento proposto em ${data(plano.avista.parcelas[0].vencimento)}.\n• Em ${plano.parcelado.parcelas.length} parcelas: ${moeda(plano.parcelado.total)}${plano.parcelado.custoBoletos > 0 ? ` (emissão incluída: ${moeda(plano.parcelado.custoBoletos)})` : ""}, incluindo ${moeda(plano.parcelado.despesas)} de despesas de cobrança (${plano.parcelado.percentual}%).\n${plano.parcelado.parcelas.map(p=>`${p.numero}ª parcela: ${moeda(p.valor)}, vencimento proposto em ${data(p.vencimento)}.`).join('\n')}\n\n${excluidasResposta.length ? `Cotas não incluídas nesta proposta:\n${excluidasResposta.map(c=>`• ${data(c.vencimento)}: ${c.motivo}.`).join('\n')}\n\n` : ''}${observacaoGarantidora}Os vencimentos são sugestões e dependem da sua confirmação. Qual opção fica melhor para você? Após a confirmação das condições, o acordo e os boletos serão providenciados junto à administradora.\n\nKeila | GEKALI`
}
export type ConferenciaProposta = { validade_regra?: 'sete_dias_v1'; fonte_formato?:'manager_cadiz_v1'; versao: 1; arquivo_id: string; execucao_id: string; sha256: string; data_fonte: string; quantidade: number; vencimento: string; nome: string; unidade: string; condominio: string; plano: ReturnType<typeof conferirProposta>; texto: string; hash: string; acolhimento?:'desculpas_whatsapp_sem_retorno'; orientacao?:{parcelamento_solicitado:true;segunda_via_vencimento?:string;administradora:string} }
