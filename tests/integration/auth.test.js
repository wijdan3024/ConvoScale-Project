import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDatabase } from '../../src/db/connection.js';
import { seedDatabase } from '../../src/db/seed.js';

describe('Authentication & Session Integration Tests', () => {
  let app;

  before(async () => {
    await initDatabase();
    await seedDatabase();
    app = createApp();
  });

  after(async () => {
    await closeDatabase();
  });

  test('POST /api/auth/register - should successfully register a new user', async () => {
    const email = `testuser_${Date.now()}@convoscale.io`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'securePassword123',
        name: 'Alex Developer',
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.user.email, email);
    assert.strictEqual(res.body.data.user.password_hash, undefined); // Password never exposed
  });

  test('POST /api/auth/register - should reject duplicate email registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'demo@convoscale.io', // Already seeded
        password: 'password123',
        name: 'Duplicate Test',
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.message.includes('already exists'));
  });

  test('POST /api/auth/login - should authenticate valid user credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@convoscale.io',
        password: 'password123',
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.user.email, 'demo@convoscale.io');
  });

  test('POST /api/auth/login - should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'demo@convoscale.io',
        password: 'wrongpassword',
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('GET /api/auth/me - should return user profile with valid Bearer token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@convoscale.io', password: 'password123' });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.data.user.email, 'demo@convoscale.io');
  });

  test('POST /api/auth/logout - should revoke active session', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@convoscale.io', password: 'password123' });

    const token = loginRes.body.data.token;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(logoutRes.status, 200);

    // Subsequent access with revoked token should fail
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(meRes.status, 401);
  });
});
