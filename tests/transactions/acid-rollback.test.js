import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDatabase, query } from '../../src/db/connection.js';
import { seedDatabase } from '../../src/db/seed.js';

describe('ACID Transaction & Atomicity Rollback Tests', () => {
  let app;
  let token;
  let userId;

  before(async () => {
    await initDatabase();
    await seedDatabase();
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@convoscale.io', password: 'password123' });
    token = loginRes.body.data.token;
    userId = loginRes.body.data.user.id;
  });

  after(async () => {
    await closeDatabase();
  });

  test('ACID Success: Multi-table write commits atomically', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'ACID Success Test' });

    const convId = convRes.body.data.conversation.id;

    const res = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello /ping' });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.conversation.message_count, 2);

    // Verify DB state
    const dbMsgs = await query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sequence_number ASC', [convId]);
    assert.strictEqual(dbMsgs.rows.length, 2);
    assert.strictEqual(dbMsgs.rows[0].sender_type, 'USER');
    assert.strictEqual(dbMsgs.rows[1].sender_type, 'CHATBOT');
  });

  test('ACID Rollback: Failure AFTER_USER_MSG rolls back user message insertion', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Rollback Test AFTER_USER_MSG' });

    const convId = convRes.body.data.conversation.id;

    // Trigger message send with AFTER_USER_MSG failure
    const failRes = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'This message will fail after user insert',
        simulateFailureType: 'AFTER_USER_MSG',
      });

    assert.strictEqual(failRes.status, 500);

    // Verify DB state: ZERO messages should exist for this conversation
    const dbMsgs = await query('SELECT * FROM messages WHERE conversation_id = $1', [convId]);
    assert.strictEqual(dbMsgs.rows.length, 0, 'No partial user message should exist in DB');

    const dbConv = await query('SELECT message_count FROM conversations WHERE id = $1', [convId]);
    assert.strictEqual(dbConv.rows[0].message_count, 0, 'Conversation message_count should remain 0');
  });

  test('ACID Rollback: Failure BEFORE_BOT_INSERT rolls back transaction', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Rollback Test BEFORE_BOT_INSERT' });

    const convId = convRes.body.data.conversation.id;

    const failRes = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Simulate bot engine failure',
        simulateFailureType: 'BEFORE_BOT_INSERT',
      });

    assert.strictEqual(failRes.status, 500);

    // Verify DB state
    const dbMsgs = await query('SELECT * FROM messages WHERE conversation_id = $1', [convId]);
    assert.strictEqual(dbMsgs.rows.length, 0, 'Atomicity verified: User message was rolled back');
  });

  test('ACID Rollback: TestLab Failure Simulation Endpoint returns formal proof', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'TestLab Simulation Conv' });

    const convId = convRes.body.data.conversation.id;

    const simRes = await request(app)
      .post('/api/test/simulate-failure')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId: convId,
        failureType: 'BEFORE_BOT_INSERT',
      });

    assert.strictEqual(simRes.status, 200);
    assert.strictEqual(simRes.body.simulation.acidCompliance.atomicityPreserved, true);
    assert.strictEqual(simRes.body.simulation.acidCompliance.partialWritesOccurred, false);
    assert.ok(simRes.body.simulation.acidCompliance.status.includes('PASSED'));
  });
});
