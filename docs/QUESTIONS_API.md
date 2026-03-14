# Questions API (Ngân hàng câu hỏi trắc nghiệm)

API quản lý ngân hàng câu hỏi trắc nghiệm, hỗ trợ 3 loại câu hỏi: một đáp án (ABCD), nhiều đáp án, và tự luận ngắn.

**Base URL:** `/api/questions`

## Models

### QuestionType Enum

| Value             | Description                    |
| ----------------- | ------------------------------ |
| `SINGLE_CHOICE`   | Câu hỏi một đáp án đúng (ABCD) |
| `MULTIPLE_CHOICE` | Câu hỏi nhiều đáp án đúng      |
| `SHORT_ANSWER`    | Câu hỏi tự luận ngắn           |

### Difficulty Enum

| Value    | Description |
| -------- | ----------- |
| `EASY`   | Dễ          |
| `MEDIUM` | Trung bình  |
| `HARD`   | Khó         |

---

## Subject Endpoints (Môn học)

### Create Subject

**POST** `/api/questions/subjects`

**Auth:** JWT (LECTURER, ADMIN)

**Request Body:**

```json
{
  "name": "Lập trình hướng đối tượng",
  "description": "Các khái niệm OOP cơ bản đến nâng cao"
}
```

**Response (201):**

```json
{
  "statusCode": 201,
  "message": "",
  "data": {
    "id": "uuid",
    "name": "Lập trình hướng đối tượng",
    "description": "Các khái niệm OOP cơ bản đến nâng cao",
    "topicCount": 0,
    "questionCount": 0,
    "createdAt": "2026-02-26T00:00:00.000Z",
    "updatedAt": "2026-02-26T00:00:00.000Z"
  }
}
```

### List All Subjects

**GET** `/api/questions/subjects`

**Auth:** JWT (any role)

**Response (200):**

```json
{
  "statusCode": 200,
  "message": "",
  "data": [
    {
      "id": "uuid",
      "name": "Lập trình hướng đối tượng",
      "description": "...",
      "topicCount": 3,
      "questionCount": 10,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### Update Subject

**PUT** `/api/questions/subjects/:id`

**Auth:** JWT (LECTURER, ADMIN)

**Request Body:**

```json
{
  "name": "Lập trình hướng đối tượng (OOP)",
  "description": "Updated description"
}
```

### Delete Subject

**DELETE** `/api/questions/subjects/:id`

**Auth:** JWT (ADMIN only)

> ⚠️ Cannot delete a subject that still has questions. Move/delete questions first.

---

## Topic Endpoints (Chủ đề)

### Create Topic

**POST** `/api/questions/subjects/:subjectId/topics`

**Auth:** JWT (LECTURER, ADMIN)

**Request Body:**

```json
{
  "name": "Kế thừa"
}
```

**Response (201):**

```json
{
  "statusCode": 201,
  "message": "",
  "data": {
    "id": "uuid",
    "name": "Kế thừa",
    "subjectId": "uuid",
    "questionCount": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### List Topics by Subject

**GET** `/api/questions/subjects/:subjectId/topics`

**Auth:** JWT (any role)

### Update Topic

**PUT** `/api/questions/topics/:id`

**Auth:** JWT (LECTURER, ADMIN)

### Delete Topic

**DELETE** `/api/questions/topics/:id`

**Auth:** JWT (ADMIN only)

> ⚠️ Cannot delete a topic that still has questions.

---

## Question Endpoints (Câu hỏi)

### Create Question

**POST** `/api/questions`

**Auth:** JWT (LECTURER, ADMIN)

#### Single Choice (ABCD) Example:

```json
{
  "content": "Trong lập trình hướng đối tượng, tính đóng gói là gì?",
  "questionType": "SINGLE_CHOICE",
  "difficulty": "EASY",
  "subjectId": "uuid-of-subject",
  "topicId": "uuid-of-topic",
  "explanation": "Tính đóng gói là che giấu thông tin bên trong đối tượng.",
  "isPublished": true,
  "choices": [
    {
      "content": "Che giấu thông tin và dữ liệu bên trong đối tượng",
      "isCorrect": true,
      "order": 0
    },
    { "content": "Tạo nhiều đối tượng từ một lớp", "isCorrect": false, "order": 1 },
    { "content": "Kế thừa thuộc tính từ lớp cha", "isCorrect": false, "order": 2 },
    {
      "content": "Cho phép phương thức hoạt động khác nhau tùy đối tượng",
      "isCorrect": false,
      "order": 3
    }
  ]
}
```

#### Multiple Choice Example:

```json
{
  "content": "Chọn các tính chất cơ bản của OOP:",
  "questionType": "MULTIPLE_CHOICE",
  "difficulty": "MEDIUM",
  "subjectId": "uuid-of-subject",
  "choices": [
    { "content": "Đóng gói", "isCorrect": true, "order": 0 },
    { "content": "Kế thừa", "isCorrect": true, "order": 1 },
    { "content": "Đa hình", "isCorrect": true, "order": 2 },
    { "content": "Đệ quy", "isCorrect": false, "order": 3 }
  ]
}
```

#### Short Answer Example:

```json
{
  "content": "Dạng chuẩn nào yêu cầu loại bỏ phụ thuộc bắc cầu?",
  "questionType": "SHORT_ANSWER",
  "difficulty": "MEDIUM",
  "subjectId": "uuid-of-subject",
  "correctAnswer": "3NF",
  "explanation": "Dạng chuẩn 3 yêu cầu loại bỏ phụ thuộc bắc cầu."
}
```

**Validation Rules:**

- `SINGLE_CHOICE`: Must have at least 2 choices, exactly 1 correct
- `MULTIPLE_CHOICE`: Must have at least 2 choices, at least 2 correct
- `SHORT_ANSWER`: Must have `correctAnswer` field

**Response (201):**

```json
{
  "statusCode": 201,
  "message": "",
  "data": {
    "id": "uuid",
    "content": "...",
    "questionType": "SINGLE_CHOICE",
    "difficulty": "EASY",
    "correctAnswer": null,
    "explanation": "...",
    "isPublished": true,
    "subjectId": "uuid",
    "topicId": "uuid",
    "creatorId": "uuid",
    "subject": { "id": "uuid", "name": "Lập trình hướng đối tượng", "...": "..." },
    "topic": { "id": "uuid", "name": "Kế thừa", "...": "..." },
    "choices": [
      { "id": "uuid", "content": "...", "isCorrect": true, "order": 0 },
      { "id": "uuid", "content": "...", "isCorrect": false, "order": 1 }
    ],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### List Questions (Paginated)

**GET** `/api/questions`

**Auth:** JWT (any role — students only see published questions)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page (max 100) |
| `questionType` | string | - | Filter: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `SHORT_ANSWER` |
| `difficulty` | string | - | Filter: `EASY`, `MEDIUM`, `HARD` |
| `subjectId` | string (UUID) | - | Filter by subject |
| `topicId` | string (UUID) | - | Filter by topic |
| `search` | string | - | Search in question content |
| `isPublished` | string | - | Filter: `true` or `false` (ignored for students) |
| `sortBy` | string | `createdAt` | Sort: `createdAt`, `difficulty`, `questionType` |
| `sortOrder` | string | `desc` | Sort order: `asc`, `desc` |

**Response (200):**

```json
{
  "statusCode": 200,
  "message": "",
  "data": {
    "data": [
      {
        "id": "uuid",
        "content": "...",
        "questionType": "SINGLE_CHOICE",
        "difficulty": "EASY",
        "isPublished": true,
        "subjectId": "uuid",
        "topicId": "uuid",
        "subject": { "id": "uuid", "name": "OOP" },
        "topic": { "id": "uuid", "name": "Kế thừa" },
        "choiceCount": 4,
        "createdAt": "..."
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

### Get Question Detail

**GET** `/api/questions/:id`

**Auth:** JWT (any role)

> **Note:** Students cannot see `correctAnswer`, `explanation`, or `isCorrect` on choices.

### Update Question

**PUT** `/api/questions/:id`

**Auth:** JWT (LECTURER — own questions only, ADMIN — any)

**Request Body:** Same as Create but all fields are optional. If `choices` is provided, all existing choices are replaced.

### Delete Question

**DELETE** `/api/questions/:id`

**Auth:** JWT (LECTURER — own questions only, ADMIN — any)

**Response (200):**

```json
{
  "statusCode": 200,
  "message": "",
  "data": { "message": "Xóa câu hỏi thành công" }
}
```

### Toggle Publish Status

**PATCH** `/api/questions/:id/publish`

**Auth:** JWT (LECTURER — own questions only, ADMIN — any)

Toggles `isPublished` between `true` and `false`.

---

## Error Responses

All errors follow the standard format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": {
    "content": ["Nội dung câu hỏi không được để trống"],
    "choices": ["Câu hỏi một đáp án phải có đúng 1 đáp án đúng"]
  }
}
```

| Status | Scenario                                                                            |
| ------ | ----------------------------------------------------------------------------------- |
| 400    | Validation errors, topic not in subject, cannot delete subject/topic with questions |
| 401    | Missing/invalid JWT token                                                           |
| 403    | Insufficient role or not the owner                                                  |
| 404    | Subject/Topic/Question not found                                                    |
| 409    | Duplicate subject name or topic name within subject                                 |
