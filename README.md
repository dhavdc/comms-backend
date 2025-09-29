# Comms App Backend

A Node.js/TypeScript backend service for handling iOS App Store subscriptions with Apple's App Store Server Library.

## Features

- **Receipt Validation**: Server-side validation of App Store receipts
- **Webhook Handling**: Apple Server-to-Server notification processing
- **Duplicate Prevention**: Idempotent transaction handling with upsert operations
- **Subscription Management**: Complete subscription lifecycle management
- **Database Integration**: Seamless Supabase integration
- **Security**: API key authentication, rate limiting, and request logging
- **Error Handling**: Comprehensive error handling and logging

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/dannykhv/Documents/comms-app/backend
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Apple App Store Configuration
APPLE_ISSUER_ID=your_issuer_id
APPLE_KEY_ID=your_key_id
APPLE_BUNDLE_ID=com.comms.comms
APPLE_ENVIRONMENT=Sandbox
APPLE_PRIVATE_KEY_PATH=./keys/AuthKey_XXXXXXXXXX.p8

# Security
JWT_SECRET=your_jwt_secret
API_KEY=your_api_key

# Logging
LOG_LEVEL=info
```

### 3. Apple Private Key Setup

1. Download your private key from Apple Developer Console
2. Create a `keys` directory: `mkdir keys`
3. Place your `.p8` file in the keys directory
4. Update `APPLE_PRIVATE_KEY_PATH` in `.env`

### 4. Development

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Production
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

## API Endpoints

### Subscription Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/subscriptions/validate` | Validate App Store receipt |
| `GET` | `/api/subscriptions/status/:userId` | Get subscription status |
| `GET` | `/api/subscriptions/history/:userId` | Get subscription history |
| `POST` | `/api/subscriptions/sync/:userId` | Sync with Apple servers |
| `GET` | `/api/subscriptions/premium/:userId` | Check premium access |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhooks/apple` | Apple Server-to-Server notifications |
| `GET` | `/api/webhooks/test` | Test webhook service |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/` | API documentation |

## Authentication

All subscription endpoints require API key authentication:

```bash
curl -H "x-api-key: your_api_key" \
     -H "x-user-id: user_uuid" \
     http://localhost:3001/api/subscriptions/premium/user_uuid
```

## Receipt Validation

```bash
curl -X POST http://localhost:3001/api/subscriptions/validate \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key" \
  -d '{
    "receiptData": "base64_receipt_data",
    "userId": "user_uuid",
    "productId": "com.comms.comms.premium_monthly",
    "transactionId": "transaction_id_from_ios"
  }'
```

## Apple Server-to-Server Notifications

Configure in App Store Connect:
- **URL**: `https://your-domain.com/api/webhooks/apple`
- **Version**: Version 2

The webhook handles:
- `SUBSCRIBED` - New subscription
- `DID_RENEW` - Subscription renewal
- `EXPIRED` - Subscription expired
- `DID_FAIL_TO_RENEW` - Renewal failed
- `REFUND` - Subscription refunded
- `DID_CHANGE_RENEWAL_STATUS` - Auto-renewal status changed

## Client Integration

Update your React Native app to use the backend:

```typescript
// Replace direct receipt validation with backend call
const validatePurchase = async (receiptData: string, transactionId: string) => {
  const response = await fetch('http://your-backend-url/api/subscriptions/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'your_api_key',
      'x-user-id': userId
    },
    body: JSON.stringify({
      receiptData,
      userId,
      transactionId,
      productId: currentPurchase.productId
    })
  });

  return response.json();
};
```

## Database Schema

The backend works with your existing Supabase schema:

### `subscriptions` table
- `id` (serial)
- `user_id` (uuid)
- `product_id` (text)
- `transaction_id` (text, unique)
- `environment` (text)
- `purchased_at` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### `profiles` table
- `subscribed` (boolean)
- `has_purchased_subscription_before` (boolean)
- `subscribed_updated_time` (timestamp)

## Production Deployment

1. **Environment**: Set `NODE_ENV=production`
2. **Apple Environment**: Set `APPLE_ENVIRONMENT=Production`
3. **Domain**: Update CORS origin in `server.ts`
4. **SSL**: Ensure HTTPS for webhook endpoints
5. **Logging**: Configure log file persistence
6. **Monitoring**: Add health check monitoring

## Troubleshooting

### Common Issues

1. **Apple Private Key Error**
   - Verify `.p8` file path and permissions
   - Ensure correct Key ID and Issuer ID

2. **Webhook Not Receiving**
   - Verify URL is publicly accessible
   - Check Apple's notification settings
   - Review webhook logs

3. **Duplicate Transaction Errors**
   - Backend automatically handles duplicates with upsert
   - Check database constraints

4. **Supabase Connection**
   - Verify service role key has proper permissions
   - Check Supabase URL format

### Logging

Logs include:
- Request/response details
- Apple API interactions
- Database operations
- Error stack traces

## Security Considerations

- API keys for client authentication
- Rate limiting (100 requests/15 minutes)
- Input validation with Joi schemas
- Helmet security headers
- Request logging and monitoring
- Environment-based error messages

## Architecture

```
Client App (React Native)
    ↓ (Receipt + API Key)
Backend Server (Node.js/TypeScript)
    ↓ (Validation)
Apple App Store Server API
    ↓ (Webhooks)
Database (Supabase)
```

The backend serves as the secure intermediary between your app and Apple's servers, handling all subscription business logic server-side for maximum security and reliability.