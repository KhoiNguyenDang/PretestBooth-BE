# Database Seed Data

This seed script populates the database with sample users and coding problems.

## How to Run

```bash
npm run prisma:seed
```

## Seeded Data

### Users

1. **Admin User**
   - Email: `admin@iuh.edu.vn`
   - Password: `admin123`
   - Role: ADMIN
   - Email Verified: ✅

2. **Teacher User**
   - Email: `12345678.nguyen@teacher.iuh.edu.vn`
   - Password: `teacher123`
   - Role: LECTURER
   - Email Verified: ✅

### Problems (6 problems with test cases)

1. **Two Sum** (EASY)
   - 5 test cases (3 sample, 2 hidden)
   - Focus: Hash map, Array

2. **Palindrome Number** (EASY)
   - 5 test cases (3 sample, 2 hidden)
   - Focus: Math, String manipulation

3. **Reverse String** (EASY)
   - 3 test cases (2 sample, 1 hidden)
   - Focus: Two pointers, Array

4. **Valid Parentheses** (MEDIUM)
   - 5 test cases (3 sample, 2 hidden)
   - Focus: Stack, String

5. **Maximum Subarray** (MEDIUM)
   - 4 test cases (3 sample, 1 hidden)
   - Focus: Dynamic Programming, Kadane's Algorithm

6. **Merge Two Sorted Lists** (HARD)
   - 3 test cases (all sample)
   - Focus: Linked List, Two Pointers

## Features

- All problems have Vietnamese descriptions
- Starter code templates for JavaScript, Python, and Java
- Sample test cases visible to students
- Hidden test cases for evaluation
- Hints system for each problem
- Time and memory limits configured
- All problems are published and ready to use

## Accessing the Problems

After seeding, you can:

- View all problems at `/problems` endpoint
- Access individual problems at `/problems/slug/{slug}`
- Example: `/problems/slug/two-sum`

## Re-running the Seed

The seed script uses `upsert` operations, so it's safe to run multiple times. It will:

- Create records if they don't exist
- Skip existing records (based on unique constraints)
