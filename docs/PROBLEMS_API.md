# Problems API Documentation

## Base URL

```
http://localhost:3000
```

## Overview

The Problems API provides endpoints for managing coding problems (challenges), including CRUD operations and test case management. Only authenticated users (lecturers and admins) can create and modify problems. Students can view public problems.

---

## Problem Levels

Problems are classified by difficulty:

- **EASY**: Beginner level problems
- **MEDIUM**: Intermediate level problems
- **HARD**: Advanced level problems

---

## Problem Endpoints

### Create Problem

```http
POST /problems
```

**Description:** Create a new coding problem. Only lecturers and admins can create problems.

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "Two Sum",
  "slug": "two-sum",
  "description": "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to the target.\n\nYou may assume that each input has exactly one solution, and you may not use the same element twice.",
  "difficulty": "EASY",
  "constraints": "- 2 <= nums.length <= 10^4\n- -10^9 <= nums[i] <= 10^9\n- -10^9 <= target <= 10^9",
  "hints": ["A really brute force way would be to search for all possible pairs of numbers but that would be too slow. Again, it's best to try out brute force solutions for just for completeness. It might just sell you the interview.\n\nSo, if we fix one of the numbers say,\nxand we want to know if there exists another number such that\nx + another_number = target\n\nAnother way to phrase it is another_number = target -x\nSo, the problem reduces to finding if target - x exists in the array and it is not the same element that we used."],
  "timeLimit": 1000,
  "memoryLimit": 256,
  "starterCode": {
    "javascript": "/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nvar twoSum = function(nums, target) {\n    \n};",
    "python": "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass"
  }
}
```

**Field Descriptions:**

| Field         | Type              | Required | Description                                   |
| ------------- | ----------------- | -------- | --------------------------------------------- |
| title         | string            | Yes      | Problem title                                 |
| slug          | string            | Yes      | URL-friendly slug (unique)                    |
| description   | string            | Yes      | Detailed problem description                  |
| difficulty    | enum              | No       | EASY, MEDIUM, HARD (default: MEDIUM)          |
| constraints   | string            | No       | Problem constraints and limits                |
| hints         | string[]          | No       | Array of hints for solving the problem        |
| timeLimit     | number            | No       | Time limit in milliseconds (default: 1000)    |
| memoryLimit   | number            | No       | Memory limit in MB (default: 256)             |
| starterCode   | object            | No       | Starter code templates by language            |

**Success Response (201):**

```json
{
  "id": "904963b6-f62e-4c70-934b-5474dd65de04",
  "title": "Two Sum",
  "slug": "two-sum",
  "description": "Given an array of integers...",
  "difficulty": "EASY",
  "constraints": "- 2 <= nums.length <= 10^4\n...",
  "hints": ["A really brute force way..."],
  "timeLimit": 1000,
  "memoryLimit": 256,
  "starterCode": {...},
  "totalSubmissions": 0,
  "acceptedSubmissions": 0,
  "isPublished": false,
  "createdAt": "2026-01-28T10:00:00.000Z",
  "updatedAt": "2026-01-28T10:00:00.000Z",
  "creator": {
    "id": "user-id",
    "email": "lecturer@student.iuh.edu.vn"
  }
}
```

**Error Response (401/403):**

```json
{
  "statusCode": 403,
  "message": "Only lecturers and admins can create problems",
  "error": "Forbidden"
}
```

---

### Get All Problems

```http
GET /problems
```

**Description:** Retrieve all problems with pagination and filtering. Students see only published problems; lecturers/admins see their own and published problems.

**Query Parameters:**

| Parameter  | Type    | Default | Description                    |
| ---------- | ------- | ------- | ------------------------------ |
| page       | number  | 1       | Page number for pagination     |
| limit      | number  | 10      | Items per page                 |
| difficulty | string  | -       | Filter by difficulty (EASY/MEDIUM/HARD) |
| search     | string  | -       | Search in title and description |
| sorted     | string  | -       | Sort field (title, difficulty, createdAt) |
| order      | string  | asc     | Sort order (asc/desc)          |

**Example:**

```http
GET /problems?page=1&limit=10&difficulty=EASY&search=sum&order=asc
```

**Headers:**

```
Authorization: Bearer <access_token> (optional for public problems)
```

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "904963b6-f62e-4c70-934b-5474dd65de04",
      "title": "Two Sum",
      "slug": "two-sum",
      "description": "Given an array of integers...",
      "difficulty": "EASY",
      "totalSubmissions": 45,
      "acceptedSubmissions": 32,
      "isPublished": true,
      "createdAt": "2026-01-28T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "totalPages": 15
  }
}
```

---

### Get Problem by Slug

```http
GET /problems/slug/:slug
```

**Description:** Retrieve a specific problem by its slug.

**Parameters:**

- `slug` (string, required): URL-friendly problem identifier

**Example:**

```http
GET /problems/slug/two-sum
```

**Headers:**

```
Authorization: Bearer <access_token> (optional)
```

**Success Response (200):**

```json
{
  "id": "904963b6-f62e-4c70-934b-5474dd65de04",
  "title": "Two Sum",
  "slug": "two-sum",
  "description": "Given an array of integers...",
  "difficulty": "EASY",
  "constraints": "...",
  "hints": ["..."],
  "timeLimit": 1000,
  "memoryLimit": 256,
  "starterCode": {
    "javascript": "var twoSum = function(nums, target) {...}",
    "python": "class Solution:\n    def twoSum(self, nums, target):\n        pass"
  },
  "totalSubmissions": 45,
  "acceptedSubmissions": 32,
  "isPublished": true,
  "createdAt": "2026-01-28T10:00:00.000Z",
  "creator": {
    "id": "user-id",
    "email": "lecturer@student.iuh.edu.vn"
  }
}
```

**Error Response (404):**

```json
{
  "statusCode": 404,
  "message": "Problem not found",
  "error": "Not Found"
}
```

---

### Get Problem by ID

```http
GET /problems/:id
```

**Description:** Retrieve a specific problem by its ID.

**Parameters:**

- `id` (string, required): Problem UUID

**Example:**

```http
GET /problems/904963b6-f62e-4c70-934b-5474dd65de04
```

**Headers:**

```
Authorization: Bearer <access_token> (optional)
```

**Success Response (200):** Same as Get Problem by Slug

**Error Response (404):**

```json
{
  "statusCode": 404,
  "message": "Problem not found",
  "error": "Not Found"
}
```

---

### Update Problem

```http
PATCH /problems/:id
```

**Description:** Update a problem. Only the creator, lecturers, and admins can update.

**Parameters:**

- `id` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:** (All fields optional)

```json
{
  "title": "Two Sum (Updated)",
  "description": "Updated description...",
  "difficulty": "MEDIUM",
  "constraints": "Updated constraints...",
  "hints": ["Updated hint 1", "Updated hint 2"],
  "timeLimit": 2000,
  "memoryLimit": 512,
  "starterCode": {
    "javascript": "// Updated starter code"
  },
  "isPublished": true
}
```

**Success Response (200):**

```json
{
  "id": "904963b6-f62e-4c70-934b-5474dd65de04",
  "title": "Two Sum (Updated)",
  "description": "Updated description...",
  "difficulty": "MEDIUM",
  "isPublished": true,
  "updatedAt": "2026-01-28T11:00:00.000Z"
  // ... other fields
}
```

**Error Response (403):**

```json
{
  "statusCode": 403,
  "message": "You don't have permission to update this problem",
  "error": "Forbidden"
}
```

---

### Delete Problem

```http
DELETE /problems/:id
```

**Description:** Delete a problem and all associated test cases and submissions. Only creator, lecturers, and admins can delete.

**Parameters:**

- `id` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token>
```

**Success Response (200):**

```json
{
  "message": "Problem deleted successfully"
}
```

**Error Response (403):**

```json
{
  "statusCode": 403,
  "message": "You don't have permission to delete this problem",
  "error": "Forbidden"
}
```

---

## Test Case Endpoints

### Create Test Case

```http
POST /problems/:problemId/testcases
```

**Description:** Create a single test case for a problem.

**Parameters:**

- `problemId` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "input": "2 7 11 15\n9",
  "expectedOutput": "[0,1]",
  "explanation": "nums[0] + nums[1] == 9, so we return [0, 1].",
  "isHidden": false,
  "isSample": true,
  "order": 1
}
```

**Field Descriptions:**

| Field           | Type    | Required | Description                           |
| --------------- | ------- | -------- | ------------------------------------- |
| input           | string  | Yes      | Test case input data                  |
| expectedOutput  | string  | Yes      | Expected output                       |
| explanation     | string  | No       | Explanation (shown only if not hidden) |
| isHidden        | boolean | No       | Hidden from user (default: false)     |
| isSample        | boolean | No       | Sample test case (default: false)     |
| order           | number  | No       | Order of test case                    |

**Success Response (201):**

```json
{
  "id": "tc-123",
  "problemId": "904963b6-f62e-4c70-934b-5474dd65de04",
  "input": "2 7 11 15\n9",
  "expectedOutput": "[0,1]",
  "explanation": "nums[0] + nums[1] == 9, so we return [0, 1].",
  "isHidden": false,
  "isSample": true,
  "order": 1,
  "createdAt": "2026-01-28T10:15:00.000Z"
}
```

---

### Create Bulk Test Cases

```http
POST /problems/:problemId/testcases/bulk
```

**Description:** Create multiple test cases at once.

**Parameters:**

- `problemId` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "testCases": [
    {
      "input": "2 7 11 15\n9",
      "expectedOutput": "[0,1]",
      "explanation": "Sample test case 1",
      "isSample": true,
      "order": 1
    },
    {
      "input": "3 2 4\n6",
      "expectedOutput": "[1,2]",
      "explanation": "Sample test case 2",
      "isSample": true,
      "order": 2
    },
    {
      "input": "3000000 3\n4\n3",
      "expectedOutput": "[0,2]",
      "isHidden": true,
      "order": 3
    }
  ]
}
```

**Success Response (201):**

```json
{
  "created": 3,
  "testCases": [
    {
      "id": "tc-123",
      "input": "2 7 11 15\n9",
      "expectedOutput": "[0,1]",
      "order": 1
    },
    // ... more test cases
  ]
}
```

---

### Get Test Cases

```http
GET /problems/:problemId/testcases
```

**Description:** Retrieve all test cases for a problem. Hidden test cases are not shown to non-creators.

**Parameters:**

- `problemId` (string, required): Problem UUID

**Headers:**

```
Authorization: Bearer <access_token> (optional)
```

**Success Response (200):**

```json
{
  "testCases": [
    {
      "id": "tc-123",
      "input": "2 7 11 15\n9",
      "expectedOutput": "[0,1]",
      "explanation": "nums[0] + nums[1] == 9, so we return [0, 1].",
      "isHidden": false,
      "isSample": true,
      "order": 1
    },
    {
      "id": "tc-124",
      "input": "3 2 4\n6",
      "expectedOutput": "[1,2]",
      "explanation": "Sample test case 2",
      "isHidden": false,
      "isSample": true,
      "order": 2
    }
    // Hidden test cases not shown to students
  ],
  "total": 3,
  "sampleTestCases": 2,
  "hiddenTestCases": 1
}
```

---

### Update Test Case

```http
PATCH /problems/testcases/:testCaseId
```

**Description:** Update a specific test case.

**Parameters:**

- `testCaseId` (string, required): Test Case UUID

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:** (All fields optional)

```json
{
  "input": "2 7 11 15\n9",
  "expectedOutput": "[0,1]",
  "explanation": "Updated explanation",
  "isHidden": false,
  "isSample": true,
  "order": 1
}
```

**Success Response (200):**

```json
{
  "id": "tc-123",
  "input": "2 7 11 15\n9",
  "expectedOutput": "[0,1]",
  "explanation": "Updated explanation",
  "isHidden": false,
  "isSample": true,
  "order": 1,
  "updatedAt": "2026-01-28T11:00:00.000Z"
}
```

---

### Delete Test Case

```http
DELETE /problems/testcases/:testCaseId
```

**Description:** Delete a specific test case.

**Parameters:**

- `testCaseId` (string, required): Test Case UUID

**Headers:**

```
Authorization: Bearer <access_token>
```

**Success Response (200):**

```json
{
  "message": "Test case deleted successfully"
}
```

---

## Notes

1. **Problem Creation**: Only lecturers and admins can create problems. Students can only view published problems.

2. **Slug Requirements**: Problem slugs must be unique and contain only lowercase letters, numbers, and hyphens.

3. **Test Cases**: 
   - Sample test cases are visible to all users
   - Hidden test cases are only visible to the problem creator and admins
   - Test cases are executed in order when running submissions

4. **Starter Code**: The `starterCode` field is a JSON object where keys are language names and values are code templates.

5. **Problem Publishing**: Problems can be created in unpublished state and published later by updating `isPublished: true`.

6. **Statistics**: `totalSubmissions` and `acceptedSubmissions` are automatically updated when submissions are made.

---

## Example Requests (cURL)

### Create Problem

```bash
curl -X POST http://localhost:3000/problems \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Two Sum",
    "slug": "two-sum",
    "description": "Given an array of integers nums and an integer target...",
    "difficulty": "EASY",
    "timeLimit": 1000,
    "memoryLimit": 256
  }'
```

### Get All Problems

```bash
curl http://localhost:3000/problems?page=1&limit=10&difficulty=EASY
```

### Get Problem by Slug

```bash
curl http://localhost:3000/problems/slug/two-sum
```

### Update Problem

```bash
curl -X PATCH http://localhost:3000/problems/904963b6-f62e-4c70-934b-5474dd65de04 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "difficulty": "MEDIUM",
    "isPublished": true
  }'
```

### Create Test Case

```bash
curl -X POST http://localhost:3000/problems/904963b6-f62e-4c70-934b-5474dd65de04/testcases \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "2 7 11 15\n9",
    "expectedOutput": "[0,1]",
    "explanation": "nums[0] + nums[1] == 9",
    "isSample": true,
    "order": 1
  }'
```

### Get Test Cases

```bash
curl http://localhost:3000/problems/904963b6-f62e-4c70-934b-5474dd65de04/testcases \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Delete Problem

```bash
curl -X DELETE http://localhost:3000/problems/904963b6-f62e-4c70-934b-5474dd65de04 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
