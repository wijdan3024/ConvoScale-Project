import { spawnSync } from 'child_process';

const testFiles = [
  'tests/unit/chatbot.test.js',
  'tests/unit/ratelimit.test.js',
  'tests/integration/auth.test.js',
  'tests/integration/conversations.test.js',
  'tests/transactions/acid-rollback.test.js',
  'tests/concurrency/concurrency.test.js',
  'tests/concurrency/idempotency.test.js',
];

console.log('='.repeat(70));
console.log('🧪 ConvoScale Automated Test Suite');
console.log(`Running ${testFiles.length} test suites sequentially...`);
console.log('='.repeat(70));

let passedSuites = 0;
let failedSuites = 0;
const start = Date.now();

for (const file of testFiles) {
  console.log(`\n▶ Running: ${file}`);
  const result = spawnSync(process.execPath, ['--test', file], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status === 0) {
    passedSuites++;
  } else {
    failedSuites++;
    console.error(`❌ Suite failed: ${file} (Exit code: ${result.status})`);
  }
}

const duration = ((Date.now() - start) / 1000).toFixed(2);
console.log('\n' + '='.repeat(70));
console.log(`🏁 Test Summary: ${passedSuites} Passed | ${failedSuites} Failed | Duration: ${duration}s`);
console.log('='.repeat(70) + '\n');

process.exit(failedSuites === 0 ? 0 : 1);

