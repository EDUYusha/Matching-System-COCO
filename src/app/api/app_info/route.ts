import { AN } from '@/lib';
import { route } from '@/server/http/route';
/** Static copy the login screen shows. */
export const GET = route(async () => ({
  appName: AN.Full,
  appShortName: AN.Short,
  company: AN.Company,
}));
