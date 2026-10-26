import {createClient} from '@/utils/supabase/server';
import {applyCarteiraScope} from '@/utils/auth/apply-carteira-scope';
import type {CarteiraScope} from '@/utils/auth/get-permitted-carteiras';

// IDs únicos: encontrar por unidade participante nunca multiplica acordos ou parcelas.
export async function acordoIdsDaUnidade(unidadeId: string, scope: CarteiraScope): Promise<string[]> {
  const db = await createClient();
  if (scope.carteiraIds?.length === 0) return [];
  let composicao = db.from('acordo_cobrancas').select('id,acordo_id,cobrancas!inner(unidade_id,carteira_id)')
    .eq('cobrancas.unidade_id',unidadeId);
  if (scope.carteiraIds) composicao = composicao.in('cobrancas.carteira_id',scope.carteiraIds);
  async function carregar(query: any, coluna: string) {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const {data,error} = await query.order('id').range(offset,offset+499);
      if (error) throw new Error(`Erro ao consultar unidades do acordo: ${error.message}`);
      ids.push(...(data ?? []).map((r:any) => r[coluna]));
      if (!data || data.length < 500) return ids;
    }
  }
  const [titulares, participantes, legados] = await Promise.all([
    carregar(applyCarteiraScope(db.from('acordos').select('id').eq('unidade_id',unidadeId),scope.carteiraIds),'id'),
    carregar(composicao, 'acordo_id'),
    carregar(applyCarteiraScope(db.from('acordos').select('id,cobrancas!inner(unidade_id)')
      .eq('cobrancas.unidade_id',unidadeId),scope.carteiraIds),'id'),
  ]);
  return [...new Set([...titulares,...participantes,...legados])];
}
