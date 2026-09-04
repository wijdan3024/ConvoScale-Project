import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { initDatabase, closeDatabase } from '../../src/db/connection.js';
import { seedDatabase } from '../../src/db/seed.js';
import { ChatbotService } from '../../src/services/chatbotService.js';

describe('Chatbot Rule Engine Unit Tests', () => {
  before(async () => {
    await initDatabase();
    await seedDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  test('should match command rules exactly (e.g., /ping)', async () => {
    const res = await ChatbotService.generateResponse('/ping');
    assert.strictEqual(res.matchedCategory, 'commands');
    assert.ok(res.response.includes('Pong!'));
  });

  test('should match command /help and list available commands', async () => {
    const res = await ChatbotService.generateResponse('/help');
    assert.strictEqual(res.matchedCategory, 'commands');
    assert.ok(res.response.includes('/ping'));
  });

  test('should match keyword rules case-insensitively (e.g., "Tell me about pricing")', async () => {
    const res = await ChatbotService.generateResponse('What is the Pricing of your plans?');
    assert.strictEqual(res.matchedCategory, 'sales');
    assert.ok(res.response.includes('Scale Pro'));
  });

  test('should match ACID transaction architecture questions', async () => {
    const res = await ChatbotService.generateResponse('How does the database handle ACID transactions and rollback?');
    assert.strictEqual(res.matchedCategory, 'architecture');
    assert.ok(res.response.includes('ACID Guarantees'));
  });

  test('should fallback to default response for unmatched queries', async () => {
    const res = await ChatbotService.generateResponse('xyz123 random unhandled string message');
    assert.strictEqual(res.matchedCategory, 'general');
    assert.ok(res.response.includes('Thank you for reaching out'));
  });
});
