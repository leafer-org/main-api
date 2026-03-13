import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { createItem, createItemType, createOrganization } from '../../actors/organization.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

// Helper: create a review via POST /reviews
function createReview(
  agent: E2eApp['agent'],
  token: string,
  params: {
    targetType: 'item' | 'organization';
    targetId: string;
    organizationId: string;
    rating: number;
    text?: string;
  },
) {
  return agent
    .post('/reviews')
    .set('Authorization', `Bearer ${token}`)
    .send({
      targetType: params.targetType,
      targetId: params.targetId,
      organizationId: params.organizationId,
      rating: params.rating,
      text: params.text ?? 'Great service!',
    });
}

describe('Reviews (e2e)', () => {
  let e2e: E2eApp;
  let adminToken: string;

  beforeAll(async () => {
    await startContainers();
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await runMigrations(process.env.DB_URL);
    await createBuckets();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpGeneratorService)
      .useValue({ generate: () => OtpCode.raw(FIXED_OTP) })
      .compile();

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await waitForAllConsumers(app);

    e2e = {
      app,
      agent: request(app.getHttpServer()),
    };
  });

  beforeEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedStaticRoles(process.env.DB_URL);
    await seedAdminUser(process.env.DB_URL);

    const auth = await loginAsAdmin(e2e.agent, FIXED_OTP);
    adminToken = auth.accessToken;
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // Helper: register user + create org + item (target for reviews)
  async function setupTarget(phone = '+79990000010') {
    const owner = await registerUser(e2e.agent, FIXED_OTP, { phone });
    const org = await createOrganization(e2e.agent, owner.accessToken);
    const itemType = await createItemType(e2e.agent, adminToken);
    const item = await createItem(e2e.agent, owner.accessToken, org.id, itemType.id);
    return { owner, org, item };
  }

  // ─── 5.1 Create review with rating >= 4 → published ──────────────

  describe('5.1 Create review with rating >= 4 → published', () => {
    it('should create a published review', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const res = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4.5,
        text: 'Excellent!',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('published');
      expect(res.body.rating).toBe(4.5);
      expect(res.body.text).toBe('Excellent!');
      expect(res.body.authorId).toBe(reviewer.userId);
    });
  });

  // ─── 5.2 Create review with rating < 4 → pending ─────────────────

  describe('5.2 Create review with rating < 4 → pending', () => {
    it('should create a pending review', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const res = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 2.5,
        text: 'Not great',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.rating).toBe(2.5);
    });
  });

  // ─── 5.3 Duplicate (userId, target) → error ──────────────────────

  describe('5.3 Duplicate (userId, target) → error', () => {
    it('should return 409 for duplicate review', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4.5,
      }).expect(201);

      const res = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 5,
      });

      expect(res.status).toBe(409);
    });
  });

  // ─── 5.4 Edit pending review, auto-publish on rating increase ─────

  describe('5.4 Edit pending review → auto-publish', () => {
    it('should auto-publish when rating raised to >= 4', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 2,
        text: 'Meh',
      }).expect(201);

      expect(created.body.status).toBe('pending');

      const edited = await e2e.agent
        .patch(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${reviewer.accessToken}`)
        .send({ rating: 4.5, text: 'Actually pretty good!' })
        .expect(200);

      expect(edited.body.status).toBe('published');
      expect(edited.body.rating).toBe(4.5);
      expect(edited.body.text).toBe('Actually pretty good!');
    });
  });

  // ─── 5.5 Approve / reject by moderator ────────────────────────────

  describe('5.5 Approve / reject by moderator', () => {
    it('should approve a pending review', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 2,
      }).expect(201);

      expect(created.body.status).toBe('pending');

      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify via GET
      const fetched = await e2e.agent
        .get(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(fetched.body.status).toBe('published');
    });

    it('should reject a pending review', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 1.5,
      }).expect(201);

      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Spam content' })
        .expect(204);

      const fetched = await e2e.agent
        .get(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(fetched.body.status).toBe('deleted');
    });
  });

  // ─── 5.6 Delete published review ──────────────────────────────────

  describe('5.6 Delete published review', () => {
    it('should delete a published review', async () => {
      const { org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 5,
      }).expect(201);

      expect(created.body.status).toBe('published');

      await e2e.agent
        .delete(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${reviewer.accessToken}`)
        .expect(204);

      const fetched = await e2e.agent
        .get(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${reviewer.accessToken}`)
        .expect(200);

      expect(fetched.body.status).toBe('deleted');
    });
  });

  // ─── 5.7 Owner reply to review ────────────────────────────────────

  describe('5.7 Owner reply to review', () => {
    it('should allow owner to reply to a published review', async () => {
      const { owner, org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4,
      }).expect(201);

      const replied = await e2e.agent
        .post(`/reviews/${created.body.reviewId}/reply`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'Thank you for your feedback!' })
        .expect(200);

      expect(replied.body.replyText).toBe('Thank you for your feedback!');
      expect(replied.body.repliedBy).toBe(owner.userId);
      expect(replied.body.repliedAt).toBeTruthy();
    });
  });

  // ─── 5.8 Dispute → review hidden ─────────────────────────────────

  describe('5.8 Dispute → review hidden', () => {
    it('should hide review when disputed', async () => {
      const { owner, org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4.5,
      }).expect(201);

      const disputed = await e2e.agent
        .post(`/reviews/${created.body.reviewId}/dispute`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'Fake review' })
        .expect(200);

      expect(disputed.body.status).toBe('disputed');
      expect(disputed.body.disputeReason).toBe('Fake review');
      expect(disputed.body.wasDisputed).toBe(true);
    });
  });

  // ─── 5.9 Resolve dispute (uphold) → review restored ──────────────

  describe('5.9 Resolve dispute (uphold) → review restored', () => {
    it('should restore review when dispute is upheld', async () => {
      const { owner, org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4,
      }).expect(201);

      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/dispute`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'Suspicious' })
        .expect(200);

      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/resolve-dispute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'uphold' })
        .expect(204);

      const fetched = await e2e.agent
        .get(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(fetched.body.status).toBe('published');
      expect(fetched.body.wasDisputed).toBe(true);
    });
  });

  // ─── 5.10 Resolve dispute (remove) → review deleted ──────────────

  describe('5.10 Resolve dispute (remove) → review deleted', () => {
    it('should delete review when dispute resolved with remove', async () => {
      const { owner, org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4,
      }).expect(201);

      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/dispute`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'Completely fabricated' })
        .expect(200);

      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/resolve-dispute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'remove' })
        .expect(204);

      const fetched = await e2e.agent
        .get(`/reviews/${created.body.reviewId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(fetched.body.status).toBe('deleted');
    });
  });

  // ─── 5.11 Re-dispute after uphold → error ────────────────────────

  describe('5.11 Re-dispute after uphold → error', () => {
    it('should return 400 when trying to dispute again after uphold', async () => {
      const { owner, org, item } = await setupTarget();
      const reviewer = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000020' });

      const created = await createReview(e2e.agent, reviewer.accessToken, {
        targetType: 'item',
        targetId: item.itemId,
        organizationId: org.id,
        rating: 4.5,
      }).expect(201);

      // First dispute
      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/dispute`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'Suspicious' })
        .expect(200);

      // Uphold → back to published
      await e2e.agent
        .post(`/reviews/${created.body.reviewId}/resolve-dispute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'uphold' })
        .expect(204);

      // Second dispute → error (wasDisputed = true)
      const res = await e2e.agent
        .post(`/reviews/${created.body.reviewId}/dispute`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'I still disagree' });

      expect(res.status).toBe(400);
    });
  });

  // ─── 5.12 Get reviews by target with pagination ───────────────────

  describe('5.12 Get reviews by target with pagination', () => {
    it('should return paginated reviews for a target', async () => {
      const { org, item } = await setupTarget();

      // Create 3 published reviews from different users
      for (let i = 0; i < 3; i++) {
        const reviewer = await registerUser(e2e.agent, FIXED_OTP, {
          phone: `+7999000003${i}`,
        });

        await createReview(e2e.agent, reviewer.accessToken, {
          targetType: 'item',
          targetId: item.itemId,
          organizationId: org.id,
          rating: 4 + i * 0.5,
          text: `Review ${i}`,
        }).expect(201);
      }

      // Fetch with limit=2
      const caller = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000040' });
      const page1 = await e2e.agent
        .get('/reviews')
        .query({ targetType: 'item', targetId: item.itemId, limit: 2 })
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).toBeTruthy();

      // Fetch page 2
      const page2 = await e2e.agent
        .get('/reviews')
        .query({
          targetType: 'item',
          targetId: item.itemId,
          limit: 2,
          cursor: page1.body.nextCursor,
        })
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      // All reviews should be unique
      const allIds = [
        ...page1.body.items.map((r: { reviewId: string }) => r.reviewId),
        ...page2.body.items.map((r: { reviewId: string }) => r.reviewId),
      ];
      expect(new Set(allIds).size).toBe(3);
    });
  });
});
