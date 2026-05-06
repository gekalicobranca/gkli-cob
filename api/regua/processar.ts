import { createClient } from '@supabase/supabase-js'

export async function processarRegua() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: cobrancas } = await supabase.from('cobrancas').select('*')

  for (const c of cobrancas || []) {
    // lógica simplificada
    console.log('Processando cobrança', c.id)
  }
}
