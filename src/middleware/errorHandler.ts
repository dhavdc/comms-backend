import { Request, Response, NextFunction } from 'express';
import logger from '@/utils/logger.js';
import { APIResponse } from '@/types/index.js';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response<APIResponse>,
  next: NextFunction
): void => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message;

  res.status(500).json({
    success: false,
    error: message
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response<APIResponse>,
  next: NextFunction
): void => {
  logger.warn('Route not found:', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
};