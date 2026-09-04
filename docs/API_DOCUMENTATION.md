# ConvoScale — RESTful API Documentation

Base URL: `http://localhost:3000/api`

---

## 1. Authentication Endpoints

### `POST /auth/register`
Create a new user account.

**Request:**
```http
POST /api/auth/register HTTP/1.1
Content-Type: application/json
X-Idempotency-Key: reg-uuid-1234

{
  "email": "developer@convoscale.io",
  "password": "securePassword123",
  "name": "Jane Developer"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "0d94f275-...",
      "email": "developer@convoscale.io",
      "name": "Jane Developer",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "User registered successfully"
}
```

---

### `POST /auth/login`
Authenticate with email and password.

**Request:**
```http
POST /api/auth/login HTTP/1.1
Content-Type: application/json

{
  "email": "demo@convoscale.io",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr-demo-00000000-0000-0000-0000-000000000001",
      "email": "demo@convoscale.io",
      "name": "Demo Engineer",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Authentication successful"
}
```

---

### `GET /auth/me`
Retrieve currently authenticated user profile.

**Headers:**
`Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr-demo-00000000-0000-0000-0000-000000000001",
      "email": "demo@convoscale.io",
      "name": "Demo Engineer",
      "role": "user"
    }
  }
}
```

---

## 2. Conversation Endpoints

### `POST /conversations`
Create a new conversation.

**Request:**
```http
POST /api/conversations HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Scaling Discussion"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "7b82e1d0-...",
      "user_id": "usr-demo-...",
      "title": "Scaling Discussion",
      "message_count": 0,
      "last_message_at": "2026-09-04T08:50:00.000Z",
      "is_archived": false,
      "created_at": "2026-09-04T08:50:00.000Z",
      "updated_at": "2026-09-04T08:50:00.000Z"
    }
  }
}
```

---

### `GET /conversations`
List user conversations with Cursor or Offset Pagination.

**Query Parameters:**
- `limit` (optional, default: 20, max: 100)
- `cursor` (optional, base64 encoded cursor)
- `offset` (optional, default: 0)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "conversations": [...],
    "pagination": {
      "limit": 20,
      "hasMore": false,
      "nextCursor": null,
      "total": 5
    }
  }
}
```

---

## 3. Message Endpoints

### `POST /conversations/:id/messages`
Send message with atomic ACID transaction, chatbot response, and idempotency protection.

**Request:**
```http
POST /api/conversations/7b82e1d0-.../messages HTTP/1.1
Authorization: Bearer <token>
X-Idempotency-Key: msg-client-req-9876
Content-Type: application/json

{
  "content": "Tell me about ACID transactions",
  "requestId": "msg-client-req-9876"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "isDuplicate": false,
    "userMessage": {
      "id": "5f6e8a1b-...",
      "conversation_id": "7b82e1d0-...",
      "sender_type": "USER",
      "content": "Tell me about ACID transactions",
      "sequence_number": 1,
      "created_at": "2026-09-04T08:51:00.000Z"
    },
    "botMessage": {
      "id": "9a8b7c6d-...",
      "conversation_id": "7b82e1d0-...",
      "sender_type": "CHATBOT",
      "content": "🔒 ACID Guarantees: Every message exchange executes inside an atomic BEGIN...COMMIT transaction...",
      "sequence_number": 2,
      "created_at": "2026-09-04T08:51:00.000Z"
    },
    "conversation": {
      "id": "7b82e1d0-...",
      "message_count": 2,
      "updated_at": "2026-09-04T08:51:00.000Z"
    },
    "ruleMatched": "architecture"
  }
}
```

---

### `GET /conversations/:id/messages`
Retrieve paginated chronological message history.

**Query Parameters:**
- `limit` (optional, default: 50)
- `cursor` (optional, sequence number cursor)
- `direction` (`ASC` | `DESC`, default: `ASC`)

---

## 4. Health & Diagnostics Endpoints

### `GET /health`
Deep health check inspecting PostgreSQL pool, cache subsystem, and memory.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "ConvoScale High-Performance Chat Backend",
  "version": "1.0.0",
  "uptimeSeconds": 1420,
  "healthChecks": {
    "database": {
      "status": "healthy",
      "latencyMs": 0.45,
      "pool": {
        "mode": "Embedded PostgreSQL (PGlite WASM)",
        "totalQueries": 18450
      }
    },
    "cache": {
      "status": "healthy",
      "stats": {
        "mode": "In-Memory High-Speed Cache (LRU/TTL)",
        "hitRate": "99.12%"
      }
    }
  }
}
```

---

### `GET /api/metrics`
Live telemetry snapshot reporting RPM, RPS, latency percentiles, and capacity utilization.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "throughput": {
      "currentRPM": 11040,
      "currentRPS": 184,
      "targetRPM": 10000,
      "targetRPS": 167,
      "capacityUtilizationPercent": 110.4
    },
    "latencyMs": {
      "p50": 24.0,
      "p90": 32.0,
      "p95": 48.0,
      "p99": 64.0,
      "avg": 27.33
    }
  }
}
```
