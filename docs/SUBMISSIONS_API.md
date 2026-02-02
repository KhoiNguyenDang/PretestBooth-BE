# Submissions API Documentation

## Base URL

```
http://localhost:3000
```

## Overview

The Submissions API provides endpoints for managing and retrieving code submissions. Users can submit their solutions, view submission history, track statistics, and retrieve detailed submission results.

All endpoints in this API require authentication.

---

## Endpoints

### Create Submission

```http
POST /submissions
```

**Description:** Submit code for evaluation against a problem. This endpoint validates the code and stores the submission record.

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "language": "javascript",
  "languageVersion": "18.15.0",
  "sourceCode": "const input = require('fs').readFileSync(0, 'utf-8').trim().split('\\n');\nconst nums = JSON.parse(input[0]);\nconst target = parseInt(input[1]);\nfor (let i = 0; i < nums.length; i++) {\n  for (let j = i + 1; j < nums.length; j++) {\n    if (nums[i] + nums[j] === target) {\n      console.log(JSON.stringify([i, j]));\n    }\n  }\n}",
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04"
}
```

**Field Descriptions:**

| Field             | Type          | Required | Description                    |
| ----------------- | ------------- | -------- | ------------------------------ |
| language          | string        | Yes      | Programming language           |
| languageVersion   | string        | No       | Specific language version      |
| sourceCode        | string        | Yes      | The submitted source code      |
| problemId         | string (UUID) | Yes      | ID of the problem being solved |

**Success Response (201):**

```json
{
  "id": "sub-123",
  "language": "javascript",
  "languageVersion": "18.15.0",
  "status": "ACCEPTED",
  "totalTestCases": 4,
  "passedTestCases": 4,
  "failedTestCases": 0,
  "isCompileError": false,
  "executionTime": 580,
  "networkTime": 120,
  "totalTime": 700,
  "testCaseResults": [
    {
      "testCaseId": "tc-1",
      "passed": true,
      "message": "Accepted",
      "executionTime": 145
    },
    {
      "testCaseId": "tc-2",
      "passed": true,
      "message": "Accepted",
      "executionTime": 142
    },
    {
      "testCaseId": "tc-3",
      "passed": true,
      "message": "Accepted",
      "executionTime": 148
    },
    {
      "testCaseId": "tc-4",
      "passed": true,
      "message": "Accepted",
      "executionTime": 145
    }
  ],
  "userId": "user-123",
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
  "submittedAt": "2026-01-28T12:00:00.000Z",
  "createdAt": "2026-01-28T12:00:00.000Z"
}
```

**Submission Status Values:**

| Status              | Description                   |
| ------------------- | ----------------------------- |
| PENDING             | Submission pending evaluation |
| ACCEPTED            | All test cases passed         |
| WRONG_ANSWER        | Output doesn't match expected |
| COMPILE_ERROR       | Code failed to compile        |
| RUNTIME_ERROR       | Code crashed during execution |
| TIME_LIMIT_EXCEEDED | Execution exceeded time limit |
| MEMORY_LIMIT_EXCEEDED | Memory usage exceeded limit  |

**Error Response (404):**

```json
{
  "statusCode": 404,
  "message": "Problem not found",
  "error": "Not Found"
}
```

---

### Get All Submissions

```http
GET /submissions
```

**Description:** Retrieve all submissions with pagination and filtering. Students see only their own submissions; lecturers and admins can see submissions from all users.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Query Parameters:**

| Parameter  | Type    | Default | Description                              |
| ---------- | ------- | ------- | ---------------------------------------- |
| page       | number  | 1       | Page number for pagination               |
| limit      | number  | 10      | Items per page                           |
| status     | string  | -       | Filter by submission status              |
| language   | string  | -       | Filter by programming language           |
| sortBy     | string  | createdAt | Sort field (createdAt, status, language) |
| order      | string  | desc    | Sort order (asc/desc)                    |

**Example:**

```http
GET /submissions?page=1&limit=10&status=ACCEPTED&sortBy=createdAt&order=desc
```

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "sub-123",
      "language": "javascript",
      "languageVersion": "18.15.0",
      "status": "ACCEPTED",
      "totalTestCases": 4,
      "passedTestCases": 4,
      "failedTestCases": 0,
      "executionTime": 580,
      "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
      "problem": {
        "id": "904963b6-f62e-4c70-934b-5474dd65de04",
        "title": "Two Sum",
        "slug": "two-sum",
        "difficulty": "EASY"
      },
      "submittedAt": "2026-01-28T12:00:00.000Z",
      "createdAt": "2026-01-28T12:00:00.000Z"
    },
    {
      "id": "sub-124",
      "language": "python",
      "languageVersion": "3.10.0",
      "status": "WRONG_ANSWER",
      "totalTestCases": 4,
      "passedTestCases": 2,
      "failedTestCases": 2,
      "executionTime": 450,
      "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
      "problem": {
        "id": "904963b6-f62e-4c70-934b-5474dd65de04",
        "title": "Two Sum",
        "slug": "two-sum",
        "difficulty": "EASY"
      },
      "submittedAt": "2026-01-28T11:30:00.000Z",
      "createdAt": "2026-01-28T11:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

---

### Get Submissions for a Problem

```http
GET /submissions/problem/:problemId
```

**Description:** Retrieve user's submissions for a specific problem with pagination and filtering.

**Parameters:**

- `problemId` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token>
```

**Query Parameters:**

| Parameter | Type    | Default | Description              |
| --------- | ------- | ------- | ------------------------ |
| page      | number  | 1       | Page number              |
| limit     | number  | 10      | Items per page           |
| status    | string  | -       | Filter by status         |
| sortBy    | string  | createdAt | Sort field             |
| order     | string  | desc    | Sort order (asc/desc)    |

**Example:**

```http
GET /submissions/problem/904963b6-f62e-4c70-934b-5474dd65de04?page=1&limit=5
```

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "sub-123",
      "language": "javascript",
      "languageVersion": "18.15.0",
      "status": "ACCEPTED",
      "totalTestCases": 4,
      "passedTestCases": 4,
      "failedTestCases": 0,
      "executionTime": 580,
      "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
      "problem": {
        "id": "904963b6-f62e-4c70-934b-5474dd65de04",
        "title": "Two Sum",
        "slug": "two-sum",
        "difficulty": "EASY"
      },
      "submittedAt": "2026-01-28T12:00:00.000Z",
      "createdAt": "2026-01-28T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 3,
    "totalPages": 1
  }
}
```

---

### Get Submission Statistics

```http
GET /submissions/problem/:problemId/stats
```

**Description:** Get detailed statistics for submissions on a specific problem for the current user.

**Parameters:**

- `problemId` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token>
```

**Example:**

```http
GET /submissions/problem/904963b6-f62e-4c70-934b-5474dd65de04/stats
```

**Success Response (200):**

```json
{
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
  "totalSubmissions": 5,
  "acceptedCount": 2,
  "rejectedCount": 3,
  "acceptanceRate": "40%",
  "latestSubmission": {
    "id": "sub-123",
    "status": "ACCEPTED",
    "submittedAt": "2026-01-28T12:00:00.000Z"
  },
  "firstAcceptedSubmission": {
    "id": "sub-121",
    "language": "javascript",
    "submittedAt": "2026-01-28T11:00:00.000Z"
  },
  "statusBreakdown": {
    "ACCEPTED": 2,
    "WRONG_ANSWER": 2,
    "RUNTIME_ERROR": 1,
    "COMPILE_ERROR": 0
  },
  "languageBreakdown": {
    "javascript": 3,
    "python": 2
  },
  "averageExecutionTime": 542,
  "averagePassedTestCases": 3.5
}
```

---

### Get Single Submission

```http
GET /submissions/:id
```

**Description:** Retrieve detailed information for a single submission. Users can only view their own submissions unless they are lecturers or admins.

**Parameters:**

- `id` (string, required): Submission UUID

**Headers:**

```
Authorization: Bearer <access_token>
```

**Example:**

```http
GET /submissions/sub-123
```

**Success Response (200):**

```json
{
  "id": "sub-123",
  "language": "javascript",
  "languageVersion": "18.15.0",
  "sourceCode": "const input = require('fs').readFileSync(0, 'utf-8').trim().split('\\n');\n...",
  "status": "ACCEPTED",
  "totalTestCases": 4,
  "passedTestCases": 4,
  "failedTestCases": 0,
  "isCompileError": false,
  "executionTime": 580,
  "networkTime": 120,
  "totalTime": 700,
  "compileOutput": null,
  "errorMessage": null,
  "testCaseResults": [
    {
      "testCaseId": "tc-1",
      "input": "2 7 11 15\n9",
      "expectedOutput": "[0,1]",
      "actualOutput": "[0,1]",
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
      "input": "3 2 4\n6",
      "expectedOutput": "[1,2]",
      "actualOutput": "[1,2]",
      "isCorrect": true,
      "isHidden": false,
      "isSample": true,
      "order": 2,
      "executionTime": 142,
      "passed": true,
      "message": "Accepted"
    },
    {
      "testCaseId": "tc-3",
      "input": "[Hidden]",
      "expectedOutput": "[Hidden]",
      "actualOutput": "[Hidden]",
      "isCorrect": true,
      "isHidden": true,
      "isSample": false,
      "order": 3,
      "executionTime": 148,
      "passed": true,
      "message": "Accepted"
    },
    {
      "testCaseId": "tc-4",
      "input": "[Hidden]",
      "expectedOutput": "[Hidden]",
      "actualOutput": "[Hidden]",
      "isCorrect": true,
      "isHidden": true,
      "isSample": false,
      "order": 4,
      "executionTime": 145,
      "passed": true,
      "message": "Accepted"
    }
  ],
  "userId": "user-123",
  "user": {
    "id": "user-123",
    "email": "student@student.iuh.edu.vn",
    "role": "STUDENT"
  },
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
  "problem": {
    "id": "904963b6-f62e-4c70-934b-5474dd65de04",
    "title": "Two Sum",
    "slug": "two-sum",
    "difficulty": "EASY",
    "timeLimit": 1000,
    "memoryLimit": 256
  },
  "submittedAt": "2026-01-28T12:00:00.000Z",
  "createdAt": "2026-01-28T12:00:00.000Z"
}
```

**Error Response (404):**

```json
{
  "statusCode": 404,
  "message": "Submission not found",
  "error": "Not Found"
}
```

**Error Response (403):**

```json
{
  "statusCode": 403,
  "message": "You don't have permission to view this submission",
  "error": "Forbidden"
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "statusCode": 400,
  "message": ["Validation error messages"],
  "error": "Bad Request"
}
```

### 401 Unauthorized

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 403 Forbidden

```json
{
  "statusCode": 403,
  "message": "You don't have permission to perform this action",
  "error": "Forbidden"
}
```

### 404 Not Found

```json
{
  "statusCode": 404,
  "message": "Resource not found",
  "error": "Not Found"
}
```

---

## Notes

1. **Authorization**:
   - Students can only view their own submissions
   - Lecturers and admins can view submissions from all users
   - All endpoints require valid JWT authentication

2. **Source Code**: The full source code is included in the detailed submission response but not in list responses to reduce payload size.

3. **Hidden Test Cases**: Hidden test cases show `[Hidden]` in both input and expected output to prevent cheating.

4. **Pagination**: All list endpoints support pagination with `page` and `limit` query parameters.

5. **Sorting**: Results can be sorted by various fields in ascending or descending order.

6. **Statistics**: The `/stats` endpoint provides aggregated data about user submissions for a specific problem.

---

## Example Requests (cURL)

### Create Submission

```bash
curl -X POST http://localhost:3000/submissions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "javascript",
    "sourceCode": "console.log(\"Hello\");",
    "problemId": "904963b6-f62e-4c70-934b-5474dd65de04"
  }'
```

### Get All Submissions

```bash
curl http://localhost:3000/submissions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Submissions for a Problem

```bash
curl "http://localhost:3000/submissions/problem/904963b6-f62e-4c70-934b-5474dd65de04?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Submission Statistics

```bash
curl http://localhost:3000/submissions/problem/904963b6-f62e-4c70-934b-5474dd65de04/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Single Submission

```bash
curl http://localhost:3000/submissions/sub-123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Filter Submissions by Status

```bash
curl "http://localhost:3000/submissions?page=1&limit=10&status=ACCEPTED&order=desc" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Filter Submissions by Language

```bash
curl "http://localhost:3000/submissions?language=javascript&sortBy=createdAt" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
