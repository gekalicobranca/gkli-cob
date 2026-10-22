import InstallmentsListPage from '@/features/acordos/components/installments-list-page'

export default function Page(props: Omit<Parameters<typeof InstallmentsListPage>[0], 'agreementKind'>) {
  return <InstallmentsListPage {...props} agreementKind="extrajudicial" />
}
