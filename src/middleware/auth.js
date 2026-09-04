import { AuthService } from '../services/authService.js';

/**
 * Authentication middleware requiring a valid JWT Bearer token
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication token is required. Provide Authorization: Bearer <token>',
        code: 'AUTH_REQUIRED',
      },
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const user = await AuthService.validateToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired authentication session',
          code: 'INVALID_TOKEN',
        },
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication failed: ' + error.message,
        code: 'AUTH_FAILED',
      },
    });
  }
}

/**
 * Optional authentication middleware: populates req.user if token is present
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const user = await AuthService.validateToken(token);
      if (user) {
        req.user = user;
        req.token = token;
      }
    } catch {
      // ignore
    }
  }
  next();
}

/**
 * Require administrator role
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Forbidden: Administrator privileges required',
        code: 'ADMIN_REQUIRED',
      },
    });
  }
  next();
}
