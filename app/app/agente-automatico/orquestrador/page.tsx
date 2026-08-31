import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function MaestroRedirect() {
  redirect('/app/agente-automatico/maestro')
}
