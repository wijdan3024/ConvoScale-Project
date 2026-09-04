import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDatabase, query } from '../../src/db/connection.js';
import { seedDatabase } from '../../src/db/seed.js';

describe('Idempotency & Duplicate Protection Tests', () => {
  let app;
  let token;

  before(async () => {
    await initDatabase();
    await seedDatabase();
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@convoscale.io', password: 'password123' });
    token = loginRes.body.data.token;
  });

  after(async () => {
    await closeDatabase();
  });

  test('Submitting identical requestId returns idempotent result without duplicate DB inserts', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Idempotency Test Conversation' });

    const convId = convRes.body.data.conversation.id;
    const clientRequestId = `idemp-req-${uuidv4()}`;

    // Request 1: Original send
    const res1 = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Original message with idempotency key',
        requestId: clientRequestId,
      });

    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res1.body.data.isDuplicate, false);
    const originalMsgId = res1.body.data.userMessage.id;

    // Request 2: Duplicate retry (e.g., client network timeout / double-click)
    const res2 = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Original message with idempotency key',
        requestId: clientRequestId,
      });

    assert.ok([200, 201].includes(res2.status), 'Idempotent replay should return 200 OK or 201 Created');
    assert.strictEqual(res2.body.data.userMessage.id, originalMsgId);
    assert.ok(
      res2.headers['x-cache-lookup'] === 'HIT-IDEMPOTENT' || res2.body.data.isDuplicate === true,
      'Duplicate request must be recognized as idempotent'
    );

    // Verify DB contains only 1 user message + 1 bot response for this requestId
    const dbMsgs = await query(
      'SELECT id, content, request_id FROM messages WHERE conversation_id = $1',
      [convId]
    );

    assert.strictEqual(dbMsgs.rows.length, 2, 'DB must contain exactly 2 messages (1 user, 1 bot)');
  });

  test('X-Idempotency-Key header replays previous response', async () => {
    const headerKey = `header-idemp-${uuidv4()}`;

    // Create conversation with idempotency header
    const res1 = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', headerKey)
      .send({ title: 'Idempotent Header Conv' });

    assert.strictEqual(res1.status, 201);
    const convId = res1.body.data.conversation.id;

    // Duplicate call with same header
    const res2 = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Idempotency-Key', headerKey)
      .send({ title: 'Idempotent Header Conv' });

    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res2.headers['x-cache-lookup'], 'HIT-IDEMPOTENT');
    assert.strictEqual(res2.body.data.conversation.id, convId);
  });
});
