import 'server-only';
import { gerarAssinaturaCaptacao, verificarAssinaturaCaptacao } from './captacao-assinatura';
import { createClient } from '@/utils/supabase/server';
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras';
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope';
import { getCondominioAgenteStatus, getCondominiosAgenteStatus } from '@/features/agente-automatico/queries';

export async function listarCondominiosEasy(scope: CarteiraScope, exigirCnpj = true) {
  const db=await createClient(); const rows: {id:string; nome:string; cnpj:string; carteira_id:string}[]=[];
  for(let offset=0;;offset+=500) {
    let query=db.from('condominios').select('id,nome,cnpj,carteira_id').eq('status','ativo');
    if(exigirCnpj)query=query.not('cnpj','is',null);
    const {data,error}=await applyCarteiraScope(query,scope.carteiraIds).order('nome').order('id').range(offset,offset+499);
    if(error) throw new Error('Não foi possível consultar os condomínios.');
    rows.push(...data); if(data.length<500) break;
  }
  const agents=await getCondominiosAgenteStatus(rows.map(row=>row.id),scope.carteiraIds);
  if([...agents.values()].includes('indisponivel')) throw new Error('Não foi possível conferir os agentes remotos. Tente novamente.');
  return rows.filter(row=>agents.get(row.id)==='nao_configurado' && (!exigirCnpj || row.cnpj?.replace(/\D/g,'').length===14));
}
export async function carregarCondominioEasy(id:string) {
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor','operador'].includes(scope.perfil)) throw new Error('Perfil sem permissão para captar cobranças.');
  const db=await createClient();
  const {data,error}=await applyCarteiraScope(db.from('condominios').select('id,nome,nome_operacional,cnpj,carteira_id,status').eq('id',id),scope.carteiraIds).maybeSingle();
  if(error||!data||data.status!=='ativo') throw new Error('Condomínio indisponível para este usuário.');
  if(await getCondominioAgenteStatus(id,scope.carteiraIds)!=='nao_configurado') throw new Error('Este condomínio não está disponível para captação manual. Consulte o Maestro.');
  if(!data.cnpj||data.cnpj.replace(/\D/g,'').length!==14) throw new Error('Complete o CNPJ no cadastro do condomínio antes de captar.');
  return {condominio:data,scope};
}

export function assinaturaCaptacao(conversaoId:string,condominioId:string,carteiraId:string,preview:Record<string,unknown>) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('Captação indisponível: configuração do servidor ausente.');
  return gerarAssinaturaCaptacao(key,conversaoId,condominioId,carteiraId,preview);
}
export function conferirAssinaturaCaptacao(id:string,condominioId:string,carteiraId:string,preview:Record<string,unknown>,userId:string) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('Configuração do servidor ausente.');
  verificarAssinaturaCaptacao(key,id,condominioId,carteiraId,preview,userId);
}
