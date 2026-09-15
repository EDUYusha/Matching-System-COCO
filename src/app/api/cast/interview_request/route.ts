import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: GET /cast/interview_request */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const accessRequest = await prisma.accessRequest.findUnique({ where: { userId: user.id } });
  return { alreadyRequested: !!accessRequest?.uploadedPicture, interview: accessRequest?.interview ?? false };
});
