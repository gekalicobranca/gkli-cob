import 'server-only';
import {planejarEasyFlow} from './flow-server';
import {primeiraEtapaFlow,diasDesdeVencimento,formatDateBR,formatMoneyBR,montarMensagem} from '@/features/regua/engine';
import {carregarApoiosParaCorrespondencia} from '@/features/responsaveis-unidades/correspondencia';
import {resolverCorrespondenciasUnidade} from '@/lib/core/identidade-unidade';
import {escolherContatoRegua} from '@/features/regua/services/regua-shared';
import {criarResolvedorTemplateDaParte} from '@/features/mensageria/template-resolver';
import {avaliarComplianceRegua} from '@/features/regua/services/compliance';
import {verificarSuspensaoRegua} from '@/features/regua/services/suspension';
import {cicloFechamentoCobranca} from '@/features/flows/cobranca/ciclo-fechamento';

// Preparação somente leitura. Nenhum lote, score, promoção ou mensagem existe
// até a RPC aceitar o snapshot e materializar a parte inteira numa transação.
export async function prepararParteEasy(run:any,indice:number) {
  const p=await planejarEasyFlow(run.condominio_id,run.regua_id,run.smtp_config_id??'');
  const ids:string[]=run.plano[indice];
  if(!ids?.length||p.configVersion!==run.config_version||ids.some(id=>p.versoes[id]!==run.versoes[id]))
    throw Error('As cobranças, contatos ou régua mudaram. Consulte o andamento antes de continuar.');
  const etapa=primeiraEtapaFlow(p.regua.etapas??[]);
  if(!etapa||!['email','whatsapp'].includes(etapa.canal))throw Error('A régua precisa de uma primeira etapa válida.');
  const apoios=await carregarApoiosParaCorrespondencia(p.db,[p.c.id]);
  const grupos=new Map<string,{rows:any[];contato:ReturnType<typeof escolherContatoRegua>}>();
  for(const row of p.aptas.filter(r=>ids.includes(r.id))){
    const unidade=Array.isArray(row.unidade)?row.unidade[0]:row.unidade;
    const contatos=resolverCorrespondenciasUnidade({...unidade,condominio_id:p.c.id},apoios).correspondencias;
    const contato=escolherContatoRegua({unidade,apoios:contatos,canal:etapa.canal,preferencia:p.regua.destinatario_preferencial});
    if(!contato.destinatario)throw Error('Uma cobrança ficou sem destinatário.');
    const suspensao=await verificarSuspensaoRegua({carteiraId:p.c.carteira_id,condominioId:p.c.id,unidadeId:row.unidade_id,cobrancaId:row.id});
    if(suspensao.pausada)throw Error('Uma cobrança possui suspensão da régua. Revise antes de montar.');
    const compliance=await avaliarComplianceRegua({prepararParaAgenda:true,carteiraId:p.c.carteira_id,condominioId:p.c.id,unidadeId:row.unidade_id,cobrancaId:row.id,destinatario:contato.destinatario,canal:etapa.canal});
    if(!compliance.permitido)throw Error('Uma cobrança foi bloqueada pelas regras de comunicação. Revise antes de montar.');
    const key=`${row.unidade_id}|${contato.destinatario.trim().toLowerCase()}`;
    const grupo=grupos.get(key)??{rows:[],contato};grupo.rows.push(row);grupos.set(key,grupo);
  }
  const resolver=criarResolvedorTemplateDaParte();
  const mensagens=[];
  for(const {rows,contato} of grupos.values()){
    rows.sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.id.localeCompare(b.id));
    const row=rows[0],unidade=Array.isArray(row.unidade)?row.unidade[0]:row.unidade;
    const carteira=Array.isArray(p.c.carteira)?p.c.carteira[0]:p.c.carteira;
    const valor=rows.reduce((sum,r)=>sum+Math.round(Number(r.valor_atualizado)*100),0)/100;
    if(!Number.isFinite(valor)||valor<=0)throw Error('Valor inválido para a montagem.');
    const contexto={carteira:carteira?.nome??'',nome_carteira:carteira?.nome??'',responsavel:contato.nome,nome:contato.nome,primeiro_nome:contato.nome.split(' ')[0],unidade:unidade.identificacao,condominio:p.c.nome_operacional||p.c.nome,competencia:[...new Set(rows.map(r=>r.competencia).filter(Boolean))].join(', '),vencimento:[...new Set(rows.map(r=>formatDateBR(r.vencimento)))].join(', '),valor:formatMoneyBR(valor),valor_total:formatMoneyBR(valor),dias_atraso:diasDesdeVencimento(row.vencimento)};
    const template=await resolver({carteiraId:p.c.carteira_id,tipoRegua:'cobranca',categoria:etapa.categoria_template,intensidade:etapa.tom,canal:etapa.canal,templateId:etapa.template_id,fallbackText:etapa.template,variables:contexto});
    mensagens.push({cobranca_ids:rows.map(r=>r.id),canal:etapa.canal,destinatario:contato.destinatario,conteudo:template.renderizado||montarMensagem({tipo:'cobranca',etapa,contexto}),template_id:template.templateId,etapa_id:etapa.id,payload:{origem:'regua_cobranca',etapa_id:etapa.id,ciclo:cicloFechamentoCobranca(p.c.vencimento_cota_dia??null)??new Date().toISOString().slice(0,7),contexto,template_resolvido:template,dias_atraso:contexto.dias_atraso,inicio_cobranca_dias:p.c.dias_apos_vencimento_regua??p.c.inicio_cobranca_dias??30,destinatario_regua:contato,cobranca_ids:rows.map(r=>r.id),total_cobrancas:rows.length,whatsapp_template_nome:(etapa as any).whatsapp_template_nome??null,whatsapp_template_idioma:(etapa as any).whatsapp_template_idioma??'pt_BR',whatsapp_template_parametros:(etapa as any).whatsapp_template_parametros??[]}});
  }
  if(!mensagens.length||mensagens.length>20)throw Error('Esta parte precisa gerar entre 1 e 20 mensagens.');
  return {mensagens};
}
