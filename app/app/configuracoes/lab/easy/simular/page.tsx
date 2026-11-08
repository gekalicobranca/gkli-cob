import { redirect } from 'next/navigation';
import { easyLegacyUrl } from '@/features/easy-cob/legacy';
export default async function LegacyEasy({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(easyLegacyUrl(await searchParams, true));
}