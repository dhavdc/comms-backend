import { Router } from 'express';
import { appStoreService } from '@/services/appstore';
import { databaseService } from '@/services/database';
import { authenticateAPI, extractUserId, AuthenticatedRequest } from '@/middleware/auth';
import { validate, validateReceiptSchema } from '@/middleware/validation';
import logger from '@/utils/logger';
import { APIResponse, ValidationRequest } from '@/types';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAPI);

/**
 * POST /api/subscriptions/validate
 * Validate an App Store receipt and update subscription status
 */
router.post('/validate',
  validate(validateReceiptSchema),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const validationRequest: ValidationRequest = req.body;

      logger.info('Receipt validation request received:', {
        userId: validationRequest.userId,
        productId: validationRequest.productId
      });

      const result = await appStoreService.validateReceipt(validationRequest);

      res.json({
        success: result.success,
        data: {
          subscriptionActive: result.subscriptionActive,
          transactionId: result.transactionId,
          expiresDate: result.expiresDate
        },
        error: result.error
      });
    } catch (error) {
      logger.error('Receipt validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/subscriptions/status/:userId
 * Get current subscription status for a user
 */
router.get('/status/:userId',
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      logger.info('Subscription status request:', { userId });

      const [premiumStatus, appStoreStatus] = await Promise.all([
        databaseService.getUserPremiumStatus(userId),
        appStoreService.getSubscriptionStatus(userId)
      ]);

      res.json({
        success: true,
        data: {
          isPremium: premiumStatus.isPremium,
          reason: premiumStatus.reason,
          subscriptionActive: appStoreStatus.active,
          expiresDate: appStoreStatus.expiresDate
        }
      });
    } catch (error) {
      logger.error('Subscription status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/subscriptions/history/:userId
 * Get subscription history for a user
 */
router.get('/history/:userId',
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      logger.info('Subscription history request:', { userId });

      const subscriptions = await databaseService.getActiveSubscriptions(userId);

      res.json({
        success: true,
        data: {
          subscriptions: subscriptions.map(sub => ({
            id: sub.id,
            productId: sub.product_id,
            transactionId: sub.transaction_id,
            environment: sub.environment,
            purchasedAt: sub.purchased_at,
            createdAt: sub.created_at
          }))
        }
      });
    } catch (error) {
      logger.error('Subscription history error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * POST /api/subscriptions/sync/:userId
 * Manually sync subscription status with Apple's servers
 */
router.post('/sync/:userId',
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      logger.info('Manual subscription sync request:', { userId });

      const status = await appStoreService.getSubscriptionStatus(userId);

      // Update database based on current Apple status
      await databaseService.updateUserSubscriptionStatus(userId, status.active);

      res.json({
        success: true,
        data: {
          subscriptionActive: status.active,
          expiresDate: status.expiresDate,
          message: 'Subscription status synced successfully'
        }
      });
    } catch (error) {
      logger.error('Subscription sync error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/subscriptions/premium/:userId
 * Check if user has premium access (one-time unlock or active subscription)
 */
router.get('/premium/:userId',
  async (req, res): Promise<void> => {
    try {
      const { userId } = req.params;

      logger.info('Premium access check:', { userId });

      const status = await databaseService.getUserPremiumStatus(userId);

      res.json({
        success: true,
        data: {
          isPremium: status.isPremium,
          reason: status.reason
        }
      });
    } catch (error) {
      logger.error('Premium access check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

export default router;