import { AN } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: GET /help/company */
export const GET = route(async (_request) => {
  const info = await prisma.companyInformation.findFirst({ orderBy: { id: 'asc' } });
  return {
    appName: AN.Full,
    appShortName: AN.Short,
    company: info?.name ?? AN.Company,
    address: info?.address ?? AN.Address,
    building: info?.building ?? null,
    zipCode: info?.zipCode ?? null,
    phone: info?.phone ?? AN.ContactTel,
    personInCharge: info?.personInCharge ?? AN.PersonInCharge,
    contactMail: AN.ContactMail,
    domain: AN.Domain,
  };
});
