import { Readable } from 'node:stream';
import { z } from 'zod';
import { AN } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { requireUser } from '@/server/auth/session';
import { buildReceiptPdf } from '@/server/services/receipt-pdf';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** FinancialController#receipt — the prawn PDF, split across N people. */
export const GET = route<{ creditConversionId: string }>(
  async (_request, { params: routeParams, searchParams }) => {
    const user = await requireUser();
    const params = z.object({ creditConversionId: z.coerce.number() }).parse(routeParams);
    const options = z
      .object({ person_count: z.coerce.number().optional(), name: z.string().optional() })
      .parse(Object.fromEntries(searchParams.entries()));

    const conversion = await prisma.creditConversion.findUniqueOrThrow({
      where: { id: params.creditConversionId },
    });
    if (user.userType !== 'admin' && conversion.userId !== user.id) {
      throw new ForbiddenError('権利がありません', '/financial/history');
    }

    const companyInfo = await prisma.companyInformation.findFirst({ orderBy: { id: 'asc' } });

    const personCount = options.person_count && options.person_count > 0 ? options.person_count : 1;
    // the original rounds the per-person amount up
    const amount = personCount > 1 ? Math.ceil(conversion.amount / personCount) : conversion.amount;

    let names: string[];
    if (options.name) {
      names = options.name.split(/[、,] ?/);
      if (names.length < personCount) names = [...names, ...Array(personCount - names.length).fill('')];
      else if (names.length > personCount) names = names.slice(0, personCount);
    } else {
      names = Array(personCount).fill('');
    }

    const pdf = buildReceiptPdf({
      conversionId: conversion.id,
      createdAt: conversion.createdAt,
      amount,
      names,
      company: companyInfo,
    });

    // buildReceiptPdf returns a PDFKit document, which is a Readable that has
    // already been ended; hand it to the response as a web stream
    return new Response(Readable.toWeb(pdf as unknown as Readable) as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${AN.Domain}-${conversion.createdAt
          .toISOString()
          .slice(0, 10)}.pdf"`,
      },
    });
  },
);
