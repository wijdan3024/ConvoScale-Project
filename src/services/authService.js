import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { cache } from '../cache/redis.js';
import { config } from '../config/index.js';

const SESSION_CACHE_PREFIX = 'session:';
const USER_CACHE_PREFIX = 'user:';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register({ email, password, name }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      const error = new Error('A user with this email address already exists');
      error.statusCode = 409;
      throw error;
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, config.auth.saltRounds);

    await query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'user')`,
      [userId, normalizedEmail, passwordHash, name.trim()]
    );

    const token = jwt.sign(
      { userId, email: normalizedEmail, role: 'user', jti: uuidv4() },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiration }
    );

    const tokenHash = hashToken(token);
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, userId, tokenHash, expiresAt]
    );

    const user = { id: userId, email: normalizedEmail, name: name.trim(), role: 'user' };

    // Cache session
    await cache.set(`${SESSION_CACHE_PREFIX}${tokenHash}`, user, 7 * 86400);

    return { user, token };
  }

  /**
   * Authenticate user with email and password
   */
  static async login({ email, password, ipAddress = null, userAgent = null }) {
    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await query(
      `SELECT id, email, password_hash, name, role, created_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (rows.length === 0) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const userRecord = rows[0];
    const passwordValid = await bcrypt.compare(password, userRecord.password_hash);
    if (!passwordValid) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const token = jwt.sign(
      { userId: userRecord.id, email: userRecord.email, role: userRecord.role, jti: uuidv4() },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiration }
    );

    const tokenHash = hashToken(token);
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, userRecord.id, tokenHash, ipAddress, userAgent, expiresAt]
    );

    const user = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role,
    };

    // Cache session for fast verification
    await cache.set(`${SESSION_CACHE_PREFIX}${tokenHash}`, user, 7 * 86400);

    return { user, token };
  }

  /**
   * Validate token and return user profile
   */
  static async validateToken(token) {
    if (!token) return null;

    let decoded;
    try {
      decoded = jwt.verify(token, config.auth.jwtSecret);
    } catch {
      return null;
    }

    const tokenHash = hashToken(token);
    // 1. Fast path: check cache
    const cached = await cache.getJSON(`${SESSION_CACHE_PREFIX}${tokenHash}`);
    if (cached) {
      return cached;
    }

    // 2. Database path
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return null;
    }

    const user = rows[0];
    await cache.set(`${SESSION_CACHE_PREFIX}${tokenHash}`, user, 86400);
    return user;
  }

  /**
   * Revoke session on logout
   */
  static async logout(token) {
    if (!token) return;
    const tokenHash = hashToken(token);
    await cache.del(`${SESSION_CACHE_PREFIX}${tokenHash}`);
    await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }
}
