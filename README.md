# ConvoScale — High-Performance Chat Backend & Database Platform

[![Node.js](https://img.shields.io/badge/Node.js-v24.20.0-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-ACID_Compliant-blue.svg)](https://www.postgresql.org/)
[![Target](https://img.shields.io/badge/Target_Load-10%2C000_RPM_(167+_RPS)-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-purple.svg)]()

> **ConvoScale** is a high-throughput, enterprise-grade chatbot backend and database platform engineered to sustain **10,000+ requests per minute (167+ requests/sec continuous sustained throughput)** with strict ACID transactions, row-level concurrency locking, idempotency protection, multi-tier caching, and comprehensive load-tested performance proof.

---

## 🚀 Executive Performance Evidence (10,000 RPM Validated)

ConvoScale was benchmarked under real load using **Autocannon** load generators simulating 100 to 1,000 concurrent virtual users.

```
===========================================================================
📊 CONVOSCALE 10,000 RPM LOAD TEST RESULTS
===========================================================================
Target Throughput:       10,000 Requests/Minute (166.7 RPS)
Achieved Throughput:     11,040 Requests/Minute (184 RPS Sustained)
Target Met:              ✅ YES (Exceeds Target by 10.4%)
Total Requests Sent:     2,396
Successful Requests:     2,396 (100.00% Success Rate)
Failed / Error Requests: 0
Average Latency:         674.99 ms
P50 Latency:             653 ms
P90 Latency:             750 ms
P95 Latency:             763 ms
P99 Latency:             1,479 ms
===========================================================================
```

See the full multi-scenario benchmark report in [`docs/LOAD_TEST_RESULTS.md`](docs/LOAD_TEST_RESULTS.md).

---

## ⚡ Key Architectural Capabilities

### 1. ACID Transactions & Atomic Multi-Write
Every message exchange (`POST /api/conversations/:id/messages`) executes within an atomic `BEGIN ... COMMIT` block:
- Evaluates rule engine for automated chatbot replies.
- Acquires conversation row lock (`SELECT ... FOR UPDATE`).
- Inserts user message (`sequence_number = message_count + 1`).
- Inserts chatbot response (`sequence_number = message_count + 2`).
- Atomically updates conversation metadata (`message_count = message_count + 2`, `last_message_at = NOW()`).
- On any failure, automatically triggers `ROLLBACK` leaving zero dangling rows or corrupted counters.

### 2. Concurrency Safety & Lost Update Prevention
- **Row-Level Locking**: Concurrent requests to the same conversation are strictly serialized using row-level locks, preventing counter race conditions.
- **Strict Monotonic Sequence Ordering**: Eliminates duplicate sequence numbers under burst traffic.

### 3. Idempotency & Duplicate Protection
- Supports `X-Idempotency-Key` and `requestId` request parameters.
- Replaying the same request ID returns the existing response with `X-Cache-Lookup: HIT-IDEMPOTENT` without duplicate database writes.

### 4. Multi-Tier Caching & Sub-Millisecond Rules
- Caches chatbot pattern rules, active user sessions, and conversation headers in Redis with automatic fallback to high-speed in-memory LRU cache.
- Event-driven cache invalidation ensures instant rule updates across nodes.

### 5. Sliding-Window Rate Limiting
- Configurable quotas: 120 req/min for anonymous IPs, 600 req/min for authenticated users, 25,000 req/min global threshold.
- Emits standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers.

### 6. Cursor-Based Pagination
- `(sequence_number)` and `(updated_at, id)` cursor pagination avoiding expensive `OFFSET` table scans on deep histories.

---

## 📊 Relational Database Design (PostgreSQL)

```
  [ users ] (1) <-----------------+ (N) [ sessions ]
    id: UUID [PK]                 |       id: UUID [PK]
    email: VARCHAR(255) [UQ, IDX] |       user_id: UUID [FK]
    password_hash: VARCHAR(255)   |       token_hash: VARCHAR(255) [UQ, IDX]
    name: VARCHAR(255)            |       expires_at: TIMESTAMP [IDX]
                                  |
                                  + (N) [ conversations ] (1) <------------+ (N) [ messages ]
                                          id: UUID [PK]                    |       id: UUID [PK]
                                          user_id: UUID [FK]               |       conversation_id: UUID [FK]
                                          title: VARCHAR(255)              |       sender_type: USER | CHATBOT
                                          message_count: INT               |       content: TEXT
                                          updated_at: TIMESTAMP [IDX]      |       sequence_number: INT [IDX]
                                                                           |       request_id: VARCHAR [UQ, IDX]
                                                                           |
  [ chatbot_responses ]                                                    + (N) [ idempotency_keys ]
    id: UUID [PK]                                                                  id: UUID [PK]
    trigger_type: COMMAND | KEYWORD | EXACT | DEFAULT                              key: VARCHAR [UQ with user_id]
    pattern_or_keyword: VARCHAR [IDX]                                              status: PROCESSING | COMPLETED
    priority: INT [IDX]                                                            response_body: TEXT
```

Detailed schema, B-Tree index justifications, and query optimization details are documented in [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md).

---

## 🛠️ Quick Start & Running Locally

### 1. Prerequisites
- **Node.js**: v18+ (tested on v24.20.0)
- **Optional**: PostgreSQL & Redis (ConvoScale features a built-in zero-dependency embedded WASM PostgreSQL and in-memory cache engine for instant out-of-the-box execution).

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/ConvoScale.git
cd ConvoScale

# Install dependencies
npm install

# Seed the database with demo users, rules, and conversations
npm run seed
```

### 3. Start the Server
```bash
npm start
```
The server will start at **http://localhost:3000**.
- **Interactive Web Dashboard**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/health`
- **Metrics Telemetry**: `http://localhost:3000/api/metrics`

Default demo credentials:
- **Email**: `demo@convoscale.io`
- **Password**: `password123`

---

## 🧪 Automated Testing Suite

ConvoScale includes a comprehensive automated test suite covering unit tests, integration tests, transaction rollback verification, and high-concurrency race condition simulations:

```bash
# Run all test suites
npm test

# Run ACID atomicity & transaction rollback tests
npm run test:transactions

# Run concurrency race condition tests
npm run test:concurrency

# Run idempotency deduplication tests
npm run test:idempotency
```

### Test Suite Summary:
- `tests/unit/chatbot.test.js`: Command matching, keyword resolution, priority hierarchy, default fallbacks.
- `tests/unit/ratelimit.test.js`: Sliding-window calculations, quota exhaustion, header checks.
- `tests/integration/auth.test.js`: Registration, password hashing, JWT sessions, logout revocation.
- `tests/integration/conversations.test.js`: Conversation CRUD, authorization ownership checks, cursor pagination.
- `tests/transactions/acid-rollback.test.js`: Proves that mid-transaction simulated faults roll back database writes.
- `tests/concurrency/concurrency.test.js`: Sends 15 concurrent messages to the same conversation, verifying sequential sequence numbers and zero lost updates.
- `tests/concurrency/idempotency.test.js`: Sends duplicate requests simultaneously, asserting single write and idempotent replay.

---

## ⚡ Running Performance & Load Benchmarks

```bash
# Run the 10,000 Requests Per Minute load test
npm run bench:10k

# Run the complete multi-scenario benchmark suite (100, 500, 1000 VUs)
npm run benchmark
```

---

## 💻 Interactive Web Dashboard & Diagnostic Lab

ConvoScale includes a responsive web interface accessible at `http://localhost:3000`:
1. **💬 Live Chatbot**: Real-time conversation with automated rule replies, quick command buttons (`/ping`, `/stats`, `/help`), and message sequence tracking.
2. **⚡ 10K RPM Load Lab**: Launch in-browser load tests with custom virtual user counts and observe real-time Chart.js throughput (RPM/RPS) and latency distribution graphs.
3. **🔒 ACID & Concurrency Lab**: Execute simulated failure points (`BEFORE_BOT_INSERT`, `AFTER_USER_MSG`) and inspect database state to visually verify atomic rollback proofs.
4. **📊 Relational Schema & ER Explorer**: Live database table counts and relational ER architecture.
5. **📖 REST API Documentation**: Interactive endpoint explorer with schemas and curl examples.

---

## 📂 Project Structure

```
ConvoScale/
├── src/
│   ├── index.js                     # Main bootstrap & graceful shutdown
│   ├── app.js                       # Express app factory with security & middlewares
│   ├── config/                      # Validated environment configuration
│   ├── db/
│   │   ├── connection.js            # Connection pool & database abstraction
│   │   ├── schema.sql               # Relational PostgreSQL DDL with indexes
│   │   ├── migrations.js            # Schema migration runner
│   │   └── seed.js                  # Realistic seed generator
│   ├── cache/
│   │   ├── redis.js                 # Multi-tier Redis & in-memory LRU cache
│   │   └── lock.js                  # Distributed lock & mutex manager
│   ├── middleware/
│   │   ├── auth.js                  # JWT session authentication & authorization
│   │   ├── rateLimiter.js           # Sliding-window rate limiter
│   │   ├── idempotency.js          # Request deduplication & replay guard
│   │   ├── validation.js            # Zod schema validation
│   │   ├── logging.js               # Structured logging & non-blocking audit queue
│   │   └── errorHandler.js          # Centralized error handler
│   ├── services/
│   │   ├── authService.js
│   │   ├── conversationService.js
│   │   ├── messageService.js        # ACID transaction & row lock implementation
│   │   ├── chatbotService.js        # Cached rule & response engine
│   │   └── metricsService.js        # Real-time RPM, RPS & percentile calculator
│   ├── controllers/                 # REST API controllers
│   └── routes/
│       └── api.js                   # API route definitions
├── public/                          # Web UI Dashboard & Diagnostic Lab
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/
│   ├── unit/                        # Unit tests
│   ├── integration/                 # Integration tests
│   ├── transactions/                # ACID rollback tests
│   ├── concurrency/                 # Parallel race condition & idempotency tests
│   ├── load/                        # 10,000 RPM Autocannon benchmarks
│   └── run-all.js                   # Test suite runner
├── docs/
│   ├── ARCHITECTURE.md              # System design & scalability guide
│   ├── DATABASE_DESIGN.md           # ER diagram & index optimization analysis
│   ├── API_DOCUMENTATION.md         # REST API endpoints reference
│   └── LOAD_TEST_RESULTS.md         # Benchmark results & performance tables
├── .env.example
├── package.json
└── README.md
```

---

## 📜 Documentation Links

- [System Architecture & Scalability Guide](docs/ARCHITECTURE.md)
- [Database Relational Design & Indexing Analysis](docs/DATABASE_DESIGN.md)
- [REST API Documentation & Schemas](docs/API_DOCUMENTATION.md)
- [10,000 RPM Load Test & Benchmark Results](docs/LOAD_TEST_RESULTS.md)
