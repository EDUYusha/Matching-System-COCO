import { z } from 'zod';
import { isIPv4 } from 'node:net';
import { env } from '@/server/config/env';
/**
 * Shared by the internal-api route handlers: the schemas and query helpers
 * the original internal-api.ts declared once and used from several actions.
 */

/**
 * Port of the InternalApi controllers — the endpoints the CakePHP admin and its
 * cron jobs call to drive orders, grant credits and manage blocks.
 *
 * Access control is by source address, as in
 * InternalApi::BaseController#must_be_local_request: localhost plus the CIDR
 * ranges in RAILS_LOCAL_ZONE.
 */

export function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!isIPv4(ip) || !isIPv4(range) || !Number.isFinite(bits)) return false;

  const toInt = (value: string) =>
    value.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}

/** InternalApi::BaseController#internal_api_allowed? */
export function internalApiAllowed(remoteIp: string | undefined): boolean {
  if (!remoteIp) return false;
  const ip = remoteIp.replace(/^::ffff:/, '');
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ipInCidr(ip, '127.0.0.0/8')) return true;
  return env.localZones.some((zone) => {
    try {
      return ipInCidr(ip, zone);
    } catch {
      return false;
    }
  });
}

export const meetingParamsSchema = z.object({
  category: z.enum(['general', 'individual']).optional(),
  description: z.string().optional().nullable(),
  needed_person_count: z.coerce.number(),
  operator_message: z.string().optional().nullable(),
  status: z.string(),
  owner_id: z.coerce.number(),
  area_id: z.coerce.number(),
  area_name: z.string().optional().nullable(),
  cast_rank_id: z.coerce.number().optional().nullable(),
  request_start_time: z.string().optional().nullable(),
  request_end_time: z.string().optional().nullable(),
  planned_start_time: z.string(),
  planned_end_time: z.string(),
  base_cost_per_time: z.coerce.number().optional().nullable(),
  prolong_cost_per_time: z.coerce.number().optional().nullable(),
  calculation_settings: z.record(z.unknown()).optional(),
  preferences: z.array(z.coerce.number()).optional(),
});
