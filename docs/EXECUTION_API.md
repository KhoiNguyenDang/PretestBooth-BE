# Execution API Documentation

## Base URL

```
http://localhost:3000
```

## Overview

The Execution API provides endpoints for executing and testing code using the [Piston](https://github.com/engineer-man/piston) sandboxed environment. This API supports running arbitrary code, testing against single test cases, and submitting solutions for full evaluation.

---

## Supported Languages

The Piston API supports many programming languages. Common ones include:

| Language   | Aliases     | Example Extension |
| ---------- | ----------- | ----------------- |
| javascript | js, node    | .js               |
| typescript | ts          | .ts               |
| python     | py, python3 | .py               |
| java       | -           | .java             |
| c          | gcc         | .c                |
| cpp        | c++, g++    | .cpp              |
| csharp     | cs, c#      | .cs               |
| go         | golang      | .go               |
| rust       | rs          | .rs               |
| ruby       | rb          | .rb               |
| php        | -           | .php              |

Use `GET /execution/languages` to get the full list with versions.

---

## Endpoints

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
  },
  {
    "language": "java",
    "version": "15.0.1"
  }
]
```

---

### Execute Code

```http
POST /execution/run
```

**Description:** Execute code directly without test cases. Useful for playground/testing environments.

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

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

**Field Descriptions:**

| Field              | Type     | Required | Default | Description                           |
| ------------------ | -------- | -------- | ------- | ------------------------------------- |
| language           | string   | Yes      | -       | Programming language                  |
| version            | string   | No       | "\*"    | Language version ("\*" for latest)    |
| source             | string   | Yes      | -       | Source code to execute                |
| stdin              | string   | No       | ""      | Standard input                        |
| args               | string[] | No       | []      | Command line arguments                |
| compileTimeout     | number   | No       | 10000   | Compile timeout in milliseconds       |
| runTimeout         | number   | No       | 5000    | Execution timeout in milliseconds     |
| compileMemoryLimit | number   | No       | -1      | Compile memory limit (-1 = unlimited) |
| runMemoryLimit     | number   | No       | -1      | Run memory limit (-1 = unlimited)     |

**Success Response (200):**

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

**Response Field Descriptions:**

| Field          | Type    | Description                       |
| -------------- | ------- | --------------------------------- |
| stdout         | string  | Standard output                   |
| stderr         | string  | Standard error                    |
| output         | string  | Combined output                   |
| exitCode       | number  | Process exit code                 |
| signal         | string  | Signal name if terminated         |
| isSuccess      | boolean | Whether execution was successful  |
| isCompileError | boolean | Whether there was a compile error |
| executionTime  | number  | Code execution time (ms)          |
| networkTime    | number  | Network latency (ms)              |
| totalTime      | number  | Total time (execution + network)  |

**Error Response (400):**

```json
{
  "statusCode": 400,
  "message": "Language not supported",
  "error": "Bad Request"
}
```

---

### Run Single Test Case

```http
POST /execution/test
```

**Description:** Run code against a single test case with expected output comparison.

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

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

**Field Descriptions:**

| Field          | Type   | Required | Default | Description            |
| -------------- | ------ | -------- | ------- | ---------------------- |
| language       | string | Yes      | -       | Programming language   |
| version        | string | No       | "\*"    | Language version       |
| source         | string | Yes      | -       | Source code            |
| input          | string | Yes      | -       | Test input             |
| expectedOutput | string | Yes      | -       | Expected output        |
| runTimeout     | number | No       | 5000    | Execution timeout (ms) |

**Success Response (200):**

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

**Response Field Descriptions:**

| Field         | Type    | Description             |
| ------------- | ------- | ----------------------- |
| isCorrect     | boolean | Output matches expected |
| actualOutput  | string  | Actual program output   |
| passed        | boolean | Test case passed        |
| message       | string  | Result message          |
| executionTime | number  | Execution time (ms)     |

---

### Submit Code

```http
POST /execution/submit
```

**Description:** Submit code for evaluation against all test cases of a problem. Returns detailed results for each test case.

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

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

**Field Descriptions:**

| Field      | Type          | Required | Description                          |
| ---------- | ------------- | -------- | ------------------------------------ |
| language   | string        | Yes      | Programming language                 |
| version    | string        | No       | Language version ("\*" for latest)   |
| source     | string        | Yes      | Source code                          |
| problemId  | string (UUID) | Yes      | ID of the problem to test against    |
| runTimeout | number        | No       | Execution timeout per test case (ms) |

**Success Response (200):**

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
      "input": "[3,2,4]\n6",
      "expectedOutput": "[1,2]",
      "actualOutput": "[1, 2]",
      "stdout": "[1, 2]",
      "stderr": "",
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
      "stdout": "[Hidden]",
      "stderr": "",
      "isCorrect": true,
      "isHidden": true,
      "isSample": false,
      "order": 4,
      "executionTime": 142,
      "passed": true,
      "message": "Accepted"
    },
    {
      "testCaseId": "tc-4",
      "input": "[Hidden]",
      "expectedOutput": "[Hidden]",
      "actualOutput": "[Hidden]",
      "stdout": "[Hidden]",
      "stderr": "",
      "isCorrect": true,
      "isHidden": true,
      "isSample": false,
      "order": 5,
      "executionTime": 148,
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

**Response Field Descriptions:**

| Field              | Type    | Description                     |
| ------------------ | ------- | ------------------------------- |
| totalTestCases     | number  | Total number of test cases      |
| passedTestCases    | number  | Number of passed test cases     |
| failedTestCases    | number  | Number of failed test cases     |
| isAllPassed        | boolean | All test cases passed           |
| isCompileError     | boolean | Compilation failed              |
| totalExecutionTime | number  | Sum of all execution times (ms) |
| totalNetworkTime   | number  | Total network time (ms)         |
| totalTime          | number  | Total time (ms)                 |
| status             | string  | Overall submission status       |

**Submission Status Values:**

| Status                | Description                   |
| --------------------- | ----------------------------- |
| ACCEPTED              | All test cases passed         |
| WRONG_ANSWER          | Output doesn't match expected |
| COMPILE_ERROR         | Code failed to compile        |
| RUNTIME_ERROR         | Code crashed during execution |
| TIME_LIMIT_EXCEEDED   | Execution exceeded time limit |
| MEMORY_LIMIT_EXCEEDED | Memory usage exceeded limit   |

**Error Responses:**

```json
{
  "statusCode": 404,
  "message": "Problem not found",
  "error": "Not Found"
}
```

---

## Notes

1. **Timeout Configuration**:
   - Default run timeout is 5000ms per test case
   - Compile timeout is typically 10000ms
   - Can be customized per request

2. **Hidden Test Cases**: Hidden test cases show `[Hidden]` in the output to prevent cheating.

3. **Standard Input**: Use `\n` for newlines in input strings.

4. **Memory and Compile Limits**: Use `-1` for unlimited memory.

5. **Version Specification**: Use `"*"` to request the latest available version.

6. **Authorization**: All execution endpoints require a valid JWT token.

---

## Example Requests (cURL)

### Get Available Languages

```bash
curl http://localhost:3000/execution/languages
```

### Run Simple Code

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

### Run Single Test Case

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

### Submit Solution

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

## Complete Workflow Example

### 1. Login to get token

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "student@example.com", "password": "password123"}'
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
