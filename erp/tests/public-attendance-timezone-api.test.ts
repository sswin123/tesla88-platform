import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/attendance-timezone', () => ({ getAttendanceTimezone: vi.fn() }));

import { getAttendanceTimezone } from '@/lib/attendance-timezone';
import { GET } from '@/app/api/public/attendance-timezone/route';

beforeEach(() => vi.clearAllMocks());

it('returns the configured attendance timezone, no auth required', async () => {
  vi.mocked(getAttendanceTimezone).mockResolvedValue('Asia/Kuala_Lumpur');
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ timezone: 'Asia/Kuala_Lumpur' });
});
