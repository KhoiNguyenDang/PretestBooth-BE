# API Documentation

Welcome to the Pretest Booth API documentation! This folder contains comprehensive documentation for all API modules.

## Quick Start

👉 **Start here**: [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) - Main overview and API index

## Module Documentation

Select a module based on what you need to implement:

### 🔐 Authentication & User Management
**File**: [AUTH_API.md](./AUTH_API.md)

Covers user registration, login, email verification, password reset, and token management.

**Key Endpoints:**
- Register user with school email validation
- Login and receive JWT tokens  
- Refresh access tokens
- Verify email addresses
- Reset forgotten passwords

👉 [View Authentication API](./AUTH_API.md)

---

### 🎯 Problem Management
**File**: [PROBLEMS_API.md](./PROBLEMS_API.md)

Covers coding problem creation, management, and test case handling.

**Key Features:**
- Create and manage coding problems
- Add problem difficulty levels (Easy/Medium/Hard)
- Create and manage test cases
- Support sample and hidden test cases
- Search and filter problems

👉 [View Problems API](./PROBLEMS_API.md)

---

### ⚙️ Code Execution
**File**: [EXECUTION_API.md](./EXECUTION_API.md)

Covers code execution in a sandboxed environment using Piston.

**Key Features:**
- Execute code directly (playground mode)
- Test code against single test cases
- Full submission evaluation
- Support for 10+ programming languages
- Detailed execution results with timing

👉 [View Execution API](./EXECUTION_API.md)

---

### 📝 Submission Tracking
**File**: [SUBMISSIONS_API.md](./SUBMISSIONS_API.md)

Covers user code submission history and statistics.

**Key Features:**
- Track code submissions
- View submission history with filtering
- Get submission statistics per problem
- View detailed submission results
- Role-based access control

👉 [View Submissions API](./SUBMISSIONS_API.md)

---

## Document Information

- **Version**: 1.1
- **Last Updated**: 2026-02-02
- **Base URL**: `http://localhost:3000`

## Navigation Tips

Each API module document includes:
- ✅ Complete endpoint reference
- ✅ Request/response examples
- ✅ Field descriptions and validation rules
- ✅ Error response examples
- ✅ cURL command examples
- ✅ Workflow examples

## Common Links

- [Full API Overview](../API_DOCUMENTATION.md)
- [Authentication Guide](./AUTH_API.md)
- [Problems Guide](./PROBLEMS_API.md)
- [Code Execution Guide](./EXECUTION_API.md)
- [Submissions Guide](./SUBMISSIONS_API.md)
- [Documentation Structure](./DOCUMENTATION_STRUCTURE.md)

## Need Help?

1. Check the specific module documentation
2. Look for cURL examples at the bottom of each document
3. Review the "Notes" section for important information
4. Check the "Troubleshooting" section in main documentation

## Key Concepts

### Authentication
- JWT-based authentication required for protected endpoints
- Access tokens are short-lived (15-60 minutes)
- Use refresh tokens to get new access tokens

### User Roles
- **STUDENT**: View problems, submit solutions
- **LECTURER**: Create/manage problems, view submissions
- **ADMIN**: Full access

### Email Requirements
- School email format required for registration
- Student: `XXXXXXXX.yourname@student.iuh.edu.vn`
- Lecturer: `XXXXXXXX.yourname@teacher.iuh.edu.vn`

### Pagination
- Default limit: 10 items per page
- Use `page` and `limit` query parameters

---

## All Endpoints at a Glance

### Authentication
```
POST   /auth/register              - Register new user
POST   /auth/login                 - Login and get tokens
POST   /auth/logout                - Logout
POST   /auth/refresh               - Refresh access token
POST   /auth/verify-email          - Verify email
POST   /auth/resend-verification   - Resend verification email
POST   /auth/forgot-password       - Request password reset
POST   /auth/reset-password        - Reset password with code
```

### Problems
```
GET    /problems                   - List all problems
POST   /problems                   - Create problem
GET    /problems/:id               - Get problem by ID
GET    /problems/slug/:slug        - Get problem by slug
PATCH  /problems/:id               - Update problem
DELETE /problems/:id               - Delete problem

POST   /problems/:id/testcases     - Create test case
POST   /problems/:id/testcases/bulk - Create multiple test cases
GET    /problems/:id/testcases     - Get all test cases
PATCH  /problems/testcases/:id     - Update test case
DELETE /problems/testcases/:id     - Delete test case
```

### Code Execution
```
GET    /execution/languages        - Get supported languages
POST   /execution/run              - Execute code
POST   /execution/test             - Test against one test case
POST   /execution/submit           - Submit for evaluation
```

### Submissions
```
POST   /submissions                - Create submission
GET    /submissions                - List all submissions
GET    /submissions/problem/:id    - Get submissions for problem
GET    /submissions/problem/:id/stats - Get problem statistics
GET    /submissions/:id            - Get submission details
```

---

## File Structure

```
docs/
├── README.md                     ← You are here
├── DOCUMENTATION_STRUCTURE.md    - Structure overview
├── AUTH_API.md                   - Authentication module
├── PROBLEMS_API.md               - Problems module
├── EXECUTION_API.md              - Code execution module
└── SUBMISSIONS_API.md            - Submissions module
```

---

**Happy coding! 🚀**
