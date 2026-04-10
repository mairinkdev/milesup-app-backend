# New API Spec

## Conventions

- Base path: `/v1`
- Auth: Bearer JWT in `Authorization: Bearer <token>`
- Content type: JSON unless otherwise stated
- IDs: UUID strings
- Dates: ISO 8601 strings
- List envelope: `{ items, page, pageSize, totalItems, totalPages }`
- Error envelope:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "fieldErrors": {
      "fieldName": "Validation message"
    }
  }
}
```

## Health and docs

### `GET /health`

- Auth: no
- Body: none
- Query: none
- Response `200`:
  - `{ status, timestamp }`
- Possible errors:
  - `500 INTERNAL_SERVER_ERROR`

### Swagger UI

- UI: `GET /docs`
- Auth: no

## Auth

### `POST /v1/auth/register/start`

- Auth: no
- Body:
  - `fullName: string`
  - `email: string`
  - `phone?: string`
  - `birthDate?: string`
  - `cpf?: string`
  - `cnpj?: string`
  - `role?: "USER" | "COMPANY"`
  - `companyName?: string`
  - `password: string`
  - `pinCode: string(6)`
- Query: none
- Response `201`:
  - `verificationId`
  - `expiresAt`
  - `delivery: { channel: "email", destinationMasked }`
  - `devCode?`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `409 ACCOUNT_ALREADY_EXISTS`

### `POST /v1/auth/register/verify`

- Auth: no
- Body:
  - `verificationId`
  - `code`
- Query: none
- Response `201`:
  - `accessToken`
  - `refreshToken`
  - `expiresAt`
  - `refreshExpiresAt`
  - `user`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 INVALID_VERIFICATION_CODE`
  - `410 VERIFICATION_EXPIRED`

### `POST /v1/auth/login`

- Auth: no
- Body:
  - `email`
  - `password`
  - `deviceId?`
- Query: none
- Response `200`:
  - `requiresTwoFactor: true`
  - `temporaryToken`
  - `verificationId`
  - `expiresAt`
  - `delivery`
  - `devCode?`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 INVALID_CREDENTIALS`

### `POST /v1/auth/login/2fa`

- Auth: no
- Body:
  - `temporaryToken`
  - `verificationId`
  - `code`
- Query: none
- Response `200`:
  - `accessToken`
  - `refreshToken`
  - `expiresAt`
  - `refreshExpiresAt`
  - `user`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 VERIFICATION_SESSION_MISMATCH`
  - `404 LOGIN_SESSION_NOT_FOUND`
  - `410 VERIFICATION_EXPIRED`

### `POST /v1/auth/tokens/refresh`

- Auth: no
- Body:
  - `refreshToken`
- Query: none
- Response `200`:
  - `accessToken`
  - `refreshToken`
  - `expiresAt`
  - `refreshExpiresAt`
  - `user`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 INVALID_REFRESH_TOKEN`

### `POST /v1/auth/logout`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `{ ok: true }`
- Possible errors:
  - `401 UNAUTHORIZED`

### `POST /v1/auth/password/forgot`

- Auth: no
- Body:
  - `email`
- Query: none
- Response `200`:
  - `verificationId`
  - `expiresAt`
  - `delivery`
  - `devCode?`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `404 ACCOUNT_NOT_FOUND`

### `POST /v1/auth/password/reset`

- Auth: no
- Body:
  - `verificationId`
  - `code`
  - `newPassword`
- Query: none
- Response `200`:
  - `{ ok, message }`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 INVALID_VERIFICATION_CODE`
  - `410 VERIFICATION_EXPIRED`

## Users

### `GET /v1/users/me`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `id`
  - `fullName`
  - `email`
  - `phone`
  - `cpf`
  - `cnpj`
  - `birthDate`
  - `role`
  - `status`
  - `flexKey`
  - `companyName`
  - `avatarUrl`
  - `createdAt`
  - `updatedAt`
- Possible errors:
  - `401 UNAUTHORIZED`
  - `404 USER_NOT_FOUND`

### `PATCH /v1/users/me`

- Auth: yes
- Body:
  - `fullName?`
  - `phone?`
  - `companyName?`
- Query: none
- Response `200`: same user object as `GET /v1/users/me`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`

### `POST /v1/users/me/avatar`

- Auth: yes
- Content type: `multipart/form-data`
- Body:
  - `file`
- Query: none
- Response `200`: same user object as `GET /v1/users/me`
- Possible errors:
  - `400 FILE_REQUIRED`
  - `401 UNAUTHORIZED`

## Dashboard and wallet

### `GET /v1/dashboard`

- Auth: yes
- Body: none
- Query:
  - `period=7d|15d|30d|90d`
- Response `200`:
  - `wallet`
  - `metrics`
  - `connectedProviders`
  - `recentActivities`
  - `subscription`
- Possible errors:
  - `401 UNAUTHORIZED`
  - `500 INTERNAL_SERVER_ERROR`

### `GET /v1/wallet`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `id`
  - `kind`
  - `securityModeActive`
  - `balances`
  - `createdAt`
  - `updatedAt`
  - `totalMiles`
- Possible errors:
  - `401 UNAUTHORIZED`
  - `404 WALLET_NOT_FOUND`

### `GET /v1/wallet/activities`

- Auth: yes
- Body: none
- Query:
  - `period=7d|15d|30d|90d`
  - `kind=ALL|TRANSFERS|CONVERSIONS`
  - `direction=ALL|INCOMING|OUTGOING`
  - `page`
  - `pageSize`
- Response `200`:
  - `items`
  - `summary`
  - `page`
  - `pageSize`
  - `totalItems`
  - `totalPages`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`

### `POST /v1/wallet/security-mode`

- Auth: yes
- Body:
  - `reason?`
- Query: none
- Response `200`:
  - `active`
  - `startedAt`
  - `reason`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `404 WALLET_NOT_FOUND`

### `DELETE /v1/wallet/security-mode`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `active`
  - `endedAt`
- Possible errors:
  - `401 UNAUTHORIZED`
  - `404 WALLET_NOT_FOUND`

## Providers

### `GET /v1/providers`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `{ items: [{ key, name, description, connectType, supportedAssets, primaryAsset, brandColor, exchangeRateToFlex, feeBps }] }`
- Possible errors:
  - `401 UNAUTHORIZED`

### `GET /v1/providers/:providerKey`

- Auth: yes
- Body: none
- Query: none
- Params:
  - `providerKey`
- Response `200`:
  - `{ key, name, description, connectType, supportedAssets, primaryAsset, brandColor, exchangeRateToFlex, feeBps }`
- Possible errors:
  - `401 UNAUTHORIZED`
  - `404 PROVIDER_NOT_FOUND`

### `GET /v1/provider-connections`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `{ items: [{ id, providerKey, providerName, externalAccountId, status, connectType, supportedAssets, lastSyncedAt, connectedAt, metadata }] }`
- Possible errors:
  - `401 UNAUTHORIZED`

### `POST /v1/provider-connections`

- Auth: yes
- Body:
  - `providerKey`
  - `externalAccountId`
  - `email?`
  - `secret?`
  - `metadata?`
- Query: none
- Response `201`:
  - `{ id, providerKey, providerName, externalAccountId, status, connectType, supportedAssets, lastSyncedAt, connectedAt, metadata }`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `404 PROVIDER_NOT_FOUND`
  - `404 WALLET_NOT_FOUND`
  - `409 PROVIDER_ALREADY_CONNECTED`

### `DELETE /v1/provider-connections/:connectionId`

- Auth: yes
- Body: none
- Query: none
- Params:
  - `connectionId`
- Response `200`:
  - `{ ok: true }`
- Possible errors:
  - `401 UNAUTHORIZED`
  - `404 PROVIDER_CONNECTION_NOT_FOUND`

## Transfers

### `POST /v1/transfers/recipient-resolution`

- Auth: yes
- Body:
  - `query`
- Query: none
- Response `200`:
  - `userId`
  - `walletId`
  - `displayName`
  - `handle`
  - `avatarUrl`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `404 RECIPIENT_NOT_FOUND`

### `POST /v1/transfers/intents`

- Auth: yes
- Body:
  - `recipientHandleOrEmail`
  - `amountMiles`
  - `note?`
- Query: none
- Response `201`:
  - `id`
  - `amountMiles`
  - `feeMiles`
  - `expiresAt`
  - `recipient`
  - `note`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 INSUFFICIENT_FUNDS`
  - `401 UNAUTHORIZED`
  - `404 WALLET_NOT_FOUND`
  - `404 RECIPIENT_NOT_FOUND`

### `POST /v1/transfers/intents/:intentId/confirm`

- Auth: yes
- Body:
  - `pinCode`
- Query: none
- Params:
  - `intentId`
- Response `200`:
  - `transfer: { id, amountMiles, status, createdAt }`
  - `walletBalance: { asset, amount }`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 INVALID_PIN`
  - `400 INSUFFICIENT_FUNDS`
  - `401 UNAUTHORIZED`
  - `404 TRANSFER_INTENT_NOT_FOUND`
  - `404 WALLET_NOT_FOUND`
  - `410 TRANSFER_INTENT_EXPIRED`

## Conversions

### `POST /v1/conversions/intents`

- Auth: yes
- Body:
  - `providerConnectionId`
  - `amountMiles`
  - `note?`
- Query: none
- Response `201`:
  - `id`
  - `providerConnectionId`
  - `providerKey`
  - `amountInMiles`
  - `amountOutMiles`
  - `feeMiles`
  - `rate`
  - `expiresAt`
  - `note`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 INSUFFICIENT_PROVIDER_BALANCE`
  - `401 UNAUTHORIZED`
  - `404 CONVERSION_SOURCE_NOT_FOUND`

### `POST /v1/conversions/intents/:intentId/confirm`

- Auth: yes
- Body:
  - `pinCode`
- Query: none
- Params:
  - `intentId`
- Response `200`:
  - `conversion: { id, providerKey, amountInMiles, amountOutMiles, status, createdAt }`
  - `walletBalance: { asset, amount }`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `400 INVALID_PIN`
  - `400 INSUFFICIENT_PROVIDER_BALANCE`
  - `401 UNAUTHORIZED`
  - `404 CONVERSION_INTENT_NOT_FOUND`
  - `404 WALLET_NOT_FOUND`
  - `410 CONVERSION_INTENT_EXPIRED`

## Billing

### `GET /v1/billing/plans`

- Auth: yes
- Body: none
- Query:
  - `country` default `BR`
- Response `200`:
  - `{ items: [{ id, code, name, description, country, currency, monthlyAmountMinor, yearlyAmountMinor, highlighted, perks }] }`
- Possible errors:
  - `401 UNAUTHORIZED`

### `GET /v1/billing/subscription`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `id`
  - `planCode`
  - `planName`
  - `status`
  - `interval`
  - `cancelAtPeriodEnd`
  - `currentPeriodStart`
  - `currentPeriodEnd`
  - `nextBillingDate`
  - `nextAmountMinor`
  - `currency`
  - `paymentMethod`
  - `updatedAt`
- Possible errors:
  - `401 UNAUTHORIZED`

### `POST /v1/billing/checkout-sessions`

- Auth: yes
- Body:
  - `planCode`
  - `interval=MONTH|YEAR`
  - `successRedirectUrl`
  - `cancelRedirectUrl`
  - `email?`
- Query: none
- Response `201`:
  - `id`
  - `url`
  - `expiresAt`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `404 PLAN_NOT_FOUND`

### `GET /v1/billing/invoices`

- Auth: yes
- Body: none
- Query:
  - `page`
  - `pageSize`
- Response `200`:
  - `{ items, page, pageSize, totalItems, totalPages }`
- Item fields:
  - `id`
  - `status`
  - `amountDueMinor`
  - `amountPaidMinor`
  - `amountRemainingMinor`
  - `currency`
  - `hostedInvoiceUrl`
  - `invoicePdfUrl`
  - `dueDate`
  - `periodStart`
  - `periodEnd`
  - `paidAt`
  - `createdAt`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`

### `GET /v1/billing/payment-methods`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `items`
  - `defaultPaymentMethodId`
- Payment method fields:
  - `id`
  - `providerRef`
  - `type`
  - `brand`
  - `last4`
  - `expMonth`
  - `expYear`
  - `holderName`
  - `isDefault`
- Possible errors:
  - `401 UNAUTHORIZED`

### `PATCH /v1/billing/payment-methods/default`

- Auth: yes
- Body:
  - `paymentMethodId`
- Query: none
- Response `200`:
  - updated payment method object
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `404 PAYMENT_METHOD_NOT_FOUND`

### `POST /v1/billing/subscription/cancel`

- Auth: yes
- Body:
  - `atPeriodEnd` default `true`
- Query: none
- Response `200`:
  - updated subscription object
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`

### `POST /v1/billing/subscription/change-plan`

- Auth: yes
- Body:
  - `planCode`
  - `interval=MONTH|YEAR`
- Query: none
- Response `200`:
  - updated subscription object
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`
  - `404 PLAN_NOT_FOUND`

## Notifications

### `GET /v1/notifications`

- Auth: yes
- Body: none
- Query:
  - `page`
  - `pageSize`
- Response `200`:
  - `{ items, page, pageSize, totalItems, totalPages }`
- Notification item fields:
  - `id`
  - `type`
  - `title`
  - `body`
  - `actionUrl`
  - `status`
  - `createdAt`
  - `readAt`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`

### `POST /v1/notifications/read-all`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `{ updatedCount }`
- Possible errors:
  - `401 UNAUTHORIZED`

## Support

### `GET /v1/support/faqs`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `{ items: [{ id, question, answer, category, sortOrder }] }`
- Possible errors:
  - `401 UNAUTHORIZED`

### `GET /v1/support/conversation`

- Auth: yes
- Body: none
- Query: none
- Response `200`:
  - `id`
  - `status`
  - `messages`
- Message fields:
  - `id`
  - `authorType`
  - `authorName`
  - `body`
  - `createdAt`
- Possible errors:
  - `401 UNAUTHORIZED`

### `POST /v1/support/conversation/messages`

- Auth: yes
- Body:
  - `message`
- Query: none
- Response `201`:
  - `conversationId`
  - `messages`
- Possible errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED`

## Media

### `GET /v1/media/:mediaId`

- Auth: no
- Body: none
- Query: none
- Params:
  - `mediaId`
- Response `200`:
  - binary file bytes with the stored mime type
- Possible errors:
  - `404 MEDIA_NOT_FOUND`

## Hosted checkout pages

### `GET /checkout/:publicToken`

- Auth: no
- Response:
  - HTML page that allows the user to complete or cancel the checkout session
- Possible errors:
  - returns an HTML unavailable page if the session is invalid, expired or not open

### `GET /checkout/:publicToken/complete`

- Auth: no
- Response:
  - completes the checkout
  - creates or updates subscription, invoice and default payment method
  - redirects to the provided success URL
- Possible errors:
  - returns an HTML unavailable page if the session is invalid or no longer open

### `GET /checkout/:publicToken/cancel`

- Auth: no
- Response:
  - marks the checkout as cancelled
  - redirects to the provided cancel URL
- Possible errors:
  - returns an HTML unavailable page if the session does not exist
