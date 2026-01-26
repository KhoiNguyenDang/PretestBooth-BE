# Email Verification Feature

## Overview

The email verification feature ensures that users verify their email addresses after registration. This helps maintain data quality and enables secure communication with users.

## Features Implemented

### 1. User Registration with Email Verification

- When a user registers, they receive a verification email
- The email contains a verification link with a unique token
- Tokens expire after 24 hours

### 2. Email Verification Endpoint

- Verify email using the token received in the email
- Marks email as verified in the database

### 3. Resend Verification Email

- Users can request a new verification email if needed
- Generates a new token with 24-hour expiration

## Database Changes

Added three new fields to the `User` model:

- `isEmailVerified` (Boolean): Indicates if email is verified
- `emailVerificationToken` (String): Unique verification token
- `emailVerificationExpiry` (DateTime): Token expiration time

## API Endpoints

### 1. Register

```
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "STUDENT"
}
```

After registration, an email with verification link is sent to the user.

### 2. Verify Email

```
POST /auth/verify-email
Content-Type: application/json

{
  "token": "verification-token-here"
}

Response:
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "STUDENT"
}
```

### 3. Resend Verification Email

```
POST /auth/resend-verification
Content-Type: application/json

{
  "email": "user@example.com"
}

Response:
{
  "message": "Đã gửi lại email xác thực. Vui lòng kiểm tra email của bạn."
}
```

## Environment Variables

Add the following to your `.env` file:

```env
# Email Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password
MAIL_FROM=your-email@gmail.com

# Application URL for email verification link
APP_URL=http://localhost:3000
```

### For Gmail

1. Enable 2-Factor Authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the generated password in `MAIL_PASS`

## Installation

### 1. Install nodemailer package

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

### 2. Run database migration

```bash
npx prisma migrate dev --name add_email_verification
```

### 3. Update your `.env` file with email configuration

## File Structure

```
src/
├── mail/
│   ├── mail.module.ts
│   └── mail.service.ts
├── auth/
│   ├── auth.service.ts (updated)
│   ├── auth.controller.ts (updated)
│   ├── auth.module.ts (updated)
│   └── dto/
│       ├── verify-email.dto.ts (new)
│       └── resend-verification.dto.ts (new)
└── prisma/
    ├── schema.prisma (updated)
    └── migrations/
        └── 20260126150000_add_email_verification/
            └── migration.sql (new)
```

## Testing the Feature

### 1. Register a new user

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 2. Get verification token from email

The email will contain a link like: `http://localhost:3000/auth/verify-email?token=...`

### 3. Verify email

```bash
curl -X POST http://localhost:3000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token":"token-from-email"}'
```

### 4. Resend verification email

```bash
curl -X POST http://localhost:3000/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Error Handling

The feature includes proper error handling for:

- Invalid verification tokens
- Expired verification tokens
- Email already verified
- Email not found

## Future Enhancements

1. Add frontend UI for email verification
2. Require email verification before login (optional)
3. Add email templates using a template engine
4. Add rate limiting for resend verification endpoint
5. Store verification attempts for security
