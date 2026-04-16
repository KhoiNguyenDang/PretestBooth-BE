import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PASSWORDS = {
  admin: 'admin123',
  lecturer: 'teacher123',
  student: 'student123',
} as const;

const IDS = {
  users: {
    admin: '11111111-1111-4111-8111-000000000001',
    lecturerSuperAdmin: '11111111-1111-4111-8111-000000000002',
    lecturerExamManager: '11111111-1111-4111-8111-000000000003',
    studentVerified: '11111111-1111-4111-8111-000000000004',
    studentPending: '11111111-1111-4111-8111-000000000005',
  },
  roles: {
    superAdmin: '22222222-2222-4222-8222-000000000001',
    examManager: '22222222-2222-4222-8222-000000000002',
    monitor: '22222222-2222-4222-8222-000000000003',
  },
  questions: {
    oopEncapsulation: '33333333-3333-4333-8333-000000000001',
    javaInheritance: '33333333-3333-4333-8333-000000000002',
    oopCorePillars: '33333333-3333-4333-8333-000000000003',
    sqlSelect: '33333333-3333-4333-8333-000000000004',
    normalization3nf: '33333333-3333-4333-8333-000000000005',
    arrayAccess: '33333333-3333-4333-8333-000000000006',
    sqlJoinTypes: '33333333-3333-4333-8333-000000000007',
    bstProperty: '33333333-3333-4333-8333-000000000008',
    polymorphism: '33333333-3333-4333-8333-000000000009',
    sortingNlogN: '33333333-3333-4333-8333-000000000010',
    practiceTwoPointers: '33333333-3333-4333-8333-000000000011',
    practiceComplexity: '33333333-3333-4333-8333-000000000012',
    practiceSqlOrderBy: '33333333-3333-4333-8333-000000000013',
    practiceOopAbstract: '33333333-3333-4333-8333-000000000014',
  },
  exams: {
    officialExam: '44444444-4444-4444-8444-000000000001',
    practiceExam: '44444444-4444-4444-8444-000000000002',
    mockExam: '44444444-4444-4444-8444-000000000003',
  },
} as const;

type LecturerPermissionKey =
  | 'CREATE_EXAM'
  | 'REVIEW_QUESTION'
  | 'MANAGE_QUESTION_BANK'
  | 'MANAGE_STUDENTS'
  | 'MANAGE_BOOTHS'
  | 'MONITOR_SESSIONS'
  | 'LECTURER_ADMIN';

type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';
type QuestionTypeKey = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
type QuestionClassificationKey = 'EXAM' | 'PRACTICE';
type ExamTypeKey = 'EXAM' | 'PRACTICE';

interface RoleSeed {
  id: string;
  code: string;
  name: string;
  description: string;
  priority: number;
  permissions: LecturerPermissionKey[];
}

interface TopicSeed {
  key: string;
  name: string;
}

interface SubjectSeed {
  key: string;
  name: string;
  description: string;
  topics: TopicSeed[];
}

interface ProblemTestCaseSeed {
  input: string;
  expectedOutput: string;
  explanation?: string;
  isHidden: boolean;
  isSample: boolean;
  order: number;
}

interface ProblemSeed {
  title: string;
  slug: string;
  description: string;
  difficulty: DifficultyLevel;
  starterCode: {
    javascript: string;
    python: string;
    java: string;
  };
  constraints: string;
  hints: string[];
  timeLimit: number;
  memoryLimit: number;
  functionName: string;
  inputTypes: string[];
  outputType: string;
  argNames: string[];
  subjectKey: string;
  topicKey: string;
  testCases: ProblemTestCaseSeed[];
}

interface QuestionChoiceSeed {
  content: string;
  isCorrect: boolean;
  order: number;
}

interface QuestionSeed {
  id: string;
  content: string;
  questionType: QuestionTypeKey;
  classification: QuestionClassificationKey;
  difficulty: DifficultyLevel;
  correctAnswer?: string | null;
  explanation?: string | null;
  isPublished: boolean;
  subjectKey: string;
  topicKey?: string;
  choices?: QuestionChoiceSeed[];
}

interface ExamSeed {
  id: string;
  title: string;
  description: string;
  type: ExamTypeKey;
  duration: number;
  difficulty: DifficultyLevel | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  isPublished: boolean;
  allowStudentReviewResults: boolean;
  passingScoreAbsolute: number | null;
  subjectKey?: string;
  topicKey?: string;
  questionIds: string[];
  problemSlugs: string[];
}

const ROLE_SEEDS: RoleSeed[] = [
  {
    id: IDS.roles.superAdmin,
    code: 'LECTURER_SUPER_ADMIN',
    name: 'Lecturer Super Admin',
    description: 'Full lecturer permissions including lecturer-admin actions',
    priority: 10,
    permissions: [
      'CREATE_EXAM',
      'REVIEW_QUESTION',
      'MANAGE_QUESTION_BANK',
      'MANAGE_STUDENTS',
      'MANAGE_BOOTHS',
      'MONITOR_SESSIONS',
      'LECTURER_ADMIN',
    ],
  },
  {
    id: IDS.roles.examManager,
    code: 'LECTURER_EXAM_MANAGER',
    name: 'Lecturer Exam Manager',
    description: 'Can create exams and manage question/problem banks',
    priority: 20,
    permissions: ['CREATE_EXAM', 'REVIEW_QUESTION', 'MANAGE_QUESTION_BANK', 'MONITOR_SESSIONS'],
  },
  {
    id: IDS.roles.monitor,
    code: 'LECTURER_MONITOR',
    name: 'Lecturer Monitor',
    description: 'Can monitor sessions and manage booths',
    priority: 30,
    permissions: ['MONITOR_SESSIONS', 'MANAGE_BOOTHS'],
  },
];

const SUBJECT_SEEDS: SubjectSeed[] = [
  {
    key: 'OOP',
    name: 'Lập trình hướng đối tượng',
    description: 'Các khái niệm và nguyên lý cốt lõi của lập trình hướng đối tượng',
    topics: [
      { key: 'OOP_BASICS', name: 'Khái niệm cơ bản' },
      { key: 'OOP_INHERITANCE', name: 'Kế thừa' },
      { key: 'OOP_POLYMORPHISM', name: 'Đa hình' },
    ],
  },
  {
    key: 'DSA',
    name: 'Cấu trúc dữ liệu & Giải thuật',
    description: 'Nền tảng cấu trúc dữ liệu và thuật toán',
    topics: [
      { key: 'DSA_ARRAY', name: 'Mảng & Chuỗi' },
      { key: 'DSA_SORTING', name: 'Sắp xếp' },
      { key: 'DSA_TREE', name: 'Cây' },
    ],
  },
  {
    key: 'DB',
    name: 'Cơ sở dữ liệu',
    description: 'Truy vấn, chuẩn hóa và thiết kế hệ cơ sở dữ liệu quan hệ',
    topics: [
      { key: 'DB_SQL', name: 'SQL cơ bản' },
      { key: 'DB_NORMALIZATION', name: 'Chuẩn hóa' },
    ],
  },
];

const PROBLEM_SEEDS: ProblemSeed[] = [
  {
    title: 'Two Sum',
    slug: 'two-sum',
    description:
      'Cho một mảng số nguyên nums và target. Trả về chỉ số của hai phần tử có tổng bằng target.',
    difficulty: 'EASY',
    starterCode: {
      javascript: `function twoSum(nums, target) {\n  // Write your solution here\n}`,
      python: `def two_sum(nums, target):\n    # Write your solution here\n    pass`,
      java: `class Solution {\n  public int[] twoSum(int[] nums, int target) {\n    // Write your solution here\n  }\n}`,
    },
    constraints:
      '- 2 <= nums.length <= 10^4\n- -10^9 <= nums[i], target <= 10^9\n- Exactly one valid answer exists.',
    hints: [
      'Use a hash map to store values that you have seen.',
      'For each number, check whether target - current exists in the map.',
    ],
    timeLimit: 1000,
    memoryLimit: 256,
    functionName: 'twoSum',
    inputTypes: ['int[]', 'int'],
    outputType: 'int[]',
    argNames: ['nums', 'target'],
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
    testCases: [
      {
        input: '[2,7,11,15], 9',
        expectedOutput: '[0,1]',
        explanation: '2 + 7 = 9',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        input: '[3,2,4], 6',
        expectedOutput: '[1,2]',
        explanation: '2 + 4 = 6',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        input: '[3,3], 6',
        expectedOutput: '[0,1]',
        isHidden: true,
        isSample: false,
        order: 3,
      },
    ],
  },
  {
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    description:
      'Cho chuỗi chỉ gồm ký tự ngoặc (), {}, []. Xác định chuỗi có hợp lệ hay không.',
    difficulty: 'MEDIUM',
    starterCode: {
      javascript: `function isValid(s) {\n  // Write your solution here\n}`,
      python: `def is_valid(s):\n    # Write your solution here\n    pass`,
      java: `class Solution {\n  public boolean isValid(String s) {\n    // Write your solution here\n  }\n}`,
    },
    constraints: '- 1 <= s.length <= 10^4\n- s only contains ()[]{}',
    hints: [
      'Use a stack to track opening brackets.',
      'Each closing bracket must match the latest opening bracket.',
    ],
    timeLimit: 1000,
    memoryLimit: 256,
    functionName: 'isValid',
    inputTypes: ['String'],
    outputType: 'boolean',
    argNames: ['s'],
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
    testCases: [
      { input: '"()"', expectedOutput: 'true', isHidden: false, isSample: true, order: 1 },
      { input: '"()[]{}"', expectedOutput: 'true', isHidden: false, isSample: true, order: 2 },
      { input: '"([)]"', expectedOutput: 'false', isHidden: true, isSample: false, order: 3 },
    ],
  },
  {
    title: 'Maximum Subarray',
    slug: 'maximum-subarray',
    description: 'Tìm tổng lớn nhất của một mảng con liên tiếp trong mảng số nguyên.',
    difficulty: 'MEDIUM',
    starterCode: {
      javascript: `function maxSubArray(nums) {\n  // Write your solution here\n}`,
      python: `def max_sub_array(nums):\n    # Write your solution here\n    pass`,
      java: `class Solution {\n  public int maxSubArray(int[] nums) {\n    // Write your solution here\n  }\n}`,
    },
    constraints: '- 1 <= nums.length <= 10^5\n- -10^4 <= nums[i] <= 10^4',
    hints: ['Use Kadane algorithm.', 'At each index choose extend-or-restart strategy.'],
    timeLimit: 1000,
    memoryLimit: 256,
    functionName: 'maxSubArray',
    inputTypes: ['int[]'],
    outputType: 'int',
    argNames: ['nums'],
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
    testCases: [
      {
        input: '[-2,1,-3,4,-1,2,1,-5,4]',
        expectedOutput: '6',
        explanation: 'Subarray [4,-1,2,1] gives maximum sum.',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      { input: '[1]', expectedOutput: '1', isHidden: false, isSample: true, order: 2 },
      { input: '[-1,-2,-3]', expectedOutput: '-1', isHidden: true, isSample: false, order: 3 },
    ],
  },
  {
    title: 'Reverse String',
    slug: 'reverse-string',
    description: 'Đảo ngược chuỗi ký tự tại chỗ với O(1) bộ nhớ bổ sung.',
    difficulty: 'EASY',
    starterCode: {
      javascript: `function reverseString(s) {\n  // Write your solution here\n}`,
      python: `def reverse_string(s):\n    # Write your solution here\n    pass`,
      java: `class Solution {\n  public void reverseString(char[] s) {\n    // Write your solution here\n  }\n}`,
    },
    constraints: '- 1 <= s.length <= 10^5',
    hints: ['Use two pointers.', 'Swap first and last, then move inward.'],
    timeLimit: 1000,
    memoryLimit: 256,
    functionName: 'reverseString',
    inputTypes: ['String[]'],
    outputType: 'String[]',
    argNames: ['s'],
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
    testCases: [
      {
        input: '["h","e","l","l","o"]',
        expectedOutput: '["o","l","l","e","h"]',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        input: '["H","a","n","n","a","h"]',
        expectedOutput: '["h","a","n","n","a","H"]',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      { input: '["a"]', expectedOutput: '["a"]', isHidden: true, isSample: false, order: 3 },
    ],
  },
  {
    title: 'Merge Two Sorted Lists',
    slug: 'merge-sorted-lists',
    description: 'Hợp nhất hai danh sách liên kết tăng dần thành một danh sách tăng dần.',
    difficulty: 'HARD',
    starterCode: {
      javascript: `function mergeTwoLists(list1, list2) {\n  // Write your solution here\n}`,
      python: `def merge_two_lists(list1, list2):\n    # Write your solution here\n    pass`,
      java: `class Solution {\n  public ListNode mergeTwoLists(ListNode list1, ListNode list2) {\n    // Write your solution here\n  }\n}`,
    },
    constraints:
      '- Number of nodes in both lists is in [0, 50].\n- -100 <= Node.val <= 100\n- Lists are sorted in non-decreasing order.',
    hints: ['Use two pointers and a dummy head node.'],
    timeLimit: 1500,
    memoryLimit: 256,
    functionName: 'mergeTwoLists',
    inputTypes: ['ListNode', 'ListNode'],
    outputType: 'ListNode',
    argNames: ['list1', 'list2'],
    subjectKey: 'DSA',
    topicKey: 'DSA_SORTING',
    testCases: [
      {
        input: '[1,2,4], [1,3,4]',
        expectedOutput: '[1,1,2,3,4,4]',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      { input: '[], []', expectedOutput: '[]', isHidden: false, isSample: true, order: 2 },
      { input: '[], [0]', expectedOutput: '[0]', isHidden: true, isSample: false, order: 3 },
    ],
  },
];

const QUESTION_SEEDS: QuestionSeed[] = [
  {
    id: IDS.questions.oopEncapsulation,
    content: 'Trong OOP, tính đóng gói (Encapsulation) là gì?',
    questionType: 'SINGLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'EASY',
    explanation:
      'Đóng gói là che giấu dữ liệu nội bộ và chỉ cho phép truy cập thông qua interface phù hợp.',
    isPublished: true,
    subjectKey: 'OOP',
    topicKey: 'OOP_BASICS',
    choices: [
      { content: 'Che giấu dữ liệu nội bộ của đối tượng', isCorrect: true, order: 0 },
      { content: 'Cho phép một lớp kế thừa nhiều lớp cha', isCorrect: false, order: 1 },
      { content: 'Biến phương thức thành static', isCorrect: false, order: 2 },
      { content: 'Tăng tốc độ biên dịch chương trình', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.javaInheritance,
    content: 'Từ khóa nào dùng để kế thừa lớp trong Java?',
    questionType: 'SINGLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'EASY',
    explanation: 'Java sử dụng từ khóa extends để kế thừa lớp.',
    isPublished: true,
    subjectKey: 'OOP',
    topicKey: 'OOP_INHERITANCE',
    choices: [
      { content: 'inherits', isCorrect: false, order: 0 },
      { content: 'extends', isCorrect: true, order: 1 },
      { content: 'implements', isCorrect: false, order: 2 },
      { content: 'derive', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.oopCorePillars,
    content: 'Chọn các trụ cột chính của OOP (chọn nhiều đáp án):',
    questionType: 'MULTIPLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'MEDIUM',
    explanation: '4 trụ cột OOP gồm: encapsulation, inheritance, polymorphism, abstraction.',
    isPublished: true,
    subjectKey: 'OOP',
    topicKey: 'OOP_BASICS',
    choices: [
      { content: 'Encapsulation', isCorrect: true, order: 0 },
      { content: 'Inheritance', isCorrect: true, order: 1 },
      { content: 'Polymorphism', isCorrect: true, order: 2 },
      { content: 'Abstraction', isCorrect: true, order: 3 },
      { content: 'Concurrency', isCorrect: false, order: 4 },
    ],
  },
  {
    id: IDS.questions.sqlSelect,
    content: 'Lệnh SQL nào dùng để truy xuất dữ liệu từ bảng?',
    questionType: 'SINGLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'EASY',
    explanation: 'SELECT dùng để đọc dữ liệu từ bảng.',
    isPublished: true,
    subjectKey: 'DB',
    topicKey: 'DB_SQL',
    choices: [
      { content: 'SELECT', isCorrect: true, order: 0 },
      { content: 'INSERT', isCorrect: false, order: 1 },
      { content: 'DELETE', isCorrect: false, order: 2 },
      { content: 'MERGE', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.normalization3nf,
    content: 'Dạng chuẩn nào yêu cầu loại bỏ phụ thuộc bắc cầu?',
    questionType: 'SHORT_ANSWER',
    classification: 'EXAM',
    difficulty: 'MEDIUM',
    correctAnswer: '3NF',
    explanation: '3NF loại bỏ phụ thuộc bắc cầu giữa các thuộc tính không khóa.',
    isPublished: true,
    subjectKey: 'DB',
    topicKey: 'DB_NORMALIZATION',
  },
  {
    id: IDS.questions.arrayAccess,
    content: 'Độ phức tạp truy cập phần tử mảng theo chỉ số là bao nhiêu?',
    questionType: 'SINGLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'EASY',
    explanation: 'Mảng truy cập trực tiếp theo index nên là O(1).',
    isPublished: true,
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
    choices: [
      { content: 'O(1)', isCorrect: true, order: 0 },
      { content: 'O(log n)', isCorrect: false, order: 1 },
      { content: 'O(n)', isCorrect: false, order: 2 },
      { content: 'O(n^2)', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.sqlJoinTypes,
    content: 'Các loại JOIN nào phổ biến trong SQL? (chọn nhiều đáp án)',
    questionType: 'MULTIPLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'MEDIUM',
    explanation: 'INNER, LEFT, RIGHT, FULL OUTER và CROSS là các JOIN chuẩn.',
    isPublished: true,
    subjectKey: 'DB',
    topicKey: 'DB_SQL',
    choices: [
      { content: 'INNER JOIN', isCorrect: true, order: 0 },
      { content: 'LEFT JOIN', isCorrect: true, order: 1 },
      { content: 'RIGHT JOIN', isCorrect: true, order: 2 },
      { content: 'FULL OUTER JOIN', isCorrect: true, order: 3 },
      { content: 'DIAGONAL JOIN', isCorrect: false, order: 4 },
    ],
  },
  {
    id: IDS.questions.bstProperty,
    content: 'Trong BST, giá trị nút con bên trái so với nút cha như thế nào?',
    questionType: 'SHORT_ANSWER',
    classification: 'EXAM',
    difficulty: 'EASY',
    correctAnswer: 'nhỏ hơn',
    explanation: 'Trong BST, nhánh trái chứa các giá trị nhỏ hơn node cha.',
    isPublished: true,
    subjectKey: 'DSA',
    topicKey: 'DSA_TREE',
  },
  {
    id: IDS.questions.polymorphism,
    content: 'Overloading và overriding là biểu hiện của tính chất nào trong OOP?',
    questionType: 'SINGLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'MEDIUM',
    explanation: 'Đó là hai dạng thể hiện của polymorphism.',
    isPublished: true,
    subjectKey: 'OOP',
    topicKey: 'OOP_POLYMORPHISM',
    choices: [
      { content: 'Encapsulation', isCorrect: false, order: 0 },
      { content: 'Inheritance', isCorrect: false, order: 1 },
      { content: 'Polymorphism', isCorrect: true, order: 2 },
      { content: 'Abstraction', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.sortingNlogN,
    content: 'Thuật toán nào có độ phức tạp trung bình O(n log n)? (chọn nhiều đáp án)',
    questionType: 'MULTIPLE_CHOICE',
    classification: 'EXAM',
    difficulty: 'MEDIUM',
    explanation: 'Merge Sort, Quick Sort và Heap Sort đều có trung bình O(n log n).',
    isPublished: true,
    subjectKey: 'DSA',
    topicKey: 'DSA_SORTING',
    choices: [
      { content: 'Merge Sort', isCorrect: true, order: 0 },
      { content: 'Quick Sort', isCorrect: true, order: 1 },
      { content: 'Heap Sort', isCorrect: true, order: 2 },
      { content: 'Bubble Sort', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.practiceTwoPointers,
    content: 'Kỹ thuật hai con trỏ thường dùng tốt nhất cho loại bài toán nào?',
    questionType: 'SINGLE_CHOICE',
    classification: 'PRACTICE',
    difficulty: 'EASY',
    explanation: 'Hai con trỏ phù hợp khi xử lý dữ liệu tuyến tính từ hai đầu.',
    isPublished: true,
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
    choices: [
      { content: 'Duyệt mảng/chuỗi từ hai đầu', isCorrect: true, order: 0 },
      { content: 'Duyệt đồ thị theo DFS', isCorrect: false, order: 1 },
      { content: 'Sắp xếp đếm', isCorrect: false, order: 2 },
      { content: 'Nén Huffman', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.practiceComplexity,
    content: 'Chọn các phát biểu đúng về Big-O (chọn nhiều đáp án):',
    questionType: 'MULTIPLE_CHOICE',
    classification: 'PRACTICE',
    difficulty: 'MEDIUM',
    explanation: 'Big-O biểu diễn tốc độ tăng của thuật toán theo kích thước đầu vào.',
    isPublished: true,
    subjectKey: 'DSA',
    topicKey: 'DSA_SORTING',
    choices: [
      { content: 'O(1) là thời gian hằng số', isCorrect: true, order: 0 },
      { content: 'O(log n) tăng chậm hơn O(n)', isCorrect: true, order: 1 },
      { content: 'O(n^2) luôn nhanh hơn O(n)', isCorrect: false, order: 2 },
      { content: 'Big-O không phụ thuộc vào dữ liệu đầu vào', isCorrect: false, order: 3 },
    ],
  },
  {
    id: IDS.questions.practiceSqlOrderBy,
    content: 'Từ khóa SQL nào dùng để sắp xếp kết quả truy vấn?',
    questionType: 'SHORT_ANSWER',
    classification: 'PRACTICE',
    difficulty: 'EASY',
    correctAnswer: 'ORDER BY',
    explanation: 'ORDER BY sắp xếp dữ liệu theo cột tăng dần/giảm dần.',
    isPublished: true,
    subjectKey: 'DB',
    topicKey: 'DB_SQL',
  },
  {
    id: IDS.questions.practiceOopAbstract,
    content: 'Abstraction trong OOP có ý nghĩa gì?',
    questionType: 'SINGLE_CHOICE',
    classification: 'PRACTICE',
    difficulty: 'MEDIUM',
    explanation: 'Abstraction giúp tập trung vào hành vi quan trọng và ẩn chi tiết cài đặt.',
    isPublished: true,
    subjectKey: 'OOP',
    topicKey: 'OOP_BASICS',
    choices: [
      { content: 'Ẩn chi tiết cài đặt, chỉ lộ giao diện cần thiết', isCorrect: true, order: 0 },
      { content: 'Sao chép toàn bộ dữ liệu giữa các object', isCorrect: false, order: 1 },
      { content: 'Bắt buộc mọi class đều static', isCorrect: false, order: 2 },
      { content: 'Giảm số lượng thuộc tính xuống 0', isCorrect: false, order: 3 },
    ],
  },
];

const EXAM_SEEDS: ExamSeed[] = [
  {
    id: IDS.exams.officialExam,
    title: 'Official Exam - Core Fundamentals',
    description: 'Đề thi chính thức tổng hợp kiến thức OOP, DSA và CSDL.',
    type: 'EXAM',
    duration: 60,
    difficulty: 'MEDIUM',
    visibility: 'PUBLIC',
    isPublished: true,
    allowStudentReviewResults: true,
    passingScoreAbsolute: 5,
    questionIds: [
      IDS.questions.oopEncapsulation,
      IDS.questions.javaInheritance,
      IDS.questions.oopCorePillars,
      IDS.questions.sqlSelect,
      IDS.questions.normalization3nf,
      IDS.questions.arrayAccess,
    ],
    problemSlugs: ['two-sum', 'valid-parentheses'],
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
  },
  {
    id: IDS.exams.practiceExam,
    title: 'Practice Exam - Entry Level',
    description: 'Đề luyện tập cho sinh viên mới bắt đầu làm quen hệ thống.',
    type: 'PRACTICE',
    duration: 45,
    difficulty: 'EASY',
    visibility: 'PUBLIC',
    isPublished: true,
    allowStudentReviewResults: true,
    passingScoreAbsolute: null,
    questionIds: [
      IDS.questions.practiceTwoPointers,
      IDS.questions.practiceComplexity,
      IDS.questions.practiceSqlOrderBy,
      IDS.questions.practiceOopAbstract,
    ],
    problemSlugs: ['reverse-string'],
    subjectKey: 'DSA',
    topicKey: 'DSA_ARRAY',
  },
  {
    id: IDS.exams.mockExam,
    title: 'Mock Exam - Advanced Review',
    description: 'Đề thử phục vụ giảng viên kiểm tra chất lượng ngân hàng câu hỏi.',
    type: 'EXAM',
    duration: 75,
    difficulty: 'HARD',
    visibility: 'PRIVATE',
    isPublished: false,
    allowStudentReviewResults: false,
    passingScoreAbsolute: 3,
    questionIds: [
      IDS.questions.sqlJoinTypes,
      IDS.questions.bstProperty,
      IDS.questions.polymorphism,
      IDS.questions.sortingNlogN,
    ],
    problemSlugs: ['maximum-subarray', 'merge-sorted-lists'],
    subjectKey: 'DSA',
    topicKey: 'DSA_SORTING',
  },
];

const BOOTH_POLICY_DEFAULT = {
  bookingMinDaysInAdvance: 7,
  bookingMaxDaysInAdvance: 30,
  bookingCancellationCutoffHours: 12,
  walkInPracticeEnabled: true,
  warnBeforeNextExamMinutes: 15,
  forceLogoutBeforeNextExamMinutes: 5,
  noShowGraceMinutes: 15,
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function createDeterministicEmbedding(seed: number): number[] {
  const vector = Array.from({ length: 512 }, (_, index) => {
    return Math.sin(seed + index / 9) + Math.cos(seed / 3 + index / 7);
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => Number((value / norm).toFixed(8)));
}

function mapByKey<T extends { key: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.key, item]));
}

function requireSubjectId(
  subjectByKey: Map<string, { id: string; name: string }>,
  subjectKey: string,
): string {
  const subject = subjectByKey.get(subjectKey);
  if (!subject) {
    throw new Error(`Missing subject key: ${subjectKey}`);
  }
  return subject.id;
}

function requireTopicId(topicByKey: Map<string, { id: string; name: string }>, topicKey: string): string {
  const topic = topicByKey.get(topicKey);
  if (!topic) {
    throw new Error(`Missing topic key: ${topicKey}`);
  }
  return topic.id;
}

async function seedRolesAndPermissions(adminUserId: string) {
  const roleMap = new Map<string, { id: string; code: string }>();

  for (const roleSeed of ROLE_SEEDS) {
    const role = await prisma.lecturerRole.upsert({
      where: { code: roleSeed.code },
      update: {
        name: roleSeed.name,
        description: roleSeed.description,
        priority: roleSeed.priority,
        isActive: true,
        createdByUserId: adminUserId,
      },
      create: {
        id: roleSeed.id,
        code: roleSeed.code,
        name: roleSeed.name,
        description: roleSeed.description,
        priority: roleSeed.priority,
        isActive: true,
        createdByUserId: adminUserId,
      },
    });

    await prisma.lecturerRolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { notIn: roleSeed.permissions },
      },
    });

    for (const permission of roleSeed.permissions) {
      await prisma.lecturerRolePermission.upsert({
        where: {
          roleId_permission: {
            roleId: role.id,
            permission,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permission,
        },
      });
    }

    roleMap.set(roleSeed.code, { id: role.id, code: role.code });
  }

  return roleMap;
}

async function seedSubjectsAndTopics() {
  const subjectByKey = new Map<string, { id: string; name: string }>();
  const topicByKey = new Map<string, { id: string; name: string }>();

  for (const subjectSeed of SUBJECT_SEEDS) {
    const subject = await prisma.subject.upsert({
      where: { name: subjectSeed.name },
      update: {
        description: subjectSeed.description,
      },
      create: {
        name: subjectSeed.name,
        description: subjectSeed.description,
      },
    });

    subjectByKey.set(subjectSeed.key, { id: subject.id, name: subject.name });

    for (const topicSeed of subjectSeed.topics) {
      const topic = await prisma.topic.upsert({
        where: {
          subjectId_name: {
            subjectId: subject.id,
            name: topicSeed.name,
          },
        },
        update: {},
        create: {
          name: topicSeed.name,
          subjectId: subject.id,
        },
      });

      topicByKey.set(topicSeed.key, { id: topic.id, name: topic.name });
    }
  }

  return { subjectByKey, topicByKey };
}

async function seedProblems(
  creatorId: string,
  subjectByKey: Map<string, { id: string; name: string }>,
  topicByKey: Map<string, { id: string; name: string }>,
) {
  const problemBySlug = new Map<string, { id: string; slug: string }>();

  for (const seed of PROBLEM_SEEDS) {
    const subjectId = requireSubjectId(subjectByKey, seed.subjectKey);
    const topicId = requireTopicId(topicByKey, seed.topicKey);

    const problem = await prisma.problem.upsert({
      where: { slug: seed.slug },
      update: {
        title: seed.title,
        description: seed.description,
        difficulty: seed.difficulty,
        starterCode: seed.starterCode,
        constraints: seed.constraints,
        hints: seed.hints,
        timeLimit: seed.timeLimit,
        memoryLimit: seed.memoryLimit,
        functionName: seed.functionName,
        inputTypes: seed.inputTypes,
        outputType: seed.outputType,
        argNames: seed.argNames,
        isPublished: true,
        creatorId,
        subjectId,
        topicId,
      },
      create: {
        title: seed.title,
        slug: seed.slug,
        description: seed.description,
        difficulty: seed.difficulty,
        starterCode: seed.starterCode,
        constraints: seed.constraints,
        hints: seed.hints,
        timeLimit: seed.timeLimit,
        memoryLimit: seed.memoryLimit,
        functionName: seed.functionName,
        inputTypes: seed.inputTypes,
        outputType: seed.outputType,
        argNames: seed.argNames,
        isPublished: true,
        creatorId,
        subjectId,
        topicId,
      },
    });

    await prisma.testCase.deleteMany({ where: { problemId: problem.id } });

    if (seed.testCases.length > 0) {
      await prisma.testCase.createMany({
        data: seed.testCases.map((testCase) => ({
          problemId: problem.id,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          explanation: testCase.explanation,
          isHidden: testCase.isHidden,
          isSample: testCase.isSample,
          order: testCase.order,
        })),
      });
    }

    problemBySlug.set(seed.slug, { id: problem.id, slug: problem.slug });
  }

  return problemBySlug;
}

async function seedQuestions(
  creatorId: string,
  subjectByKey: Map<string, { id: string; name: string }>,
  topicByKey: Map<string, { id: string; name: string }>,
) {
  const questionById = new Map<string, { id: string }>();

  for (const seed of QUESTION_SEEDS) {
    const subjectId = requireSubjectId(subjectByKey, seed.subjectKey);
    const topicId = seed.topicKey ? requireTopicId(topicByKey, seed.topicKey) : null;

    const question = await prisma.question.upsert({
      where: { id: seed.id },
      update: {
        content: seed.content,
        questionType: seed.questionType,
        classification: seed.classification,
        difficulty: seed.difficulty,
        correctAnswer: seed.correctAnswer ?? null,
        explanation: seed.explanation ?? null,
        isPublished: seed.isPublished,
        subjectId,
        topicId,
        creatorId,
      },
      create: {
        id: seed.id,
        content: seed.content,
        questionType: seed.questionType,
        classification: seed.classification,
        difficulty: seed.difficulty,
        correctAnswer: seed.correctAnswer ?? null,
        explanation: seed.explanation ?? null,
        isPublished: seed.isPublished,
        subjectId,
        topicId,
        creatorId,
      },
    });

    await prisma.questionChoice.deleteMany({ where: { questionId: question.id } });

    if (seed.choices && seed.choices.length > 0) {
      await prisma.questionChoice.createMany({
        data: seed.choices.map((choice) => ({
          questionId: question.id,
          content: choice.content,
          isCorrect: choice.isCorrect,
          order: choice.order,
        })),
      });
    }

    questionById.set(question.id, { id: question.id });
  }

  return questionById;
}

async function seedExams(
  creatorId: string,
  subjectByKey: Map<string, { id: string; name: string }>,
  topicByKey: Map<string, { id: string; name: string }>,
  questionById: Map<string, { id: string }>,
  problemBySlug: Map<string, { id: string; slug: string }>,
) {
  const publishedAt = daysAgo(1);

  for (const seed of EXAM_SEEDS) {
    for (const questionId of seed.questionIds) {
      if (!questionById.has(questionId)) {
        throw new Error(`Exam ${seed.title} references unknown question ID: ${questionId}`);
      }
    }

    const resolvedProblemIds = seed.problemSlugs.map((slug) => {
      const problem = problemBySlug.get(slug);
      if (!problem) {
        throw new Error(`Exam ${seed.title} references unknown problem slug: ${slug}`);
      }
      return problem.id;
    });

    const subjectId = seed.subjectKey ? requireSubjectId(subjectByKey, seed.subjectKey) : null;
    const topicId = seed.topicKey ? requireTopicId(topicByKey, seed.topicKey) : null;

    const exam = await prisma.exam.upsert({
      where: { id: seed.id },
      update: {
        title: seed.title,
        description: seed.description,
        type: seed.type,
        questionCount: seed.questionIds.length,
        problemCount: resolvedProblemIds.length,
        duration: seed.duration,
        difficulty: seed.difficulty,
        includeProblemsRelatedToQuestions: true,
        shuffleQuestions: true,
        shuffleChoices: true,
        visibility: seed.visibility,
        isPublished: seed.isPublished,
        publishAt: seed.isPublished ? publishedAt : null,
        publishedAt: seed.isPublished ? publishedAt : null,
        allowStudentReviewResults: seed.allowStudentReviewResults,
        passingScoreAbsolute: seed.type === 'EXAM' ? seed.passingScoreAbsolute : null,
        subjectId,
        topicId,
        creatorId,
      },
      create: {
        id: seed.id,
        title: seed.title,
        description: seed.description,
        type: seed.type,
        questionCount: seed.questionIds.length,
        problemCount: resolvedProblemIds.length,
        duration: seed.duration,
        difficulty: seed.difficulty,
        includeProblemsRelatedToQuestions: true,
        shuffleQuestions: true,
        shuffleChoices: true,
        visibility: seed.visibility,
        isPublished: seed.isPublished,
        publishAt: seed.isPublished ? publishedAt : null,
        publishedAt: seed.isPublished ? publishedAt : null,
        allowStudentReviewResults: seed.allowStudentReviewResults,
        passingScoreAbsolute: seed.type === 'EXAM' ? seed.passingScoreAbsolute : null,
        subjectId,
        topicId,
        creatorId,
      },
    });

    await prisma.examItem.deleteMany({ where: { examId: exam.id } });

    const questionItems = seed.questionIds.map((questionId, index) => ({
      examId: exam.id,
      questionId,
      problemId: null,
      section: 'QUESTION' as const,
      order: index,
      points: 1,
    }));

    const problemItems = resolvedProblemIds.map((problemId, index) => ({
      examId: exam.id,
      questionId: null,
      problemId,
      section: 'PROBLEM' as const,
      order: seed.questionIds.length + index,
      points: 1,
    }));

    const items = [...questionItems, ...problemItems];
    if (items.length > 0) {
      await prisma.examItem.createMany({ data: items });
    }
  }
}

async function seedBooths() {
  const boothSeeds = [
    {
      name: 'Booth A01',
      code: 'A01',
      description: 'Main booth for scheduled EXAM sessions',
      location: 'Building A - Floor 2',
      status: 'ACTIVE' as const,
    },
    {
      name: 'Booth A02',
      code: 'A02',
      description: 'Booth for PRACTICE and overflow sessions',
      location: 'Building A - Floor 2',
      status: 'ACTIVE' as const,
    },
    {
      name: 'Booth B01',
      code: 'B01',
      description: 'Backup booth for maintenance windows',
      location: 'Building B - Floor 1',
      status: 'MAINTENANCE' as const,
    },
  ];

  for (const booth of boothSeeds) {
    await prisma.booth.upsert({
      where: { name: booth.name },
      update: {
        code: booth.code,
        description: booth.description,
        location: booth.location,
        status: booth.status,
      },
      create: {
        name: booth.name,
        code: booth.code,
        description: booth.description,
        location: booth.location,
        status: booth.status,
      },
    });
  }
}

async function seedBookingDurations() {
  const durationSeeds = [
    { type: 'EXAM' as const, durationMinutes: 60, isActive: true, displayOrder: 1 },
    { type: 'EXAM' as const, durationMinutes: 90, isActive: true, displayOrder: 2 },
    { type: 'EXAM' as const, durationMinutes: 120, isActive: true, displayOrder: 3 },
    { type: 'PRACTICE' as const, durationMinutes: 30, isActive: true, displayOrder: 1 },
    { type: 'PRACTICE' as const, durationMinutes: 60, isActive: true, displayOrder: 2 },
    { type: 'PRACTICE' as const, durationMinutes: 90, isActive: true, displayOrder: 3 },
  ];

  for (const option of durationSeeds) {
    await prisma.bookingDurationOption.upsert({
      where: {
        type_durationMinutes: {
          type: option.type,
          durationMinutes: option.durationMinutes,
        },
      },
      update: {
        isActive: option.isActive,
        displayOrder: option.displayOrder,
      },
      create: {
        type: option.type,
        durationMinutes: option.durationMinutes,
        isActive: option.isActive,
        displayOrder: option.displayOrder,
      },
    });
  }
}

async function seedSystemSettings(adminUserId: string) {
  const pretestConfig = {
    isEnabled: true,
    assignmentMode: 'QUESTION_BANK_RANDOM',
    maxAttempts: 3,
    lockAfterPass: true,
    questionBankRandom: {
      titlePrefix: 'Pretest Auto',
      questionCount: 5,
      problemCount: 1,
      duration: 45,
      difficulty: null,
      subjectIds: [],
      topicId: null,
      passThresholdAbsolute: 4,
      shuffleQuestions: true,
      shuffleChoices: true,
    },
    officialExamPool: {
      examIds: [IDS.exams.officialExam],
    },
  };

  await prisma.systemSetting.upsert({
    where: { key: 'BOOTH_POLICY_CONFIG' },
    update: {
      value: JSON.stringify(BOOTH_POLICY_DEFAULT),
      description: 'Global booth booking and kiosk walk-in policy',
      updatedByUserId: adminUserId,
    },
    create: {
      key: 'BOOTH_POLICY_CONFIG',
      value: JSON.stringify(BOOTH_POLICY_DEFAULT),
      description: 'Global booth booking and kiosk walk-in policy',
      updatedByUserId: adminUserId,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'CHECKIN_SIMILARITY_THRESHOLD' },
    update: {
      value: '0.6',
      description: 'Cosine similarity threshold for booth face check-in verification',
      updatedByUserId: adminUserId,
    },
    create: {
      key: 'CHECKIN_SIMILARITY_THRESHOLD',
      value: '0.6',
      description: 'Cosine similarity threshold for booth face check-in verification',
      updatedByUserId: adminUserId,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'PRETEST_EXAM_FLOW_CONFIG' },
    update: {
      value: JSON.stringify(pretestConfig),
      description: 'Global pretest exam-flow config for booth EXAM check-in sessions',
      updatedByUserId: adminUserId,
    },
    create: {
      key: 'PRETEST_EXAM_FLOW_CONFIG',
      value: JSON.stringify(pretestConfig),
      description: 'Global pretest exam-flow config for booth EXAM check-in sessions',
      updatedByUserId: adminUserId,
    },
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  console.log('🔥 SEEDING DATABASE:', url ? url.split('@')[1] : 'DATABASE_URL is missing');
  console.log('🌱 Start seeding...');

  const adminPasswordHash = await bcrypt.hash(PASSWORDS.admin, 10);
  const lecturerPasswordHash = await bcrypt.hash(PASSWORDS.lecturer, 10);
  const studentPasswordHash = await bcrypt.hash(PASSWORDS.student, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@iuh.edu.vn' },
    update: {
      name: 'System Admin',
      password: adminPasswordHash,
      studentCode: '00000000',
      role: 'ADMIN',
      isEmailVerified: true,
      isLocked: false,
    },
    create: {
      id: IDS.users.admin,
      email: 'admin@iuh.edu.vn',
      name: 'System Admin',
      password: adminPasswordHash,
      studentCode: '00000000',
      role: 'ADMIN',
      isEmailVerified: true,
      isLocked: false,
    },
  });

  console.log('✅ Upserted admin:', admin.email);

  const roleMap = await seedRolesAndPermissions(admin.id);
  const lecturerSuperAdminRole = roleMap.get('LECTURER_SUPER_ADMIN');
  const lecturerExamManagerRole = roleMap.get('LECTURER_EXAM_MANAGER');

  if (!lecturerSuperAdminRole || !lecturerExamManagerRole) {
    throw new Error('Failed to initialize lecturer roles');
  }

  const lecturerSuperAdmin = await prisma.user.upsert({
    where: { email: '12345678.nguyen@teacher.iuh.edu.vn' },
    update: {
      name: 'Nguyen Van Giang Vien',
      password: lecturerPasswordHash,
      studentCode: '12345678',
      role: 'LECTURER',
      isEmailVerified: true,
      isLocked: false,
      lecturerRoleId: lecturerSuperAdminRole.id,
      lecturerRoleAssignedAt: new Date(),
      lecturerRoleAssignedByUserId: admin.id,
    },
    create: {
      id: IDS.users.lecturerSuperAdmin,
      email: '12345678.nguyen@teacher.iuh.edu.vn',
      name: 'Nguyen Van Giang Vien',
      password: lecturerPasswordHash,
      studentCode: '12345678',
      role: 'LECTURER',
      isEmailVerified: true,
      isLocked: false,
      lecturerRoleId: lecturerSuperAdminRole.id,
      lecturerRoleAssignedAt: new Date(),
      lecturerRoleAssignedByUserId: admin.id,
    },
  });

  const lecturerExamManager = await prisma.user.upsert({
    where: { email: '23456789.tran@teacher.iuh.edu.vn' },
    update: {
      name: 'Tran Thi Giang Vien',
      password: lecturerPasswordHash,
      studentCode: '23456789',
      role: 'LECTURER',
      isEmailVerified: true,
      isLocked: false,
      lecturerRoleId: lecturerExamManagerRole.id,
      lecturerRoleAssignedAt: new Date(),
      lecturerRoleAssignedByUserId: admin.id,
    },
    create: {
      id: IDS.users.lecturerExamManager,
      email: '23456789.tran@teacher.iuh.edu.vn',
      name: 'Tran Thi Giang Vien',
      password: lecturerPasswordHash,
      studentCode: '23456789',
      role: 'LECTURER',
      isEmailVerified: true,
      isLocked: false,
      lecturerRoleId: lecturerExamManagerRole.id,
      lecturerRoleAssignedAt: new Date(),
      lecturerRoleAssignedByUserId: admin.id,
    },
  });

  console.log('✅ Upserted lecturers:', lecturerSuperAdmin.email, ',', lecturerExamManager.email);

  const verifiedEmbedding = createDeterministicEmbedding(1.23);

  const studentVerified = await prisma.user.upsert({
    where: { email: '22000001@student.iuh.edu.vn' },
    update: {
      name: 'Student Verified',
      password: studentPasswordHash,
      studentCode: '22000001',
      role: 'STUDENT',
      className: 'DHKTPM18A',
      isEmailVerified: true,
      isLocked: false,
      dateOfBirth: new Date('2004-01-15T00:00:00.000Z'),
      kycStatus: 'VERIFIED',
      kycRegisteredAt: daysAgo(30),
      kycVerifiedAt: daysAgo(29),
      kycLastAttemptAt: daysAgo(29),
      kycConsentVersion: 'v1',
      kycConsentedAt: daysAgo(30),
      faceEmbedding: verifiedEmbedding,
      faceEmbeddingModel: 'arcface-r100',
      faceEmbeddingVersion: 'seed-v1',
      faceEmbeddingNorm: 1,
      faceEmbeddingUpdatedAt: daysAgo(29),
    },
    create: {
      id: IDS.users.studentVerified,
      email: '22000001@student.iuh.edu.vn',
      name: 'Student Verified',
      password: studentPasswordHash,
      studentCode: '22000001',
      role: 'STUDENT',
      className: 'DHKTPM18A',
      isEmailVerified: true,
      isLocked: false,
      dateOfBirth: new Date('2004-01-15T00:00:00.000Z'),
      kycStatus: 'VERIFIED',
      kycRegisteredAt: daysAgo(30),
      kycVerifiedAt: daysAgo(29),
      kycLastAttemptAt: daysAgo(29),
      kycConsentVersion: 'v1',
      kycConsentedAt: daysAgo(30),
      faceEmbedding: verifiedEmbedding,
      faceEmbeddingModel: 'arcface-r100',
      faceEmbeddingVersion: 'seed-v1',
      faceEmbeddingNorm: 1,
      faceEmbeddingUpdatedAt: daysAgo(29),
    },
  });

  const studentPending = await prisma.user.upsert({
    where: { email: '22000002@student.iuh.edu.vn' },
    update: {
      name: 'Student Pending KYC',
      password: studentPasswordHash,
      studentCode: '22000002',
      role: 'STUDENT',
      className: 'DHKTPM18B',
      isEmailVerified: true,
      isLocked: false,
      dateOfBirth: new Date('2004-05-20T00:00:00.000Z'),
      kycStatus: 'NOT_STARTED',
      faceEmbedding: Prisma.DbNull,
      faceEmbeddingModel: null,
      faceEmbeddingVersion: null,
      faceEmbeddingNorm: null,
      faceEmbeddingUpdatedAt: null,
    },
    create: {
      id: IDS.users.studentPending,
      email: '22000002@student.iuh.edu.vn',
      name: 'Student Pending KYC',
      password: studentPasswordHash,
      studentCode: '22000002',
      role: 'STUDENT',
      className: 'DHKTPM18B',
      isEmailVerified: true,
      isLocked: false,
      dateOfBirth: new Date('2004-05-20T00:00:00.000Z'),
      kycStatus: 'NOT_STARTED',
    },
  });

  console.log('✅ Upserted students:', studentVerified.email, ',', studentPending.email);

  const { subjectByKey, topicByKey } = await seedSubjectsAndTopics();
  console.log(`✅ Seeded ${subjectByKey.size} subjects and ${topicByKey.size} topics`);

  const problemBySlug = await seedProblems(lecturerSuperAdmin.id, subjectByKey, topicByKey);
  console.log(`✅ Seeded ${problemBySlug.size} problems with test cases`);

  const questionById = await seedQuestions(lecturerSuperAdmin.id, subjectByKey, topicByKey);
  console.log(`✅ Seeded ${questionById.size} questions`);

  await seedExams(
    lecturerSuperAdmin.id,
    subjectByKey,
    topicByKey,
    questionById,
    problemBySlug,
  );
  console.log(`✅ Seeded ${EXAM_SEEDS.length} exams and exam items`);

  await seedBooths();
  console.log('✅ Seeded booths');

  await seedBookingDurations();
  console.log('✅ Seeded booking duration options');

  await seedSystemSettings(admin.id);
  console.log('✅ Seeded system settings (booth policy, checkin threshold, pretest config)');

  await prisma.lecturerPermissionAssignment.upsert({
    where: {
      lecturerId_permission: {
        lecturerId: lecturerExamManager.id,
        permission: 'MONITOR_SESSIONS',
      },
    },
    update: {
      grantedByUserId: admin.id,
    },
    create: {
      lecturerId: lecturerExamManager.id,
      permission: 'MONITOR_SESSIONS',
      grantedByUserId: admin.id,
    },
  });

  console.log('✅ Seeded direct lecturer permission assignment');

  console.log('\n🎉 Seed completed successfully!');
  console.log('🔑 Demo credentials:');
  console.log(`- Admin: admin@iuh.edu.vn / ${PASSWORDS.admin}`);
  console.log(`- Lecturer: 12345678.nguyen@teacher.iuh.edu.vn / ${PASSWORDS.lecturer}`);
  console.log(`- Student: 22000001@student.iuh.edu.vn / ${PASSWORDS.student}`);
}

main()
  .catch((error) => {
    console.error('❌ Error while seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
