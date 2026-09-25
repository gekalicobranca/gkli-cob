'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/utils/auth/require-role';
import { createClient } from '@/utils/supabase/server';

export async function decidirAprovacaoForaRegua(formData: FormData) {
  await requireRole(['admin', 'gestor']);
  const supabase = await createClient();
  const { error } = await supabase.rpc('decidir_aprovacao_acordo_fora_regua', {
    p_id: String(formData.get('aprovacao_id') ?? ''),
    p_decisao: String(formData.get('decisao') ?? ''),
    p_justificativa: String(formData.get('justificativa') ?? '').trim(),
  });
  if (error) throw new Error(`Não foi possível registrar a decisão: ${error.message}`);
  revalidatePath('/app/pendencias');
  revalidatePath('/app/inbox');
  revalidatePath('/app/acordos/novo');
}
