import type { Viewport } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/server/lib/prisma';
import { currentUser } from '@/server/auth/session';
import { LandingPage, type LandingData } from '@/components/screens/landing/LandingPage';

export const dynamic = 'force-dynamic';

// the landing page is dark, so the phone's browser chrome should be too
export const viewport: Viewport = { themeColor: '#111113' };

/**
 * `root to: 'sessions#new'`, now the public landing page.
 *
 * Signed in it lands where SessionsController#login_preparations sent people:
 * cast to the order board, everyone else to the home feed. Signed out it shows
 * the landing page; the login form moved to /login, and an old bounce link that
 * still carries `prev_page` is forwarded there.
 */
export default async function IndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (user) redirect(user.userType === 'cast' ? '/meetings' : '/home');

  const { prev_page: prevPage } = await searchParams;
  if (typeof prevPage === 'string') redirect(`/login?prev_page=${encodeURIComponent(prevPage)}`);

  return <LandingPage data={await loadLandingData()} />;
}

/** The prices and areas the order form offers, so the page quotes what the app charges. */
async function loadLandingData(): Promise<LandingData> {
  const [businessAreas, fees] = await Promise.all([
    prisma.businessArea.findMany({
      where: { active: true },
      orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }],
      include: {
        areas: { orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }] },
        // a proposed-price type is a floor the guest bids above, not a price to quote
        castRanks: { where: { proposedPrice: false }, orderBy: [{ baseCostPerTime: 'asc' }, { id: 'asc' }] },
      },
    }),
    prisma.user.aggregate({
      where: { userType: 'cast', discardedAt: null, orderFeePerTime: { not: null } },
      _min: { orderFeePerTime: true },
      _max: { orderFeePerTime: true },
    }),
  ]);

  return {
    areas: businessAreas.map((businessArea) => ({
      id: businessArea.id,
      name: businessArea.name,
      subAreas: businessArea.areas.filter((area) => !area.custom).map((area) => area.name),
      acceptsOtherPlaces: businessArea.areas.some((area) => area.custom),
      ranks: businessArea.castRanks.map((rank) => ({
        id: rank.id,
        name: rank.name,
        baseCostPerTime: rank.baseCostPerTime,
        prolongCostPerTime: rank.prolongCostPerTime,
        fixedPrice: rank.fixedPrice,
      })),
    })),
    individualFee:
      fees._min.orderFeePerTime !== null && fees._max.orderFeePerTime !== null
        ? { min: fees._min.orderFeePerTime, max: fees._max.orderFeePerTime }
        : null,
  };
}
