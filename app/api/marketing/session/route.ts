import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { MFA_COOKIE_NAME } from '@/lib/auth/mfa-cookie';

export async function GET(request: Request) {
  const expected = process.env.ADMIN_MARKETING_INTERNAL_TOKEN;
  if (!expected || request.headers.get('x-admin-marketing-token') !== expected) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const { adminUserId, adminId } = await requireAdminPermission('marketing.manage');
  const proof = (await cookies()).get(MFA_COOKIE_NAME)!.value;
  // Bind in-progress marketing OAuth flows to this verified second factor.
  return Response.json({
    id: adminUserId, email: adminId, binding: createHash('sha256').update(proof).digest('hex'),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
