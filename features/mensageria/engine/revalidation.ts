import { revalidatePath } from 'next/cache'

export function revalidarMensageria(loteId?: string | null) {
  revalidatePath('/app/mensageria')
  revalidatePath('/app/lotes')
  revalidatePath('/app/mensageria/lotes')
  if (loteId) {
    revalidatePath(`/app/lotes/${loteId}`)
    revalidatePath(`/app/mensageria/lotes/${loteId}`)
  }
}
