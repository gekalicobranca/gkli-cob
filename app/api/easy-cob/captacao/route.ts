import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth';
import { carregarCondominioEasy, assinaturaCaptacao } from '@/features/easy-cob/captacao-server';
import { validarPreviaCaptacao, dataCaptacaoISO } from '@/features/easy-cob/captacao-preview';
import { parseRelatorioBuffer } from '@/features/conversao-relatorio/server/parse-relatorio-buffer';
import { decodeConversionUpload } from '@/features/conversao-relatorio/server/decode-upload';
import { MAX_SERVER_UPLOAD_BYTES } from '@/features/conversao-relatorio/upload-limits';
import { autoMatchCondominio } from '@/features/conversao-relatorio/condominio-match';
import { lerPlanilhaManualEasy } from '@/features/easy-cob/planilha-manual';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  const auth=await requireAuthenticatedApiUser(); if(auth.response) return auth.response;
  if(!['admin','gestor','operador'].includes(auth.profile.role)) return NextResponse.json({ok:false,error:'Perfil sem permissão para captar cobranças.'},{status:403});
  try {
    const form=await request.formData();
    const {condominio}=await carregarCondominioEasy(String(form.get('condominio_id')??''));
    const file=form.get('file');
    if(!(file instanceof File)||!file.size||file.size>MAX_SERVER_UPLOAD_BYTES) throw new Error('Escolha um arquivo válido de até 32 MB (4 MB após compactação).');
    if(!/\.(pdf|xlsx?|csv|html?)$/i.test(file.name)) throw new Error('Envie PDF pesquisável, XLS, XLSX, CSV ou HTML.');
    const encoding=String(form.get('file_encoding')??'');
    const bytes=decodeConversionUpload(Buffer.from(await file.arrayBuffer()),encoding);
    const parsed=form.get('modelo')==='easy_flow_v1'
      ? {ok:true as const,preview:lerPlanilhaManualEasy(bytes,file.name,condominio,{exigirContato:form.get('contexto')==='easy_flow'})}
      : await parseRelatorioBuffer({buffer:bytes,filename:file.name,mimeType:encoding?String(form.get('original_mime_type')??''):file.type,condominioCnpj:condominio.cnpj,tipoConversao:'cobrancas',somenteAnoCorrente:false});
    if(parsed.ok === false) throw new Error(parsed.error);
    const stats=validarPreviaCaptacao(parsed.preview);
    const acordos=parsed.preview.cobrancas.filter(item=>['acordo','acordo_extrajudicial','acordo_judicial'].includes(item.situacaoOrigem??'')).length;
    const juridicas=parsed.preview.cobrancas.filter(item=>item.situacaoOrigem==='juridico').length;
    const detected=parsed.preview.padraoDetectado?.condominioDetectado;
    if(detected&&!autoMatchCondominio([{id:condominio.id,nome:condominio.nome,nomeOperacional:condominio.nome_operacional,cnpj:condominio.cnpj}],detected)) throw new Error('O condomínio identificado no arquivo não corresponde ao selecionado. Confira o documento.');
    const admin=createAdminClient();
    const {data:snapshot,error:se}=await admin.rpc('easy_captacao_snapshot',{p_condominio:condominio.id,p_carteira:condominio.carteira_id});
    if(se) throw new Error('Não foi possível conferir as cobranças atuais. Tente novamente.');
    const conversaoId=randomUUID();
    const source={...parsed.preview}; delete source.csv; delete source.xlsxBase64;
    const preview={...source,easyCaptacao:{operadorId:auth.user.id,arquivoSha256:createHash('sha256').update(bytes).digest('hex'),substituicao:snapshot,assinatura:''}};
    preview.easyCaptacao.assinatura=assinaturaCaptacao(conversaoId,condominio.id,condominio.carteira_id,preview);
    const {error}=await admin.from('conversoes_relatorio').insert({id:conversaoId,origem:'easy_captacao',condominio_id:condominio.id,carteira_id:condominio.carteira_id,nome_arquivo:file.name,status:'preview',total_cobrancas:stats.cobrancas,total_parcelas:source.totalParcelas,valor_total:stats.valor,preview_json:preview,inconsistencias_json:source.inconsistencias});
    if(error) throw new Error('Não foi possível guardar a prévia. Nenhuma cobrança foi substituída.');
    return NextResponse.json({ok:true,resumo:{conversaoId,condominioId:condominio.id,carteiraId:condominio.carteira_id,condominio:condominio.nome,arquivo:file.name,...stats,acordos,juridicas,substituir:snapshot.quantidade,ano:snapshot.ano,origem:source.origem,avisos:[...source.inconsistencias,...(!detected?['O arquivo não identifica o condomínio pelo nome. Confira a origem antes de confirmar.']:[])],amostra:source.cobrancas.slice(0,8).map(item=>({unidade:item.unidade,bloco:item.bloco,vencimento:dataCaptacaoISO(item.vencimento??item.vencimentoMaisAntigo??item.parcelas?.[0]?.vencimento),valor:item.valorTotal}))}});
  } catch(error) { return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Não foi possível ler o arquivo.'},{status:400}); }
}
