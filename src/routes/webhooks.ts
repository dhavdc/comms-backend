import { Router } from 'express';
import { appStoreService } from '@/services/appstore';
import { validate, validateWebhookSchema } from '@/middleware/validation';
import { appleTestNotifications } from '@/utils/apple-test-notifications';
import logger from '@/utils/logger';
import { APIResponse } from '@/types';

const router = Router();

/**
 * POST /api/webhooks/apple
 * Handle Apple App Store Server-to-Server notifications
 *
 * This endpoint receives notifications from Apple about subscription events
 * such as renewals, cancellations, refunds, etc.
 *
 * Apple will send notifications to this endpoint when subscription status changes.
 * Configure this URL in Apple's App Store Connect under your app's settings.
 */
router.post('/apple',
  async (req, res): Promise<void> => {
    try {
      // Apple sends the signed payload in the request body
      const signedPayload = req.body.signedPayload || req.body;

      if (!signedPayload || typeof signedPayload !== 'string') {
        logger.warn('Invalid webhook payload received from Apple', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          bodyType: typeof req.body
        });

        res.status(400).json({
          success: false,
          error: 'Invalid payload format'
        });
        return;
      }

      logger.info('Apple webhook notification received', {
        ip: req.ip,
        payloadLength: signedPayload.length
      });

      // Process the webhook notification
      const success = await appStoreService.handleWebhookNotification(signedPayload);

      if (success) {
        logger.info('Apple webhook processed successfully');
        res.status(200).json({
          success: true,
          message: 'Webhook processed successfully'
        });
      } else {
        logger.error('Failed to process Apple webhook');
        res.status(500).json({
          success: false,
          error: 'Failed to process webhook'
        });
      }
    } catch (error) {
      logger.error('Apple webhook processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/webhooks/test
 * Test endpoint to verify webhook service is running
 */
router.get('/test',
  async (req, res): Promise<void> => {
    res.json({
      success: true,
      message: 'Webhook service is running',
      timestamp: new Date().toISOString()
    });
  }
);

/**
 * POST /api/webhooks/apple/test
 * Request Apple to send a test notification to your webhook endpoint
 * This is the official way to test Apple webhooks
 */
router.post('/apple/test',
  async (req, res): Promise<void> => {
    try {
      logger.info('Requesting test notification from Apple...');

      const testNotificationToken = await appleTestNotifications.requestTestNotification();

      if (testNotificationToken) {
        res.json({
          success: true,
          message: 'Test notification requested successfully',
          testNotificationToken,
          instructions: `Apple will send a test notification to your webhook endpoint. Use the token to check status at GET /api/webhooks/apple/test/${testNotificationToken}`
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to request test notification'
        });
      }
    } catch (error) {
      logger.error('Error requesting test notification:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/webhooks/apple/test/:token
 * Check the status of a test notification
 */
router.get('/apple/test/:token',
  async (req, res): Promise<void> => {
    try {
      const { token } = req.params;
      logger.info('Checking test notification status for token:', token);

      const status = await appleTestNotifications.getTestNotificationStatus(token);

      if (status) {
        res.json({
          success: true,
          status
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Test notification status not found'
        });
      }
    } catch (error) {
      logger.error('Error getting test notification status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

export default router;