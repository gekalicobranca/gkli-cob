import { redirect } from 'next/navigation'

export default function CockpitRedirectPage() {
  redirect('/app/inbox?visao=cockpit')
}
