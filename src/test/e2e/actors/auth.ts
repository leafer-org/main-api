import { expect } from 'vitest';

import { ADMIN_PHONE } from '../helpers/db.js';
import { type E2eApp } from '../helpers/create-app.js';

export async function loginAsAdmin(agent: E2eApp['agent'], otp: string) {
  const phone = `+${ADMIN_PHONE}`;

  await agent.post('/auth/request-otp').send({ phoneNumber: phone }).expect(200);

  const res = await agent
    .post('/auth/verify-otp')
    .send({ phoneNumber: phone, code: otp })
    .expect(200);

  expect(res.body.type).toBe('authenticated');

  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export async function registerUser(
  agent: E2eApp['agent'],
  otp: string,
  options?: { phone?: string; fullName?: string },
) {
  const phone = options?.phone ?? '+79990000002';
  const fullName = options?.fullName ?? 'Test User';

  await agent.post('/auth/request-otp').send({ phoneNumber: phone }).expect(200);

  const verifyRes = await agent
    .post('/auth/verify-otp')
    .send({ phoneNumber: phone, code: otp })
    .expect(200);

  expect(verifyRes.body.type).toBe('new_registration');

  const regRes = await agent
    .post('/auth/complete-profile')
    .send({ registrationSessionId: verifyRes.body.registrationSessionId, fullName })
    .expect(200);

  return {
    accessToken: regRes.body.accessToken as string,
    refreshToken: regRes.body.refreshToken as string,
    userId: regRes.body.user.id as string,
    user: regRes.body.user,
  };
}
