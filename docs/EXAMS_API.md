# Exams API - API Quản lý Đề thi

API quản lý đề thi tự động, bao gồm: tạo đề (random câu hỏi/bài code), lưu đề, bắt đầu phiên thi với thứ tự xáo trộn, tự động chấm điểm trắc nghiệm, và chấm tay cho tự luận/code.

## Models

### Exam (Đề thi)

| Field                             | Type              | Description                          |
| --------------------------------- | ----------------- | ------------------------------------ |
| id                                | uuid              | ID đề thi                            |
| title                             | string            | Tiêu đề đề thi                       |
| description                       | string?           | Mô tả                                |
| questionCount                     | int               | Số câu hỏi trắc nghiệm/tự luận       |
| problemCount                      | int               | Số bài code                          |
| duration                          | int               | Thời gian làm bài (phút)             |
| difficulty                        | EASY/MEDIUM/HARD? | Mức độ khó (tùy chọn)                |
| includeProblemsRelatedToQuestions | boolean           | Bài code cùng môn/chủ đề với câu hỏi |
| isPublished                       | boolean           | Trạng thái công bố                   |
| subjectId                         | uuid?             | Môn học                              |
| topicId                           | uuid?             | Chủ đề                               |
| creatorId                         | uuid              | Người tạo                            |

### ExamItem (Mục trong đề thi)

| Field      | Type             | Description                    |
| ---------- | ---------------- | ------------------------------ |
| id         | uuid             | ID                             |
| examId     | uuid             | Đề thi                         |
| questionId | uuid?            | Câu hỏi (nếu section=QUESTION) |
| problemId  | uuid?            | Bài code (nếu section=PROBLEM) |
| section    | QUESTION/PROBLEM | Loại mục                       |
| order      | int              | Thứ tự gốc (chưa xáo trộn)     |
| points     | float            | Điểm                           |

### ExamSession (Phiên thi)

| Field      | Type                         | Description                      |
| ---------- | ---------------------------- | -------------------------------- |
| id         | uuid                         | ID phiên                         |
| examId     | uuid                         | Đề thi                           |
| userId     | uuid                         | Sinh viên                        |
| seed       | int                          | Seed để xáo trộn (deterministic) |
| startedAt  | datetime                     | Thời gian bắt đầu                |
| finishedAt | datetime?                    | Thời gian nộp                    |
| score      | float?                       | Điểm hiện tại                    |
| maxScore   | float?                       | Điểm tối đa                      |
| status     | IN_PROGRESS/SUBMITTED/GRADED | Trạng thái                       |

### ExamSessionAnswer (Câu trả lời)

| Field             | Type     | Description                |
| ----------------- | -------- | -------------------------- |
| id                | uuid     | ID                         |
| sessionId         | uuid     | Phiên thi                  |
| examItemId        | uuid     | Mục đề thi                 |
| selectedChoiceIds | string[] | Đáp án đã chọn (MC)        |
| textAnswer        | string?  | Câu trả lời tự luận        |
| submissionId      | string?  | ID submission (code)       |
| isCorrect         | boolean? | Kết quả (null = chưa chấm) |
| score             | float?   | Điểm (null = chưa chấm)    |

---

## Endpoints

Tất cả endpoint yêu cầu JWT authentication (`Authorization: Bearer <token>`).  
Base path: `/api/exams`

---

### 1. Tạo đề thi (Generate & Save)

```
POST /api/exams
```

Hoặc dùng endpoint rõ nghiệp vụ:

```
POST /api/exams/create-random
POST /api/exams/create-manual
```

**Auth:** LECTURER, ADMIN

**Request Body:**

```json
{
  "title": "Đề thi Toán rời rạc - Giữa kỳ",
  "description": "Đề thi giữa kỳ môn Toán rời rạc",
  "subjectId": "uuid-of-subject",
  "topicId": "uuid-of-topic",
  "generationMode": "RANDOM",
  "allocationPolicy": "STRICT",
  "questionCount": 20,
  "questionAllocationRules": [
    { "subjectId": "uuid-subject-a", "difficulty": "EASY", "count": 8 },
    { "subjectId": "uuid-subject-b", "difficulty": "HARD", "count": 12 }
  ],
  "questionDifficultyDistribution": {
    "easy": 5,
    "medium": 10,
    "hard": 5
  },
  "problemCount": 3,
  "includeProblemsRelatedToQuestions": true,
  "difficulty": "MEDIUM",
  "duration": 60,
  "shuffleQuestions": true,
  "shuffleChoices": true
}
```

`allocationPolicy`:
- `STRICT` (mặc định): yêu cầu đủ đúng phân bổ/số lượng, thiếu dữ liệu thì trả lỗi.
- `FLEXIBLE`: nếu thiếu theo bucket độ khó, hệ thống sẽ lấy bổ sung ngẫu nhiên từ bucket khác trong cùng bộ lọc subject/topic.

`questionAllocationRules` (tuỳ chọn):
- Dùng khi muốn chia số lượng câu theo từng môn (và có thể chỉ định độ khó từng môn).
- Nếu có `questionAllocationRules`, tổng `count` của các rule phải bằng `questionCount`.
- Khi `difficulty` trong rule để trống, hệ thống dùng `difficulty` chung của đề (nếu có).

**Request Body (MANUAL):**

```json
{
  "title": "Đề thi thủ công - Chương 1",
  "description": "Giảng viên chọn trực tiếp câu hỏi",
  "generationMode": "MANUAL",
  "subjectId": "uuid-of-subject",
  "topicId": "uuid-of-topic",
  "questionIds": ["uuid-q1", "uuid-q2", "uuid-q3"],
  "problemIds": ["uuid-p1"],
  "duration": 45,
  "shuffleQuestions": true,
  "shuffleChoices": true
}
```

**Response (201):**

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "exam-uuid",
    "title": "Đề thi Toán rời rạc - Giữa kỳ",
    "description": "Đề thi giữa kỳ môn Toán rời rạc",
    "questionCount": 20,
    "problemCount": 3,
    "duration": 60,
    "difficulty": "MEDIUM",
    "includeProblemsRelatedToQuestions": true,
    "isPublished": false,
    "subject": { "id": "...", "name": "Toán rời rạc" },
    "topic": { "id": "...", "name": "Đồ thị" },
    "items": [
      {
        "id": "item-uuid",
        "section": "QUESTION",
        "order": 0,
        "points": 1.0,
        "question": {
          "id": "question-uuid",
          "content": "Câu hỏi...",
          "questionType": "SINGLE_CHOICE",
          "difficulty": "MEDIUM",
          "choices": [{ "id": "choice-uuid", "content": "A. ...", "order": 0 }]
        }
      }
    ],
    "sessionCount": 0,
    "createdAt": "2026-03-01T...",
    "updatedAt": "2026-03-01T..."
  }
}
```

**Errors:**

- `400` - Không đủ câu hỏi/bài code phù hợp
- `400` - RANDOM mode có truyền questionIds/problemIds hoặc MANUAL mode sai payload
- `403` - Không có quyền tạo đề thi
- `404` - Môn học/chủ đề không tồn tại

---

### 2. Danh sách đề thi

```
GET /api/exams?page=1&limit=10&subjectId=...&difficulty=MEDIUM&search=...&isPublished=true&sortBy=createdAt&sortOrder=desc
```

**Auth:** Tất cả (sinh viên chỉ xem đề đã công bố)

**Response (200):**

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "data": [...],
    "total": 15,
    "page": 1,
    "limit": 10,
    "totalPages": 2
  }
}
```

---

### 3. Chi tiết đề thi

```
GET /api/exams/:id
```

**Auth:** Tất cả (sinh viên chỉ xem đề đã công bố)

---

### 4. Cập nhật đề thi

```
PATCH /api/exams/:id
```

**Auth:** LECTURER (chủ đề), ADMIN

**Request Body:**

```json
{
  "title": "Tên mới",
  "description": "Mô tả mới",
  "duration": 90,
  "isPublished": true
}
```

---

### 5. Xóa đề thi

```
DELETE /api/exams/:id
```

**Auth:** LECTURER (chủ đề), ADMIN

---

### 6. Bắt đầu phiên thi

```
POST /api/exams/:id/start
```

**Auth:** STUDENT (hoặc bất kỳ user nào)

Tạo phiên thi mới với seed ngẫu nhiên. Nếu đã có phiên đang IN_PROGRESS thì resume.

**Response (201):**

```json
{
  "statusCode": 201,
  "message": "Success",
  "data": {
    "id": "session-uuid",
    "examId": "exam-uuid",
    "examTitle": "Đề thi Toán rời rạc",
    "duration": 60,
    "status": "IN_PROGRESS",
    "startedAt": "2026-03-01T...",
    "finishedAt": null,
    "score": null,
    "maxScore": 23.0,
    "questionItems": [
      {
        "id": "item-uuid",
        "section": "QUESTION",
        "order": 0,
        "points": 1.0,
        "question": {
          "id": "q-uuid",
          "content": "Câu hỏi (đã xáo trộn thứ tự)...",
          "questionType": "SINGLE_CHOICE",
          "difficulty": "MEDIUM",
          "choices": [{ "id": "c-uuid", "content": "Đáp án (đã xáo trộn)...", "order": 0 }]
        }
      }
    ],
    "problemItems": [
      {
        "id": "item-uuid",
        "section": "PROBLEM",
        "order": 0,
        "points": 1.0,
        "problem": {
          "id": "p-uuid",
          "title": "Two Sum",
          "slug": "two-sum",
          "description": "...",
          "difficulty": "EASY"
        }
      }
    ],
    "answers": []
  }
}
```

**Lưu ý:** Thứ tự câu hỏi và đáp án được xáo trộn dựa trên seed. Mỗi sinh viên có seed khác nhau → thứ tự khác nhau. Cùng sinh viên resume → thứ tự y hệt.

**Errors:**

- `403` - Đề thi chưa công bố
- `409` - Đã hoàn thành đề thi này rồi

---

### 7. Xem phiên thi (Resume)

```
GET /api/exams/sessions/:sessionId
```

**Auth:** Chủ phiên

---

### 8. Lưu câu trả lời (Auto-save)

```
POST /api/exams/sessions/:sessionId/answers
```

**Auth:** Chủ phiên

**Request Body:**

```json
{
  "examItemId": "item-uuid",
  "selectedChoiceIds": ["choice-uuid-1", "choice-uuid-2"],
  "textAnswer": "Câu trả lời tự luận",
  "submissionId": "submission-uuid"
}
```

---

### 9. Nộp bài

```
POST /api/exams/sessions/:sessionId/submit
```

**Auth:** Chủ phiên

Tự động chấm điểm trắc nghiệm (SINGLE_CHOICE, MULTIPLE_CHOICE). Tự luận (SHORT_ANSWER) và bài code (PROBLEM) để chờ giảng viên chấm.

**Response (200):**

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "id": "session-uuid",
    "examId": "exam-uuid",
    "examTitle": "...",
    "status": "SUBMITTED",
    "score": 15.0,
    "maxScore": 23.0,
    "totalItems": 23,
    "correctItems": 15,
    "pendingItems": 3,
    "items": [
      {
        "examItemId": "item-uuid",
        "section": "QUESTION",
        "points": 1.0,
        "isCorrect": true,
        "score": 1.0
      },
      {
        "examItemId": "item-uuid",
        "section": "PROBLEM",
        "points": 1.0,
        "isCorrect": null,
        "score": null
      }
    ]
  }
}
```

---

### 10. Xem kết quả

```
GET /api/exams/sessions/:sessionId/results
```

**Auth:** Chủ phiên hoặc LECTURER/ADMIN

---

### 11. Chấm điểm thủ công

```
PATCH /api/exams/sessions/:sessionId/grade
```

**Auth:** LECTURER, ADMIN

**Request Body:**

```json
{
  "items": [
    {
      "examItemId": "item-uuid",
      "score": 0.5,
      "isCorrect": false
    }
  ]
}
```

Sau khi tất cả câu đều đã chấm, trạng thái phiên sẽ chuyển sang `GRADED`.

---

## Shuffle Algorithm

Hệ thống sử dụng thuật toán **Fisher-Yates Shuffle** kết hợp **Mulberry32 PRNG** (seeded pseudo-random number generator):

- Mỗi phiên thi có 1 `seed` (số nguyên ngẫu nhiên)
- Cùng seed → cùng thứ tự xáo trộn (deterministic)
- Câu hỏi và bài code được xáo trộn riêng biệt (2 section)
- Đáp án của mỗi câu hỏi MC cũng được xáo trộn (sub-seed = seed + itemIndex + 2)
- Sinh viên khác nhau → seed khác nhau → thứ tự khác nhau
- Cùng sinh viên resume → seed y hệt → thứ tự y hệt
