import { notFound } from 'next/navigation';
import { getGuestJourney } from '@/lib/server/queries/admin/guestJourneys';
import { GuestJourneyDetail } from '@/components/GuestJourneyDetail';
export const dynamic = 'force-dynamic';
export const metadata = { title: '견적 작성 여정 상세' };
export default async function GuestJourneyPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const detail = await getGuestJourney((await params).id, await searchParams);
  if (!detail) notFound();
  return <GuestJourneyDetail detail={detail} />;
}
