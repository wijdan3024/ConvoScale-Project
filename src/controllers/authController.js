import { AuthService } from '../services/authService.js';

export class AuthController {
  static async register(req, res, next) {
    try {
      const { email, password, name } = req.body;
      const result = await AuthService.register({ email, password, name });
      res.status(201).json({
        success: true,
        data: result,
        message: 'User registered successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await AuthService.login({ email, password, ipAddress, userAgent });
      res.status(200).json({
        success: true,
        data: result,
        message: 'Authentication successful',
      });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req, res, next) {
    try {
      if (req.token) {
        await AuthService.logout(req.token);
      }
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  static async me(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: { user: req.user },
      });
    } catch (err) {
      next(err);
    }
  }
}
