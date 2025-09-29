import { Request, Response, NextFunction } from 'express';
import logger from '@/utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });

  next();
};

export const rateLimitByIP = new Map<string, { count: number; resetTime: number }>();

export const simpleRateLimit = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip;
    const now = Date.now();

    // Clean up expired entries
    for (const [key, value] of rateLimitByIP.entries()) {
      if (now > value.resetTime) {
        rateLimitByIP.delete(key);
      }
    }

    const current = rateLimitByIP.get(ip);

    if (!current) {
      rateLimitByIP.set(ip, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (now > current.resetTime) {
      rateLimitByIP.set(ip, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        ip,
        path: req.path,
        count: current.count
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests'
      });
      return;
    }

    current.count++;
    next();
  };
};