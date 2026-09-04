import autocannon from 'autocannon';
import http from 'http';
import { createApp } from '../../src/app.js';
import { initDatabase, closeDatabase } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrations.js';
import { seedDatabase } from '../../src/db/seed.js';
import { initCache } from '../../src/cache/redis.js';
import { AuthService } from '../../src/services/authService.js';
import { ConversationService } from '../../src/services/conversationService.js';

process.env.DISABLE_RATE_LIMIT = 'true';

async function run10kBenchmark() {
  console.log('='.repeat(75));
  console.log('🚀 ConvoScale 10,000 Requests Per Minute (167+ RPS) Benchmark');
  console.log('='.repeat(75));

  // 1. Initialize environment
  await initDatabase();
  await runMigrations();
  await seedDatabase();
  await initCache();

  // 2. Setup auth & conversation for test
  const { user, token } = await AuthService.login({
    email: 'demo@convoscale.io',
    password: 'password123',
  });

  const conversation = await ConversationService.createConversation({
    userId: user.id,
    title: '10K RPM Benchmark Target',
  });

  // 3. Start standalone test server on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[Benchmark Server] Listening on ${baseUrl}`);
  console.log(`[Target] 10,000 Requests/Min = ~167 Requests/Sec continuous sustained load`);
  console.log(`[Duration] 15 seconds warm-up + measurement`);
  console.log(`[Connections] 100 concurrent virtual connections\n`);

  // 4. Run Autocannon Load Generator
  const result = await autocannon({
    url: `${baseUrl}/api/conversations/${conversation.id}/messages`,
    connections: 100,
    duration: 15,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content: 'Benchmark message payload /ping',
    }),
  });

  // 5. Compute RPM and metrics
  const totalRequests = result.requests.total;
  const durationSeconds = result.duration;
  const actualRPS = Math.round(result.requests.average);
  const calculatedRPM = Math.round(actualRPS * 60);
  const p50 = result.latency.p50;
  const p90 = result.latency.p90;
  const p95 = result.latency.p95 || result.latency.p97_5;
  const p99 = result.latency.p99;
  const avgLatency = result.latency.average.toFixed(2);
  const errorCount = result.errors + result.timeouts + (result.non2xx || 0);
  const successRate = (((totalRequests - errorCount) / Math.max(totalRequests, 1)) * 100).toFixed(2);

  console.log('\n' + '='.repeat(75));
  console.log('📊 CONVOSCALE 10,000 RPM LOAD TEST RESULTS');
  console.log('='.repeat(75));
  console.log(`Target Throughput:       10,000 Requests/Minute (166.7 RPS)`);
  console.log(`Achieved Throughput:     ${calculatedRPM.toLocaleString()} Requests/Minute (${actualRPS.toLocaleString()} RPS)`);
  console.log(`Target Met:              ${calculatedRPM >= 10000 ? '✅ YES (Exceeds Target)' : '❌ NO'}`);
  console.log(`Total Requests Sent:     ${totalRequests.toLocaleString()}`);
  console.log(`Successful Requests:     ${(totalRequests - errorCount).toLocaleString()} (${successRate}%)`);
  console.log(`Failed / Error Requests: ${errorCount}`);
  console.log(`Average Latency:         ${avgLatency} ms`);
  console.log(`P50 Latency:             ${p50} ms`);
  console.log(`P90 Latency:             ${p90} ms`);
  console.log(`P95 Latency:             ${p95} ms`);
  console.log(`P99 Latency:             ${p99} ms`);
  console.log('='.repeat(75) + '\n');

  // Close server and DB
  server.close();
  await closeDatabase();
  return result;
}

if (process.argv[1]?.endsWith('load-10k-rpm.js')) {
  run10kBenchmark().catch((err) => {
    console.error('Benchmark error:', err);
    process.exit(1);
  });
}
