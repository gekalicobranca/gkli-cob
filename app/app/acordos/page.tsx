import AgreementListPage from '@/features/acordos/components/agreement-list-page'

export default function Page(props: Omit<Parameters<typeof AgreementListPage>[0], 'agreementKind'>) {
  return <AgreementListPage {...props} agreementKind="extrajudicial" />
}
