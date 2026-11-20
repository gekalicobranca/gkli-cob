import {NextRequest, NextResponse} from 'next/server';
import {createAdminClient} from '@/utils/supabase/admin';
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import {applyCarteiraScope} from '@/utils/auth/apply-carteira-scope';
import {requireAuthenticatedApiUser} from '@/app/api/_lib/auth';
import {resultadoCaptacao} from '@/features/easy-cob/contencao';

const headers={'Cache-Control':'private, no-store'};
export async function GET(request:NextRequest) {
  const auth=await requireAuthenticatedApiUser();
  if(auth.response)return auth.response;
  if(!['admin','gestor','operador'].includes(auth.profile.role)) {
    return NextResponse.json({ok:false,error:'Perfil sem permissão.'},{status:403,headers});
  }
  const id=request.nextUrl.searchParams.get('conversaoId')??'';
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ok:false,error:'Informe um identificador de captação válido.'},{status:400,headers});
  }
  try {
    const scope=await getPermittedCarteiras();
    // Escopo E proprietário aplicados antes de retornar qualquer diagnóstico.
    const {data,error}=await applyCarteiraScope(createAdminClient().from('conversoes_relatorio')
      .select('id,status,atualizado_em,expirada:preview_json->easyCaptacao->>expiradaEm,protocolo:preview_json->easyCaptacao->substituicao->>protocolo').eq('id',id).eq('origem','easy_captacao')
      .eq('preview_json->easyCaptacao->>operadorId',scope.userId),scope.carteiraIds).maybeSingle();
    if(error)throw Error('lookup_failed');
    if(!data)return NextResponse.json({ok:false,error:'Captação indisponível para este usuário.'},{status:404,headers});
    let resultadoPersistido:Record<string,any>|null=null;
    if(data.protocolo==='2') {
      const receipt=await applyCarteiraScope(createAdminClient().from('easy_captacao_resultados').select('resultado')
        .eq('conversao_id',id).eq('operador_id',scope.userId),scope.carteiraIds).maybeSingle();
      if(receipt.error)throw Error('receipt_lookup_failed');
      resultadoPersistido=receipt.data?.resultado??null;
    }
    const confirmado=resultadoPersistido!==null;
    const estado=confirmado?(resultadoPersistido.resumo.inconsistencias.length?'concluido_com_alertas':'concluido'):data.expirada ? 'expirada' : data.status;
    const classificacao=estado==='expirada'?'expirada':confirmado?'confirmado':data.protocolo==='2'&&['concluido','concluido_com_alertas'].includes(data.status)?'requer_conferencia':resultadoCaptacao(data.status);
    return NextResponse.json({ok:true,execucao:{id:data.id,status:estado,
      atualizadaEm:data.atualizado_em,resultado:classificacao,
      ...(resultadoPersistido?{resumo:resultadoPersistido.resumo}:{} )}},{headers});
  } catch {
    return NextResponse.json({ok:false,error:'Não foi possível consultar o resultado. Não repita a confirmação.'},{status:503,headers});
  }
}
