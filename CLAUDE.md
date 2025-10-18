# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Node.js/TypeScript backend service for a React Native mobile app that handles iOS App Store subscription management, text-to-speech synthesis, and integration with Supabase database. The backend acts as a secure intermediary between the mobile app and Apple's App Store Server API.

## Development Commands

```bash
# Install dependencies
npm install

# Development with hot reload (uses tsx watch)
npm run dev

# Build TypeScript (outputs to dist/, uses tsc + tsc-alias)
npm run build

# Production server (runs compiled JS)
npm start

# Type checking only (no compilation)
npm run type-check

# Linting
npm run lint
```

## Environment Configuration

Required environment variables (see `.env.example`):
- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Apple**: `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_BUNDLE_ID`, `APPLE_APP_APPLE_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ENVIRONMENT` (Sandbox/Production)
- **Security**: `JWT_SECRET`, `API_KEY`
- **Optional**: `REDIS_URL` (for TTS caching), `LOG_LEVEL`

Note: `APPLE_PRIVATE_KEY` should be the full private key string (with newlines), not a file path.

## Architecture

### Service Layer Pattern

The codebase uses a service-based architecture with singleton instances:

- **`services/appstore.ts`**: Handles all Apple App Store Server API interactions using `@apple/app-store-server-library`. Manages receipt validation, transaction verification, webhook notification processing, and subscription lifecycle events. Initializes `AppStoreServerAPIClient` and `SignedDataVerifier` with Apple credentials.

- **`services/database.ts`**: Supabase database operations for subscriptions and user profiles. Uses service role key for administrative access. All database queries go through this service.

- **`services/cache.ts`**: Redis-based caching for TTS audio using ioredis. Generates MD5 hashes of TTS parameters (text + voice settings) as cache keys. Gracefully degrades if Redis is unavailable.

- **`services/scorer.ts`**: Message comparison service using sentence-transformers/all-MiniLM-L6-v2 embedding model via @xenova/transformers. Computes semantic similarity between messages using cosine similarity with a threshold of 0.91.

- **`services/discord.ts`**: Discord webhook notifications for subscription events (not shown in files but referenced in appstore.ts).

### Routes

- **`routes/subscriptions.ts`**: Subscription validation, status checks, history, and premium access verification
- **`routes/webhooks.ts`**: Apple Server-to-Server notifications (v2) and Supabase database webhooks
- **`routes/tts.ts`**: ElevenLabs text-to-speech synthesis with Redis caching
- **`routes/scorer.ts`**: Message comparison endpoint using semantic similarity

### Middleware

- **`middleware/auth.ts`**: API key authentication via `x-api-key` header
- **`middleware/validation.ts`**: Joi schema validation for request bodies
- **`middleware/security.ts`**: Rate limiting (100 req/15min per IP) and request logging
- **`middleware/errorHandler.ts`**: Centralized error handling and 404 responses

### Path Aliases

Uses `@/*` path alias mapping to `src/*` (configured in tsconfig.json). After TypeScript compilation, `tsc-alias` resolves these to relative paths in the dist/ folder.

## Key Implementation Details

### Subscription Validation Flow

1. Client sends `purchaseToken` (JWS signature from iOS StoreKit 2) to `/api/subscriptions/validate`
2. Backend verifies signature using `SignedDataVerifier.verifyAndDecodeTransaction()`
3. Checks `appAccountToken` matches requesting `userId` to prevent token theft
4. Validates subscription is active by checking `expiresDate > now`
5. Stores subscription record in database using upsert (handles duplicate transactions)
6. Updates user profile `subscribed` status and `has_purchased_subscription_before` flag

### Webhook Processing

Apple sends Server-to-Server notifications to `/api/webhooks/apple`. The handler:
1. Verifies webhook signature using `verifyAndDecodeNotification()`
2. Decodes transaction info from the notification payload
3. Looks up existing subscription by `originalTransactionId`
4. Processes notification type (SUBSCRIBED, DID_RENEW, EXPIRED, REFUND, etc.)
5. Updates database and sends Discord notifications

### Premium Access

Users have premium access if either:
- `profiles.subscribed = true` (active subscription)
- `profiles.one_time_unlock = true` (one-time purchase)

Check via `/api/subscriptions/premium/:userId`

### TTS Caching Strategy

- Cache key: MD5 hash of `{ text, voiceId, modelId, voiceSettings }`
- No expiration (TTS output is deterministic)
- Redis evicts via LRU when memory limit reached
- Graceful degradation if Redis unavailable

## Database Schema

### `subscriptions` table
- `transaction_id` is unique (enforces idempotency)
- `expired` boolean flag (updated by webhooks)
- Upsert operations prevent duplicate transaction errors

### `profiles` table
- `subscribed` boolean (current subscription status)
- `has_purchased_subscription_before` boolean (trial eligibility tracking)
- `one_time_unlock` boolean (non-subscription premium access)
- `subscribed_updated_time` timestamp

## TypeScript Coding Standards

- **No `any` Types**: NEVER use the `any` type unless it is absolutely the last resort. Always research and use the correct types from library definitions. When encountering type errors:
  1. First, check the library's type definitions (usually in `node_modules/@types/` or the package's own types)
  2. Import and use the proper types from the library
  3. Only use type assertions (`as Type`) when you have verified the correct type
  4. Never use `any` as a quick fix for type errors
- **Type Safety**: Maintain strict type safety throughout the codebase. All functions should have explicit return types and parameter types.

## Important Considerations

- **Security**: All subscription endpoints require `x-api-key` header authentication
- **Idempotency**: Use upsert operations with `transaction_id` as conflict key to handle duplicate webhook deliveries
- **Environment**: Always verify `APPLE_ENVIRONMENT` matches deployment (Sandbox vs Production)
- **Webhook Verification**: Never trust webhook payload without signature verification
- **User Ownership**: Always verify transaction's `appAccountToken` matches requesting user
- **Apple Certificates**: Store Apple Root CA certificate in `./certificates/AppleRootCA-G3.cer`
