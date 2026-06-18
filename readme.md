# Auth Microservice

## Enterprise Authentication & Authorization Service

A production-ready authentication and authorization microservice built with Node.js, Express.js, MongoDB, Redis, JWT, OAuth, OTP verification, device tracking, and Two-Factor Authentication.

Designed for modern web and mobile applications requiring secure user authentication and authorization.

---

## Features

### Authentication

* Email & Password Authentication
* JWT Access Tokens
* Refresh Token Rotation
* Secure Login & Logout
* Password Reset via OTP
* Email Verification via OTP
* Account Deletion Verification

### OAuth Authentication

* Google OAuth 2.0
* GitHub OAuth

### User Management

* User Registration
* Fetch User Profile
* Change User Name
* Update Avatar
* Update Cover Image
* Delete Account

### Device Management

* Device Detection
* Device Tracking
* Multi-Device Login
* Session Monitoring

### Security

* bcrypt Password Hashing
* Login Rate Limiting
* Refresh Token Rotation
* Secure HTTP-Only Cookies
* Token Blacklisting
* IP Tracking
* Audit Logging
* Session Revocation

### Two-Factor Authentication (2FA)

* Enable 2FA
* Verify 2FA Setup
* Verify 2FA Login

### Developer Experience

* REST API Architecture
* Reusable Middleware
* Structured Error Handling
* Environment-Based Configuration
* Docker Ready
* OpenAPI / Swagger Ready

---

## Tech Stack

### Backend

* Node.js
* Express.js

### Database

* MongoDB
* Mongoose

### Cache & Sessions

* Redis

### Authentication

* JWT
* Google OAuth
* GitHub OAuth

### File Uploads

* Multer
* Cloudinary

### Email Service

* Nodemailer

### Security

* bcrypt

---

## Installation

### Clone Repository

```bash
git clone https://github.com/adityayadav176/auth-microservice.git

cd auth-microservice
```

### Install Dependencies

```bash
npm install
```

### Create Environment File

Create a `.env` file in the root directory:

```env
PORT=9001

MONGO_DB_URI=mongodb://localhost:27017

ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret

ACCESS_TOKEN_EXPIRY=30d
REFRESH_TOKEN_EXPIRY=7d

GOOGLE_CLIENT_ID=google_client_id
GOOGLE_CLIENT_SECRET=google_client_secret

GITHUB_CLIENT_ID=github_client_id
GITHUB_CLIENT_SECRET=github_client_secret

SMTP_USER=something@smtp-brevo.com
SMTP_PASSWORD=smtp_password
SENDER_EMAIL=example@gmail.com

CLOUDINARY_CLOUDNAME=cloud_name
CLOUDINARY_API_KEY=cloudinary_api_key
CLOUDINARY_API_SECRET=cloudinary_api_secret

NODE_ENV=development
```

### Run Development Server

```bash
npm run dev
```

---

## Project Structure

```text
src
│
├── controllers
│
├── middleware
│
├── models
|
├── db
│
├── routes
│
├── constant
│
├── utils
│
├── rateLimiting
│
└── app.js
```

---

## API Endpoints

### Authentication

#### Register User

```http
POST /api/v1/auth/register
```

#### Login User

```http
POST /api/v1/auth/login
```

#### Logout User

```http
POST /api/v1/auth/logout
```

#### Refresh Access Token

```http
POST /api/v1/auth/refreshAccessToken
```

---

### Email Verification

#### Send Verification OTP

```http
POST /api/v1/auth/sendEmailVerificationOtp
```

#### Verify Email

```http
POST /api/v1/auth/VerifyEmail
```

---

### Password Management

#### Send Password Reset OTP

```http
POST /api/v1/auth/SendPasswordResetOtp
```

#### Reset Password

```http
POST /api/v1/auth/forgetPassword
```

---

### User Management

#### Fetch User

```http
GET /api/v1/auth/fetchUser
```

#### Change Name

```http
POST /api/v1/auth/changeName
```

#### Update Avatar

```http
PATCH /api/v1/auth/update-avatar
```

#### Update Cover Image

```http
PATCH /api/v1/auth/update-coverImage
```

#### Send Delete Account OTP

```http
POST /api/v1/auth/sendDeleteAccountOtp
```

#### Delete Account

```http
POST /api/v1/auth/deleteAccount
```

---

### OAuth Authentication

#### Google OAuth

```http
POST /api/v1/auth/google
```

#### GitHub OAuth

```http
GET /api/v1/auth/github
```

#### GitHub Callback

```http
GET /api/v1/auth/github/callback
```

---

### Two-Factor Authentication

#### Enable 2FA

```http
POST /api/v1/auth/2fa/enable
```

#### Verify 2FA Setup

```http
POST /api/v1/auth/2fa/verify-setup
```

### Verify 2FA Login

```http
POST /api/v1/auth/login/2fa
```

---

## Security Features

* Password Hashing using bcrypt
* Login Rate Limiting
* JWT Authentication
* Refresh Token Rotation
* HTTP-Only Cookies
* Token Blacklisting
* Session Revocation
* Device Tracking
* Audit Logging
* OTP Verification
* Two-Factor Authentication

---

## Roadmap

### Completed

* JWT Authentication
* Refresh Token Rotation
* Google OAuth
* GitHub OAuth
* Device Tracking
* Email Verification
* Password Reset OTP
* Two-Factor Authentication

### Upcoming Features

* WebAuthn / Passkeys
* SAML SSO
* SCIM Provisioning
* Multi-Tenant Organizations
* Admin Dashboard
* React SDK
* React Native SDK
* Next.js SDK
* Docker Compose
* Kubernetes Deployment

---

## Contributing

Contributions are welcome.

### Steps

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push the branch
5. Open a Pull Request

---

## License

MIT License

---

## Author

### Aditya Yadav

If you find this project useful, consider giving it a ⭐ on GitHub.
