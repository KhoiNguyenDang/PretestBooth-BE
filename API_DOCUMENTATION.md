# Pretest Booth API Documentation

## Base URL

```
http://localhost:3000
```

## Authentication

The API uses JWT (JSON Web Token) for authentication. Protected endpoints require a Bearer token in the Authorization header.

````
Authorization: Bearer <access_token>
## Endpoints
### 1. Health Check

#### Get Application Status

```http
GET /
````

**Description:** Returns a simple health check message.

### 2. Authentication

```http
POST /auth/register
```

**Description:** Register a new user account. Only school email addresses are accepted.

- `email`: Must be a valid school email in the format `XXXXXXXX.yourname@(student|teacher).iuh.edu.vn`
- `password`: Minimum 6 characters
  **Success Response (201):**

````json
{
  "message": "User registered successfully. Please check your email for verification."
}
```json
{
  "statusCode": 400,
  "error": "Bad Request"
}
````

---

**Description:** Authenticate a user and receive access and refresh tokens.

```json
{
  "email": "user@student.iuh.edu.vn",
  "password": "password123"
}
```

**Validation Rules:**

- `email`: Valid email format
- `password`: Minimum 6 characters

**Success Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "role": "STUDENT",
    "isEmailVerified": true
  }
}
```

**Error Response (401):**

```json
{
  "statusCode": 401,
  "error": "Unauthorized"
}
```

---

#### Refresh Token

```http
POST /auth/refresh
```

**Description:** Get a new access token using a refresh token.

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (401):**

```json
{
  "statusCode": 401,
  "message": "Invalid refresh token",
  "error": "Unauthorized"
}
```

---

#### Logout

```http
POST /auth/logout
```

**Description:** Logout the current user and invalidate the refresh token.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Success Response (200):**

```json
{
  "message": "Logged out successfully"
```

**Error Response (401):**

````json
#### Verify Email

```http
````

**Description:** Verify user's email address using the token sent to their email.

**Request Body:**
{
"token": "verification-token-from-email"
}
{
}

````

**Error Response (400):**

```json
{
  "statusCode": 400,
  "message": "Invalid or expired verification token",
  "error": "Bad Request"
}
````

---

#### Resend Verification Email

```http
POST /auth/resend-verification
```

**Description:** Request a new verification email.

**Request Body:**

```json
{
  "email": "user@student.iuh.edu.vn"
}
```

**Success Response (200):**

```json
{
  "message": "Verification email sent successfully"
}
```

**Error Response (404):**

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

---

### 4. Password Reset

#### Forgot Password

```http
POST /auth/forgot-password
```

**Description:** Request a password reset code to be sent to the user's email.

**Request Body:**

```json
{
  "email": "user@student.iuh.edu.vn"
}
```

**Success Response (200):**

```json
{
  "message": "Password reset code sent to your email"
}
```

**Error Response (404):**

```json
{
  "statusCode": 404,
  "error": "Not Found"
}
```

---

#### Reset Password

POST /auth/reset-password

````

**Description:** Reset password using the code received via email.

**Request Body:**

```json
{
  "email": "user@student.iuh.edu.vn",
  "code": "123456",
}
````

**Validation Rules:**

- `email`: Valid email format
- `code`: Must be exactly 6 digits
- `newPassword`: Minimum 6 characters

**Success Response (200):**

{
"message": "Password reset successfully"
}

````

  "statusCode": 400,
  "message": "Invalid or expired reset code",
  "error": "Bad Request"


All endpoints may return the following error responses:

### 400 Bad Request

```json
{
  "statusCode": 400,
  "message": ["Validation error messages"],
  "error": "Bad Request"
}
````

### 401 Unauthorized

```json
{
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 404 Not Found

{
"statusCode": 404,
"message": "Resource not found",
"error": "Not Found"
}

````

### 500 Internal Server Error

```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
````

## User Roles

The system supports three user roles:

- **STUDENT**: Regular student user
- **LECTURER**: Teacher/lecturer user
- **ADMIN**: Administrator with full access

---

## Notes

- System sends a 6-digit code to the user's email
- Reset code expires after a certain period

3. **Token Expiry**:
4. **School Email Requirement**: Registration requires a valid IUH school email address in the format:
   - Student: `XXXXXXXX.yourname@student.iuh.edu.vn`
   - Teacher: `XXXXXXXX.yourname@teacher.iuh.edu.vn`

---

## Example Requests (cURL)

### Register

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "12345678.nguyen@student.iuh.edu.vn",
    "password": "password123"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "12345678.nguyen@student.iuh.edu.vn",
    "password": "password123"
  }'
```

### Logout (Protected)

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Forgot Password

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "12345678.nguyen@student.iuh.edu.vn"
  }'
```

### Reset Password

```bash
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "12345678.nguyen@student.iuh.edu.vn",
    "code": "123456",
    "newPassword": "newpassword123"
  }'
```

---

## Code Execution API

The execution API uses [Piston](https://github.com/engineer-man/piston) to run code in a sandboxed environment.

### Get Available Languages

```http
GET /execution/languages
```

**Description:** Get list of supported programming languages with their versions.

**Response:**

```json
[
  {
    "language": "javascript",
    "version": "18.15.0",
    "aliases": ["node", "js"],
    "runtime": "node"
  },
  {
    "language": "python",
    "version": "3.10.0",
    "aliases": ["py", "python3"]
  }
]
```

---

### Execute Code (Protected)

```http
POST /execution/run
```

**Description:** Execute code directly without test cases. Useful for playground/testing.

**Request Body:**

```json
{
  "language": "javascript",
  "version": "*",
  "source": "console.log('Hello World');",
  "stdin": "",
  "args": [],
  "runTimeout": 5000
}
```

| Field              | Type     | Required | Default | Description                           |
| ------------------ | -------- | -------- | ------- | ------------------------------------- |
| language           | string   | Yes      | -       | Programming language                  |
| version            | string   | No       | "\*"    | Language version ("\*" for latest)    |
| source             | string   | Yes      | -       | Source code to execute                |
| stdin              | string   | No       | ""      | Standard input                        |
| args               | string[] | No       | []      | Command line arguments                |
| compileTimeout     | number   | No       | 10000   | Compile timeout in ms                 |
| runTimeout         | number   | No       | 5000    | Execution timeout in ms               |
| compileMemoryLimit | number   | No       | -1      | Compile memory limit (-1 = unlimited) |
| runMemoryLimit     | number   | No       | -1      | Run memory limit (-1 = unlimited)     |

**Response:**

```json
{
  "language": "javascript",
  "version": "18.15.0",
  "stdout": "Hello World",
  "stderr": "",
  "output": "Hello World",
  "exitCode": 0,
  "signal": null,
  "isSuccess": true,
  "isCompileError": false,
  "executionTime": 45,
  "networkTime": 120,
  "totalTime": 165
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/execution/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "language": "python",
    "version": "*",
    "source": "print(sum([1,2,3,4,5]))"
  }'
```

---

### Run Single Test Case (Protected)

```http
POST /execution/test
```

**Description:** Run code against a single test case with expected output comparison.

**Request Body:**

```json
{
  "language": "python",
  "version": "*",
  "source": "nums = list(map(int, input().split()))\ntarget = int(input())\nfor i in range(len(nums)):\n    for j in range(i+1, len(nums)):\n        if nums[i] + nums[j] == target:\n            print(f'[{i},{j}]')",
  "input": "2 7 11 15\n9",
  "expectedOutput": "[0,1]",
  "runTimeout": 5000
}
```

**Response:**

```json
{
  "testCaseId": "",
  "input": "2 7 11 15\n9",
  "expectedOutput": "[0,1]",
  "actualOutput": "[0,1]",
  "stdout": "[0,1]",
  "stderr": "",
  "isCorrect": true,
  "isHidden": false,
  "isSample": false,
  "order": 0,
  "executionTime": 150,
  "passed": true,
  "message": "Accepted"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/execution/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "language": "javascript",
    "version": "*",
    "source": "const input = require(\"fs\").readFileSync(0, \"utf-8\").trim().split(\"\\n\");\nconst nums = input[0].split(\" \").map(Number);\nconst target = parseInt(input[1]);\nfor (let i = 0; i < nums.length; i++) {\n  for (let j = i + 1; j < nums.length; j++) {\n    if (nums[i] + nums[j] === target) {\n      console.log(`[${i},${j}]`);\n    }\n  }\n}",
    "input": "2 7 11 15\n9",
    "expectedOutput": "[0,1]"
  }'
```

---

### Submit Code (Protected)

```http
POST /execution/submit
```

**Description:** Submit code for evaluation against all test cases of a problem.

**Request Body:**

```json
{
  "language": "python",
  "version": "*",
  "source": "def twoSum(nums, target):\n    for i in range(len(nums)):\n        for j in range(i+1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n\nnums = list(map(int, input().split(',')))\ntarget = int(input())\nresult = twoSum(nums, target)\nprint(result)",
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
  "runTimeout": 5000
}
```

| Field      | Type          | Required | Description                          |
| ---------- | ------------- | -------- | ------------------------------------ |
| language   | string        | Yes      | Programming language                 |
| version    | string        | No       | Language version ("\*" for latest)   |
| source     | string        | Yes      | Source code to execute               |
| problemId  | string (UUID) | Yes      | ID of the problem to test against    |
| runTimeout | number        | No       | Execution timeout per test case (ms) |

**Response:**

```json
{
  "language": "python",
  "version": "3.10.0",
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
  "totalTestCases": 4,
  "passedTestCases": 4,
  "failedTestCases": 0,
  "isAllPassed": true,
  "isCompileError": false,
  "testCaseResults": [
    {
      "testCaseId": "tc-1",
      "input": "[2,7,11,15]\n9",
      "expectedOutput": "[0,1]",
      "actualOutput": "[0, 1]",
      "stdout": "[0, 1]",
      "stderr": "",
      "isCorrect": true,
      "isHidden": false,
      "isSample": true,
      "order": 1,
      "executionTime": 145,
      "passed": true,
      "message": "Accepted"
    },
    {
      "testCaseId": "tc-2",
      "input": "[Hidden]",
      "expectedOutput": "[Hidden]",
      "actualOutput": "[Hidden]",
      "stdout": "[Hidden]",
      "stderr": "",
      "isCorrect": true,
      "isHidden": true,
      "isSample": false,
      "order": 4,
      "executionTime": 142,
      "passed": true,
      "message": "Accepted"
    }
  ],
  "totalExecutionTime": 580,
  "totalNetworkTime": 480,
  "totalTime": 1200,
  "submittedAt": "2026-01-28T12:00:00.000Z",
  "status": "ACCEPTED"
}
```

**Status Values:**

| Status              | Description                   |
| ------------------- | ----------------------------- |
| ACCEPTED            | All test cases passed         |
| WRONG_ANSWER        | Output doesn't match expected |
| COMPILE_ERROR       | Code failed to compile        |
| RUNTIME_ERROR       | Code crashed during execution |
| TIME_LIMIT_EXCEEDED | Execution exceeded time limit |

**cURL Example:**

```bash
curl -X POST http://localhost:3000/execution/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "language": "javascript",
    "version": "*",
    "source": "const input = require(\"fs\").readFileSync(0, \"utf-8\").trim().split(\"\\n\");\nconst nums = JSON.parse(input[0]);\nconst target = parseInt(input[1]);\nconst map = new Map();\nfor (let i = 0; i < nums.length; i++) {\n  const complement = target - nums[i];\n  if (map.has(complement)) {\n    console.log(JSON.stringify([map.get(complement), i]));\n    process.exit(0);\n  }\n  map.set(nums[i], i);\n}",
    "problemId": "904963b6-f62e-4c70-934b-5474dd65de04"
  }'
```

---

## Supported Languages

The Piston API supports many languages. Common ones include:

| Language   | Aliases     | Example Extension |
| ---------- | ----------- | ----------------- |
| javascript | js, node    | .js               |
| typescript | ts          | .ts               |
| python     | py, python3 | .py               |
| java       |             | .java             |
| c          | gcc         | .c                |
| cpp        | c++, g++    | .cpp              |
| csharp     | cs, c#      | .cs               |
| go         | golang      | .go               |
| rust       | rs          | .rs               |
| ruby       | rb          | .rb               |
| php        |             | .php              |

Use `GET /execution/languages` to get the full list with versions.

---

## Example: Complete Workflow

### 1. Login to get token

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "lecturer@example.com", "password": "password123"}'
```

### 2. Get problem details

```bash
curl http://localhost:3000/problems/slug/two-sum \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test your solution

```bash
curl -X POST http://localhost:3000/execution/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "language": "python",
    "source": "print(\"[0,1]\")",
    "input": "[2,7,11,15]\n9",
    "expectedOutput": "[0,1]"
  }'
```

### 4. Submit for evaluation

```bash
curl -X POST http://localhost:3000/execution/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "language": "python",
    "source": "YOUR_SOLUTION_CODE",
    "problemId": "904963b6-f62e-4c70-934b-5474dd65de04"
  }'
```
