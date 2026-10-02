import { createClient } from '@supabase/supabase-js'
import { flowBudgetFetch } from '@/lib/jobs/flow-execution'

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variáveis de ambiente administrativas do Supabase não configuradas.')
  }

  const scopedFetch = flowBudgetFetch()
  return createClient(supabaseUrl, serviceRoleKey, {
    ...(scopedFetch ? { global: { fetch: scopedFetch } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
