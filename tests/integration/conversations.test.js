import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDatabase } from '../../src/db/connection.js';
import { seedDatabase } from '../../src/db/seed.js';

describe('Conversations & Authorization Integration Tests', () => {
  let app;
  let user1Token;
  let user2Token;
  let user1Id;
  let user2Id;

  before(async () => {
    await initDatabase();
    await seedDatabase();
    app = createApp();

    // Login user 1 (Demo user)
    const u1Res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@convoscale.io', password: 'password123' });
    user1Token = u1Res.body.data.token;
    user1Id = u1Res.body.data.user.id;

    // Register user 2 (Independent user)
    const u2Email = `other_user_${Date.now()}@convoscale.io`;
    const u2Res = await request(app)
      .post('/api/auth/register')
      .send({ email: u2Email, password: 'password123', name: 'User Two' });
    user2Token = u2Res.body.data.token;
    user2Id = u2Res.body.data.user.id;
  });

  after(async () => {
    await closeDatabase();
  });

  test('POST /api/conversations - should create a new conversation', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ title: 'Performance Engineering Discussion' });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.conversation.title, 'Performance Engineering Discussion');
    assert.strictEqual(res.body.data.conversation.message_count, 0);
  });

  test('Authorization Check: User 2 cannot access User 1 conversation', async () => {
    // User 1 creates conversation
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ title: 'Secret Architecture Design' });

    const convId = convRes.body.data.conversation.id;

    // User 2 tries to GET conversation
    const forbiddenGet = await request(app)
      .get(`/api/conversations/${convId}`)
      .set('Authorization', `Bearer ${user2Token}`);

    assert.strictEqual(forbiddenGet.status, 403);
    assert.strictEqual(forbiddenGet.body.success, false);

    // User 2 tries to send message in User 1's conversation
    const forbiddenMsg = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ content: 'Unauthorized injection attempt' });

    assert.strictEqual(forbiddenMsg.status, 403);
  });

  test('POST /api/conversations/:id/messages - should send message and get automated bot response', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ title: 'Chatbot Interaction Test' });

    const convId = convRes.body.data.conversation.id;

    const msgRes = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'What is your pricing model?' });

    assert.strictEqual(msgRes.status, 201);
    assert.strictEqual(msgRes.body.success, true);
    assert.strictEqual(msgRes.body.data.userMessage.content, 'What is your pricing model?');
    assert.strictEqual(msgRes.body.data.userMessage.sequence_number, 1);
    assert.strictEqual(msgRes.body.data.botMessage.sender_type, 'CHATBOT');
    assert.ok(msgRes.body.data.botMessage.content.includes('Scale Pro'));
    assert.strictEqual(msgRes.body.data.botMessage.sequence_number, 2);
    assert.strictEqual(msgRes.body.data.conversation.message_count, 2);
  });

  test('GET /api/conversations/:id/messages - Cursor pagination should navigate sequential messages', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ title: 'Pagination Verification' });

    const convId = convRes.body.data.conversation.id;

    // Send 3 user messages (creating 6 total messages)
    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message 1 /ping' });

    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message 2 /stats' });

    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Message 3 pricing' });

    // Page 1 (limit = 2)
    const page1Res = await request(app)
      .get(`/api/conversations/${convId}/messages?limit=2`)
      .set('Authorization', `Bearer ${user1Token}`);

    assert.strictEqual(page1Res.status, 200);
    assert.strictEqual(page1Res.body.data.messages.length, 2);
    assert.strictEqual(page1Res.body.data.pagination.hasMore, true);
    const nextCursor = page1Res.body.data.pagination.nextCursor;
    assert.ok(nextCursor);

    // Page 2 using cursor
    const page2Res = await request(app)
      .get(`/api/conversations/${convId}/messages?limit=2&cursor=${nextCursor}`)
      .set('Authorization', `Bearer ${user1Token}`);

    assert.strictEqual(page2Res.status, 200);
    assert.strictEqual(page2Res.body.data.messages.length, 2);
    assert.strictEqual(page2Res.body.data.messages[0].sequence_number, 3);
  });
});
