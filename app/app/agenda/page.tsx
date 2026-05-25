import { redirect } from 'next/navigation'

export default function AgendaRedirectPage() {
  redirect('/app/inbox?visao=agenda')
}
