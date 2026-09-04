import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query, initDatabase, withTransaction } from './connection.js';
import { runMigrations } from './migrations.js';
import { config } from '../config/index.js';

export async function seedDatabase() {
  console.log('[Seed] Starting database seeding...');

  // Ensure tables exist
  await runMigrations();

  const passwordHash = await bcrypt.hash('password123', config.auth.saltRounds);
  const adminPasswordHash = await bcrypt.hash('admin123', config.auth.saltRounds);

  // 1. Seed Users
  const users = [
    {
      id: 'usr-demo-00000000-0000-0000-0000-000000000001',
      email: 'demo@convoscale.io',
      password_hash: passwordHash,
      name: 'Demo Engineer',
      role: 'user',
    },
    {
      id: 'usr-admin-00000000-0000-0000-0000-000000000002',
      email: 'admin@convoscale.io',
      password_hash: adminPasswordHash,
      name: 'System Admin',
      role: 'admin',
    },
  ];

  for (const user of users) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [user.email]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO users (id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.email, user.password_hash, user.name, user.role]
      );
    }
  }

  // 2. Seed Chatbot Responses (Rules, Keywords, Commands)
  const chatbotRules = [
    {
      id: uuidv4(),
      trigger_type: 'COMMAND',
      pattern_or_keyword: '/help',
      response_template: 'Here are the available ConvoScale commands:\n• /ping - Check system latency & health\n• /stats - View conversation metrics\n• /clear - Clear chat session\n• /loadtest - Information on 10k RPM architecture\nOr ask any question about architecture, scaling, pricing, or support!',
      category: 'commands',
      priority: 100,
    },
    {
      id: uuidv4(),
      trigger_type: 'COMMAND',
      pattern_or_keyword: '/ping',
      response_template: '🏓 Pong! ConvoScale backend is operating with sub-millisecond database response times and strict ACID consistency.',
      category: 'commands',
      priority: 100,
    },
    {
      id: uuidv4(),
      trigger_type: 'COMMAND',
      pattern_or_keyword: '/stats',
      response_template: '📊 ConvoScale Engine: Target 10,000 RPM (167+ RPS) | Multi-tier caching | B-Tree indexing | Zero lost updates via row locks.',
      category: 'commands',
      priority: 100,
    },
    {
      id: uuidv4(),
      trigger_type: 'KEYWORD',
      pattern_or_keyword: 'hello|hi|hey|greetings',
      response_template: 'Hello! I am ConvoScale Assistant. How can I assist you with your queries today?',
      category: 'greetings',
      priority: 80,
    },
    {
      id: uuidv4(),
      trigger_type: 'KEYWORD',
      pattern_or_keyword: 'scale|scaling|10000|rpm|throughput|performance|load',
      response_template: '⚡ ConvoScale is engineered for extreme scale: 10,000 requests/minute, connection pooling, Redis-backed sliding-window rate limiting, and cursor-based pagination.',
      category: 'architecture',
      priority: 70,
    },
    {
      id: uuidv4(),
      trigger_type: 'KEYWORD',
      pattern_or_keyword: 'pricing|cost|plans|tier',
      response_template: '💳 ConvoScale pricing plans:\n1. Developer: Free ($0/mo) - Up to 1,000 RPM\n2. Scale Pro: $99/mo - Up to 10,000 RPM\n3. Enterprise: Custom - Unlimited RPM with Dedicated Multi-Region DB Cluster',
      category: 'sales',
      priority: 60,
    },
    {
      id: uuidv4(),
      trigger_type: 'KEYWORD',
      pattern_or_keyword: 'acid|transaction|atomic|rollback|consistency',
      response_template: '🔒 ACID Guarantees: Every message exchange executes inside an atomic BEGIN...COMMIT transaction. If response generation or metadata counter updates fail, full ROLLBACK is guaranteed.',
      category: 'architecture',
      priority: 75,
    },
    {
      id: uuidv4(),
      trigger_type: 'KEYWORD',
      pattern_or_keyword: 'support|help|contact|agent|human',
      response_template: '🛎️ You can reach our 24/7 technical operations team at support@convoscale.io or call 1-800-CONVOSCALE.',
      category: 'support',
      priority: 50,
    },
    {
      id: uuidv4(),
      trigger_type: 'KEYWORD',
      pattern_or_keyword: 'order|status|track|delivery',
      response_template: '📦 Please provide your 8-digit Order Tracking ID to retrieve the current dispatch status.',
      category: 'orders',
      priority: 55,
    },
    {
      id: uuidv4(),
      trigger_type: 'DEFAULT',
      pattern_or_keyword: '*',
      response_template: 'Thank you for reaching out! Your message was processed and recorded atomically. Type /help for available commands or ask about our scaling architecture.',
      category: 'general',
      priority: 0,
    },
  ];

  for (const rule of chatbotRules) {
    const existing = await query('SELECT id FROM chatbot_responses WHERE pattern_or_keyword = $1', [rule.pattern_or_keyword]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO chatbot_responses (id, trigger_type, pattern_or_keyword, response_template, category, priority, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [rule.id, rule.trigger_type, rule.pattern_or_keyword, rule.response_template, rule.category, rule.priority]
      );
    }
  }

  // 3. Seed Sample Conversation for Demo User
  const demoUserId = users[0].id;
  const existingConv = await query('SELECT id FROM conversations WHERE user_id = $1', [demoUserId]);
  if (existingConv.rows.length === 0) {
    const convId = 'cnv-demo-00000000-0000-0000-0000-000000000001';
    await query(
      `INSERT INTO conversations (id, user_id, title, message_count, last_message_at)
       VALUES ($1, $2, $3, 2, CURRENT_TIMESTAMP)`,
      [convId, demoUserId, 'Welcome & Performance Tour']
    );

    // Initial user message
    await query(
      `INSERT INTO messages (id, conversation_id, sender_type, content, sequence_number)
       VALUES ($1, $2, 'USER', 'Hello, how does ConvoScale maintain consistency?', 1)`,
      [uuidv4(), convId]
    );

    // Initial bot reply
    await query(
      `INSERT INTO messages (id, conversation_id, sender_type, content, sequence_number)
       VALUES ($1, $2, 'CHATBOT', '🔒 ACID Guarantees: Every message exchange executes inside an atomic BEGIN...COMMIT transaction. If response generation or metadata counter updates fail, full ROLLBACK is guaranteed.', 2)`,
      [uuidv4(), convId]
    );
  }

  console.log('[Seed] Database successfully seeded with users, rules, and demo conversation.');
}

// Allow direct execution from CLI: node src/db/seed.js
if (process.argv[1]?.endsWith('seed.js')) {
  (async () => {
    try {
      await initDatabase();
      await seedDatabase();
      process.exit(0);
    } catch (err) {
      console.error('[Seed] Seeding failed:', err);
      process.exit(1);
    }
  })();
}
