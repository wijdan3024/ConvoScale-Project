import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDatabase, query } from '../../src/db/connection.js';
import { seedDatabase } from '../../src/db/seed.js';

describe('Concurrency & Race Condition Tests', () => {
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

  test('Concurrent requests to the same conversation maintain strict sequential ordering and zero lost updates', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'High-Concurrency Race Test' });

    const convId = convRes.body.data.conversation.id;
    const NUM_CONCURRENT_REQUESTS = 15;

    // Send 15 messages concurrently
    const promises = Array.from({ length: NUM_CONCURRENT_REQUESTS }).map((_, index) =>
      request(app)
        .post(`/api/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: `Concurrent Message #${index + 1} /ping` })
    );

    const responses = await Promise.all(promises);

    // All should succeed
    for (const res of responses) {
      assert.strictEqual(res.status, 201, 'Every concurrent request must succeed');
    }

    // Total messages in DB should be NUM_CONCURRENT_REQUESTS * 2 (each user message generates a bot reply)
    const expectedTotalMessages = NUM_CONCURRENT_REQUESTS * 2;

    const convInDb = await query('SELECT message_count FROM conversations WHERE id = $1', [convId]);
    assert.strictEqual(
      convInDb.rows[0].message_count,
      expectedTotalMessages,
      'Conversation message_count must equal total messages without lost updates'
    );

    const msgsInDb = await query(
      'SELECT sequence_number, sender_type FROM messages WHERE conversation_id = $1 ORDER BY sequence_number ASC',
      [convId]
    );

    assert.strictEqual(msgsInDb.rows.length, expectedTotalMessages);

    // Verify strict monotonic sequence numbers: 1, 2, 3, ..., N
    const sequenceNumbers = msgsInDb.rows.map((r) => r.sequence_number);
    for (let i = 0; i < sequenceNumbers.length; i++) {
      assert.strictEqual(
        sequenceNumbers[i],
        i + 1,
        `Sequence number at index ${i} must be exactly ${i + 1} (no gaps or duplicates)`
      );
    }
  });
});
