import { z } from 'zod';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { Prisma } from '@prisma/client';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: GET /meeting_places */
export const GET = route(async (_request, { searchParams }) => {
  await requireUser();
  const query = z
    .object({
      meeting_id: z.coerce.number().optional(),
      business_area_id: z.coerce.number().optional(),
      area_id: z.coerce.number().optional(),
      tag_ids: z.union([z.array(z.coerce.number()), z.coerce.number()]).optional(),
      page: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));

  if (!config.meeting_places_functionality) {
    return { ...paginate([], 0, 1, 5), businessAreas: [], areas: [], tags: [] };
  }

  const meeting = query.meeting_id
    ? await prisma.meeting.findUnique({ where: { id: query.meeting_id }, select: { areaId: true } })
    : null;

  const [businessAreas, areas, tags] = await Promise.all([
    prisma.businessArea.findMany({ where: { active: true }, orderBy: { sortIndex: 'asc' } }),
    prisma.area.findMany({
      where: { custom: false, ...(query.business_area_id ? { businessAreaId: query.business_area_id } : {}) },
      orderBy: { sortIndex: 'asc' },
    }),
    prisma.meetingPlaceTag.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ]);

  const tagIds = query.tag_ids === undefined ? [] : Array.isArray(query.tag_ids) ? query.tag_ids : [query.tag_ids];

  const where: Prisma.MeetingPlaceWhereInput = {
    ...(meeting || query.area_id
      ? { areaId: meeting?.areaId ?? query.area_id }
      : query.business_area_id
        ? { areaId: { in: areas.map((area) => area.id) } }
        : {}),
    ...(tagIds.length ? { tags: { some: { meetingPlaceTagId: { in: tagIds } } } } : {}),
  };

  const page = query.page ?? 1;
  const [places, totalCount] = await Promise.all([
    prisma.meetingPlace.findMany({
      where,
      include: { tags: { include: { tag: true } }, area: true },
      orderBy: { sortIndex: 'asc' },
      ...paginationArgs(page, 5),
    }),
    prisma.meetingPlace.count({ where }),
  ]);

  return {
    ...paginate(
      places.map((place) => ({
        id: place.id,
        name: place.name,
        url: place.url,
        phone: place.phone,
        address: place.address,
        description: place.description,
        imageUrls: Array.isArray(place.imageUrls) ? (place.imageUrls as string[]) : [],
        areaId: place.areaId,
        areaName: place.area.name,
        tags: place.tags.map((link) => ({ id: link.tag.id, name: link.tag.name })),
      })),
      totalCount,
      page,
      5,
    ),
    businessAreas: businessAreas.map((area) => ({ id: area.id, name: area.name, color: area.color })),
    areas: areas.map((area) => ({ id: area.id, name: area.name, businessAreaId: area.businessAreaId })),
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
  };
});
