import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

// Initialize Prisma with PostgreSQL adapter
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const url = process.env.DATABASE_URL;
  console.log('🔥 SEEDING INTO DB:', url ? url.split('@')[1] : 'URL IS MISSING!');
  console.log('🌱 Starting seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@iuh.edu.vn' },
    update: {},
    create: {
      email: 'admin@iuh.edu.vn',
      name: 'Admin',
      password: adminPassword,
      studentCode: '00000000',
      role: 'ADMIN',
      isEmailVerified: true,
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create sample teacher user
  const teacherPassword = await bcrypt.hash('teacher123', 10);
  const teacher = await prisma.user.upsert({
    where: { email: '12345678.nguyen@teacher.iuh.edu.vn' },
    update: {},
    create: {
      email: '12345678.nguyen@teacher.iuh.edu.vn',
      name: 'Nguyễn Văn Giảng viên',
      password: teacherPassword,
      studentCode: '12345678',
      role: 'LECTURER',
      isEmailVerified: true,
    },
  });
  console.log('✅ Created teacher user:', teacher.email);

  // ==================== SUBJECTS & TOPICS (shared by problems and questions) ====================

  console.log('\n📚 Creating subjects & topics...');

  // Create Subjects
  const oopSubject = await prisma.subject.upsert({
    where: { name: 'Lập trình hướng đối tượng' },
    update: {},
    create: {
      name: 'Lập trình hướng đối tượng',
      description: 'Các khái niệm và nguyên lý lập trình hướng đối tượng (OOP)',
    },
  });
  console.log('✅ Created subject:', oopSubject.name);

  const dsaSubject = await prisma.subject.upsert({
    where: { name: 'Cấu trúc dữ liệu & Giải thuật' },
    update: {},
    create: {
      name: 'Cấu trúc dữ liệu & Giải thuật',
      description: 'Các cấu trúc dữ liệu và thuật toán cơ bản đến nâng cao',
    },
  });
  console.log('✅ Created subject:', dsaSubject.name);

  const dbSubject = await prisma.subject.upsert({
    where: { name: 'Cơ sở dữ liệu' },
    update: {},
    create: {
      name: 'Cơ sở dữ liệu',
      description: 'Thiết kế và quản trị cơ sở dữ liệu quan hệ',
    },
  });
  console.log('✅ Created subject:', dbSubject.name);

  // Create Topics for OOP
  const oopBasicsTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: oopSubject.id, name: 'Khái niệm cơ bản' } },
    update: {},
    create: { name: 'Khái niệm cơ bản', subjectId: oopSubject.id },
  });

  const inheritanceTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: oopSubject.id, name: 'Kế thừa' } },
    update: {},
    create: { name: 'Kế thừa', subjectId: oopSubject.id },
  });

  const polymorphismTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: oopSubject.id, name: 'Đa hình' } },
    update: {},
    create: { name: 'Đa hình', subjectId: oopSubject.id },
  });
  console.log('✅ Created topics for OOP');

  // Create Topics for DSA
  const arrayTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: dsaSubject.id, name: 'Mảng & Chuỗi' } },
    update: {},
    create: { name: 'Mảng & Chuỗi', subjectId: dsaSubject.id },
  });

  const sortingTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: dsaSubject.id, name: 'Sắp xếp' } },
    update: {},
    create: { name: 'Sắp xếp', subjectId: dsaSubject.id },
  });

  const treeTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: dsaSubject.id, name: 'Cây' } },
    update: {},
    create: { name: 'Cây', subjectId: dsaSubject.id },
  });
  console.log('✅ Created topics for DSA');

  // Create Topics for Database
  const sqlTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: dbSubject.id, name: 'SQL cơ bản' } },
    update: {},
    create: { name: 'SQL cơ bản', subjectId: dbSubject.id },
  });

  const normalizationTopic = await prisma.topic.upsert({
    where: { subjectId_name: { subjectId: dbSubject.id, name: 'Chuẩn hóa' } },
    update: {},
    create: { name: 'Chuẩn hóa', subjectId: dbSubject.id },
  });
  console.log('✅ Created topics for Database');

  // ==================== CODING PROBLEMS ====================

  console.log('\n💻 Seeding coding problems...');

  // Problem 1: Two Sum
  const twoSum = await prisma.problem.upsert({
    where: { slug: 'two-sum' },
    update: {},
    create: {
      title: 'Two Sum',
      slug: 'two-sum',
      description: `Cho một mảng số nguyên nums và một số nguyên target, trả về chỉ số của hai số sao cho tổng của chúng bằng target.

Bạn có thể giả định rằng mỗi đầu vào sẽ có chính xác một lời giải, và bạn không được sử dụng cùng một phần tử hai lần.

Bạn có thể trả về câu trả lời theo bất kỳ thứ tự nào.`,
      difficulty: 'EASY',
      starterCode: {
        javascript: `function twoSum(nums, target) {
    // Viết code của bạn ở đây
}`,
        python: `def two_sum(nums, target):
    # Viết code của bạn ở đây
    pass`,
        java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Viết code của bạn ở đây
    }
}`,
      },
      constraints: `- 2 <= nums.length <= 10^4
- -10^9 <= nums[i] <= 10^9
- -10^9 <= target <= 10^9
- Chỉ có một câu trả lời hợp lệ.`,
      hints: [
        'Sử dụng hash map để lưu trữ các giá trị đã thấy và chỉ số của chúng.',
        'Với mỗi phần tử, kiểm tra xem (target - phần tử hiện tại) có tồn tại trong hash map không.',
      ],
      timeLimit: 1000,
      memoryLimit: 256,
      functionName: 'twoSum',
      inputTypes: ['int[]', 'int'],
      outputType: 'int[]',
      argNames: ['nums', 'target'],
      isPublished: true,
      creatorId: teacher.id,
      subjectId: dsaSubject.id,
      topicId: arrayTopic.id,
    },
  });
  console.log('✅ Created problem:', twoSum.title);

  // Test cases for Two Sum
  await prisma.testCase.createMany({
    data: [
      {
        problemId: twoSum.id,
        input: '[2,7,11,15], 9',
        expectedOutput: '[0,1]',
        explanation: 'Vì nums[0] + nums[1] == 9, ta trả về [0, 1].',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        problemId: twoSum.id,
        input: '[3,2,4], 6',
        expectedOutput: '[1,2]',
        explanation: 'Vì nums[1] + nums[2] == 6, ta trả về [1, 2].',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        problemId: twoSum.id,
        input: '[3,3], 6',
        expectedOutput: '[0,1]',
        explanation: 'Vì nums[0] + nums[1] == 6, ta trả về [0, 1].',
        isHidden: false,
        isSample: true,
        order: 3,
      },
      {
        problemId: twoSum.id,
        input: '[1,5,3,7,9], 10',
        expectedOutput: '[1,3]',
        isHidden: true,
        isSample: false,
        order: 4,
      },
      {
        problemId: twoSum.id,
        input: '[-1,-2,-3,-4,-5], -8',
        expectedOutput: '[2,4]',
        isHidden: true,
        isSample: false,
        order: 5,
      },
    ],
  });
  console.log('✅ Created test cases for Two Sum');

  // Problem 2: Palindrome Number
  const palindrome = await prisma.problem.upsert({
    where: { slug: 'palindrome-number' },
    update: {},
    create: {
      title: 'Palindrome Number',
      slug: 'palindrome-number',
      description: `Cho một số nguyên x, trả về true nếu x là số palindrome (đọc xuôi ngược đều giống nhau), ngược lại trả về false.

Ví dụ: 121 là palindrome trong khi 123 thì không.`,
      difficulty: 'EASY',
      starterCode: {
        javascript: `function isPalindrome(x) {
    // Viết code của bạn ở đây
}`,
        python: `def is_palindrome(x):
    # Viết code của bạn ở đây
    pass`,
        java: `class Solution {
    public boolean isPalindrome(int x) {
        // Viết code của bạn ở đây
    }
}`,
      },
      constraints: `-2^31 <= x <= 2^31 - 1`,
      hints: [
        'Số âm không phải là palindrome.',
        'Bạn có thể chuyển đổi số thành chuỗi, nhưng bạn có thể giải quyết mà không cần chuyển đổi không?',
      ],
      timeLimit: 1000,
      memoryLimit: 256,
      functionName: 'isPalindrome',
      inputTypes: ['int'],
      outputType: 'boolean',
      argNames: ['x'],
      isPublished: true,
      creatorId: teacher.id,
      subjectId: dsaSubject.id,
      topicId: arrayTopic.id,
    },
  });
  console.log('✅ Created problem:', palindrome.title);

  await prisma.testCase.createMany({
    data: [
      {
        problemId: palindrome.id,
        input: '121',
        expectedOutput: 'true',
        explanation: '121 đọc từ trái sang phải là 121. Đọc từ phải sang trái cũng là 121.',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        problemId: palindrome.id,
        input: '-121',
        expectedOutput: 'false',
        explanation:
          'Từ trái sang phải, nó đọc là -121. Từ phải sang trái, nó trở thành 121-. Do đó nó không phải là palindrome.',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        problemId: palindrome.id,
        input: '10',
        expectedOutput: 'false',
        explanation: 'Đọc từ phải sang trái thành 01. Do đó nó không phải là palindrome.',
        isHidden: false,
        isSample: true,
        order: 3,
      },
      {
        problemId: palindrome.id,
        input: '12321',
        expectedOutput: 'true',
        isHidden: true,
        isSample: false,
        order: 4,
      },
      {
        problemId: palindrome.id,
        input: '0',
        expectedOutput: 'true',
        isHidden: true,
        isSample: false,
        order: 5,
      },
    ],
  });
  console.log('✅ Created test cases for Palindrome Number');

  // Problem 3: Reverse String
  const reverseString = await prisma.problem.upsert({
    where: { slug: 'reverse-string' },
    update: {},
    create: {
      title: 'Reverse String',
      slug: 'reverse-string',
      description: `Viết một hàm đảo ngược một chuỗi. Chuỗi đầu vào được cho dưới dạng một mảng các ký tự s.

Bạn phải làm điều này bằng cách sửa đổi mảng đầu vào tại chỗ với O(1) bộ nhớ bổ sung.`,
      difficulty: 'EASY',
      starterCode: {
        javascript: `function reverseString(s) {
    // Viết code của bạn ở đây
}`,
        python: `def reverse_string(s):
    # Viết code của bạn ở đây
    pass`,
        java: `class Solution {
    public void reverseString(char[] s) {
        // Viết code của bạn ở đây
    }
}`,
      },
      constraints: `- 1 <= s.length <= 10^5
- s[i] là một ký tự ASCII có thể in được.`,
      hints: [
        'Sử dụng kỹ thuật two pointers.',
        'Hoán đổi các ký tự ở vị trí đầu và cuối, sau đó di chuyển vào trong.',
      ],
      timeLimit: 1000,
      memoryLimit: 256,
      functionName: 'reverseString',
      inputTypes: ['String[]'],
      outputType: 'String[]',
      argNames: ['s'],
      isPublished: true,
      creatorId: teacher.id,
      subjectId: dsaSubject.id,
      topicId: arrayTopic.id,
    },
  });
  console.log('✅ Created problem:', reverseString.title);

  await prisma.testCase.createMany({
    data: [
      {
        problemId: reverseString.id,
        input: '["h","e","l","l","o"]',
        expectedOutput: '["o","l","l","e","h"]',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        problemId: reverseString.id,
        input: '["H","a","n","n","a","h"]',
        expectedOutput: '["h","a","n","n","a","H"]',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        problemId: reverseString.id,
        input: '["a"]',
        expectedOutput: '["a"]',
        isHidden: true,
        isSample: false,
        order: 3,
      },
    ],
  });
  console.log('✅ Created test cases for Reverse String');

  // Problem 4: Valid Parentheses (Medium)
  const validParentheses = await prisma.problem.upsert({
    where: { slug: 'valid-parentheses' },
    update: {},
    create: {
      title: 'Valid Parentheses',
      slug: 'valid-parentheses',
      description: `Cho một chuỗi s chỉ chứa các ký tự '(', ')', '{', '}', '[' và ']', xác định xem chuỗi đầu vào có hợp lệ không.

Một chuỗi đầu vào là hợp lệ nếu:
1. Dấu ngoặc mở phải được đóng bởi cùng loại dấu ngoặc.
2. Dấu ngoặc mở phải được đóng theo đúng thứ tự.
3. Mỗi dấu ngoặc đóng phải có một dấu ngoặc mở tương ứng cùng loại.`,
      difficulty: 'MEDIUM',
      starterCode: {
        javascript: `function isValid(s) {
    // Viết code của bạn ở đây
}`,
        python: `def is_valid(s):
    # Viết code của bạn ở đây
    pass`,
        java: `class Solution {
    public boolean isValid(String s) {
        // Viết code của bạn ở đây
    }
}`,
      },
      constraints: `- 1 <= s.length <= 10^4
- s chỉ bao gồm các ký tự '()[]{}'.`,
      hints: [
        'Sử dụng stack để theo dõi các dấu ngoặc mở.',
        'Khi gặp dấu ngoặc đóng, kiểm tra xem nó có khớp với dấu ngoặc mở ở đầu stack không.',
      ],
      timeLimit: 1000,
      memoryLimit: 256,
      functionName: 'isValid',
      inputTypes: ['String'],
      outputType: 'boolean',
      argNames: ['s'],
      isPublished: true,
      creatorId: teacher.id,
      subjectId: dsaSubject.id,
      topicId: arrayTopic.id,
    },
  });
  console.log('✅ Created problem:', validParentheses.title);

  await prisma.testCase.createMany({
    data: [
      {
        problemId: validParentheses.id,
        input: '"()"',
        expectedOutput: 'true',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        problemId: validParentheses.id,
        input: '"()[]{}"',
        expectedOutput: 'true',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        problemId: validParentheses.id,
        input: '"(]"',
        expectedOutput: 'false',
        isHidden: false,
        isSample: true,
        order: 3,
      },
      {
        problemId: validParentheses.id,
        input: '"([)]"',
        expectedOutput: 'false',
        isHidden: true,
        isSample: false,
        order: 4,
      },
      {
        problemId: validParentheses.id,
        input: '"{[]}"',
        expectedOutput: 'true',
        isHidden: true,
        isSample: false,
        order: 5,
      },
    ],
  });
  console.log('✅ Created test cases for Valid Parentheses');

  // Problem 5: Maximum Subarray (Medium)
  const maxSubarray = await prisma.problem.upsert({
    where: { slug: 'maximum-subarray' },
    update: {},
    create: {
      title: 'Maximum Subarray',
      slug: 'maximum-subarray',
      description: `Cho một mảng số nguyên nums, tìm mảng con liên tiếp có tổng lớn nhất và trả về tổng của nó.

Mảng con là một phần liên tiếp của mảng.`,
      difficulty: 'MEDIUM',
      starterCode: {
        javascript: `function maxSubArray(nums) {
    // Viết code của bạn ở đây
}`,
        python: `def max_sub_array(nums):
    # Viết code của bạn ở đây
    pass`,
        java: `class Solution {
    public int maxSubArray(int[] nums) {
        // Viết code của bạn ở đây
    }
}`,
      },
      constraints: `- 1 <= nums.length <= 10^5
- -10^4 <= nums[i] <= 10^4`,
      hints: [
        'Thử sử dụng thuật toán Kadane.',
        'Tại mỗi vị trí, quyết định xem nên tiếp tục mảng con hiện tại hay bắt đầu một mảng con mới.',
      ],
      timeLimit: 1000,
      memoryLimit: 256,
      functionName: 'maxSubArray',
      inputTypes: ['int[]'],
      outputType: 'int',
      argNames: ['nums'],
      isPublished: true,
      creatorId: teacher.id,
      subjectId: dsaSubject.id,
      topicId: arrayTopic.id,
    },
  });
  console.log('✅ Created problem:', maxSubarray.title);

  await prisma.testCase.createMany({
    data: [
      {
        problemId: maxSubarray.id,
        input: '[-2,1,-3,4,-1,2,1,-5,4]',
        expectedOutput: '6',
        explanation: 'Mảng con [4,-1,2,1] có tổng lớn nhất là 6.',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        problemId: maxSubarray.id,
        input: '[1]',
        expectedOutput: '1',
        explanation: 'Mảng con [1] có tổng lớn nhất là 1.',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        problemId: maxSubarray.id,
        input: '[5,4,-1,7,8]',
        expectedOutput: '23',
        explanation: 'Mảng con [5,4,-1,7,8] có tổng lớn nhất là 23.',
        isHidden: false,
        isSample: true,
        order: 3,
      },
      {
        problemId: maxSubarray.id,
        input: '[-1,-2,-3,-4]',
        expectedOutput: '-1',
        isHidden: true,
        isSample: false,
        order: 4,
      },
    ],
  });
  console.log('✅ Created test cases for Maximum Subarray');

  // Problem 6: Merge Two Sorted Lists (Hard)
  const mergeLists = await prisma.problem.upsert({
    where: { slug: 'merge-sorted-lists' },
    update: {},
    create: {
      title: 'Merge Two Sorted Lists',
      slug: 'merge-sorted-lists',
      description: `Bạn được cung cấp hai danh sách liên kết đã được sắp xếp list1 và list2.

Hợp nhất hai danh sách thành một danh sách đã sắp xếp. Danh sách phải được tạo bằng cách nối các nút của hai danh sách đầu tiên.

Trả về đầu của danh sách đã hợp nhất.`,
      difficulty: 'HARD',
      starterCode: {
        javascript: `function mergeTwoLists(list1, list2) {
    // Viết code của bạn ở đây
}`,
        python: `def merge_two_lists(list1, list2):
    # Viết code của bạn ở đây
    pass`,
        java: `class Solution {
    public ListNode mergeTwoLists(ListNode list1, ListNode list2) {
        // Viết code của bạn ở đây
    }
}`,
      },
      constraints: `- Số lượng nút trong cả hai danh sách nằm trong khoảng [0, 50].
- -100 <= Node.val <= 100
- Cả list1 và list2 đều được sắp xếp theo thứ tự tăng dần.`,
      hints: [
        'Sử dụng kỹ thuật two pointers để so sánh các nút của hai danh sách.',
        'Tạo một nút dummy để đơn giản hóa việc xây dựng danh sách kết quả.',
      ],
      timeLimit: 1500,
      memoryLimit: 256,
      functionName: 'mergeTwoLists',
      inputTypes: ['ListNode', 'ListNode'],
      outputType: 'ListNode',
      argNames: ['list1', 'list2'],
      isPublished: true,
      creatorId: teacher.id,
      subjectId: dsaSubject.id,
      topicId: sortingTopic.id,
    },
  });
  console.log('✅ Created problem:', mergeLists.title);

  await prisma.testCase.createMany({
    data: [
      {
        problemId: mergeLists.id,
        input: '[1,2,4], [1,3,4]',
        expectedOutput: '[1,1,2,3,4,4]',
        isHidden: false,
        isSample: true,
        order: 1,
      },
      {
        problemId: mergeLists.id,
        input: '[], []',
        expectedOutput: '[]',
        isHidden: false,
        isSample: true,
        order: 2,
      },
      {
        problemId: mergeLists.id,
        input: '[], [0]',
        expectedOutput: '[0]',
        isHidden: false,
        isSample: true,
        order: 3,
      },
    ],
  });
  console.log('✅ Created test cases for Merge Two Sorted Lists');

  // ==================== MULTIPLE-CHOICE QUESTION SEED DATA ====================

  console.log('\n📝 Seeding multiple-choice questions...');

  // ===== QUESTION 1: Single Choice - OOP Basics =====
  const q1 = await prisma.question.create({
    data: {
      content: 'Trong lập trình hướng đối tượng, tính đóng gói (Encapsulation) là gì?',
      questionType: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      explanation:
        'Tính đóng gói là việc che giấu thông tin bên trong đối tượng và chỉ cho phép truy cập thông qua các phương thức công khai.',
      isPublished: true,
      subjectId: oopSubject.id,
      topicId: oopBasicsTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      {
        content: 'Che giấu thông tin và dữ liệu bên trong đối tượng',
        isCorrect: true,
        order: 0,
        questionId: q1.id,
      },
      { content: 'Tạo nhiều đối tượng từ một lớp', isCorrect: false, order: 1, questionId: q1.id },
      { content: 'Kế thừa thuộc tính từ lớp cha', isCorrect: false, order: 2, questionId: q1.id },
      {
        content: 'Cho phép một phương thức hoạt động khác nhau tùy đối tượng',
        isCorrect: false,
        order: 3,
        questionId: q1.id,
      },
    ],
  });
  console.log('✅ Created question: OOP Encapsulation (Single Choice)');

  // ===== QUESTION 2: Single Choice - Inheritance =====
  const q2 = await prisma.question.create({
    data: {
      content: 'Từ khóa nào được sử dụng để kế thừa một lớp trong Java?',
      questionType: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      explanation: 'Trong Java, từ khóa "extends" được sử dụng để kế thừa một lớp.',
      isPublished: true,
      subjectId: oopSubject.id,
      topicId: inheritanceTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'implements', isCorrect: false, order: 0, questionId: q2.id },
      { content: 'extends', isCorrect: true, order: 1, questionId: q2.id },
      { content: 'inherits', isCorrect: false, order: 2, questionId: q2.id },
      { content: 'derives', isCorrect: false, order: 3, questionId: q2.id },
    ],
  });
  console.log('✅ Created question: Java Inheritance keyword (Single Choice)');

  // ===== QUESTION 3: Multiple Choice - OOP Principles =====
  const q3 = await prisma.question.create({
    data: {
      content: 'Chọn các tính chất cơ bản của lập trình hướng đối tượng (chọn nhiều đáp án):',
      questionType: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
      explanation:
        'Bốn tính chất cơ bản của OOP là: Đóng gói (Encapsulation), Kế thừa (Inheritance), Đa hình (Polymorphism), và Trừu tượng (Abstraction).',
      isPublished: true,
      subjectId: oopSubject.id,
      topicId: oopBasicsTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'Đóng gói (Encapsulation)', isCorrect: true, order: 0, questionId: q3.id },
      { content: 'Kế thừa (Inheritance)', isCorrect: true, order: 1, questionId: q3.id },
      { content: 'Đa hình (Polymorphism)', isCorrect: true, order: 2, questionId: q3.id },
      { content: 'Trừu tượng (Abstraction)', isCorrect: true, order: 3, questionId: q3.id },
      { content: 'Đệ quy (Recursion)', isCorrect: false, order: 4, questionId: q3.id },
      { content: 'Song song (Concurrency)', isCorrect: false, order: 5, questionId: q3.id },
    ],
  });
  console.log('✅ Created question: OOP Principles (Multiple Choice)');

  // ===== QUESTION 4: Multiple Choice - Sorting =====
  const q4 = await prisma.question.create({
    data: {
      content:
        'Thuật toán sắp xếp nào sau đây có độ phức tạp trung bình là O(n log n)? (Chọn nhiều đáp án)',
      questionType: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
      explanation:
        'Merge Sort, Quick Sort và Heap Sort đều có độ phức tạp trung bình là O(n log n).',
      isPublished: true,
      subjectId: dsaSubject.id,
      topicId: sortingTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'Bubble Sort', isCorrect: false, order: 0, questionId: q4.id },
      { content: 'Merge Sort', isCorrect: true, order: 1, questionId: q4.id },
      { content: 'Quick Sort', isCorrect: true, order: 2, questionId: q4.id },
      { content: 'Selection Sort', isCorrect: false, order: 3, questionId: q4.id },
      { content: 'Heap Sort', isCorrect: true, order: 4, questionId: q4.id },
    ],
  });
  console.log('✅ Created question: Sorting Algorithms Complexity (Multiple Choice)');

  // ===== QUESTION 5: Short Answer - BST =====
  await prisma.question.create({
    data: {
      content:
        'Trong cây nhị phân tìm kiếm (BST), giá trị của nút con bên trái so với nút cha như thế nào?',
      questionType: 'SHORT_ANSWER',
      difficulty: 'EASY',
      correctAnswer: 'nhỏ hơn',
      explanation:
        'Trong BST, nút con bên trái luôn có giá trị nhỏ hơn nút cha, và nút con bên phải có giá trị lớn hơn nút cha.',
      isPublished: true,
      subjectId: dsaSubject.id,
      topicId: treeTopic.id,
      creatorId: teacher.id,
    },
  });
  console.log('✅ Created question: BST Property (Short Answer)');

  // ===== QUESTION 6: Single Choice - SQL =====
  const q6 = await prisma.question.create({
    data: {
      content: 'Câu lệnh SQL nào dùng để lấy dữ liệu từ bảng?',
      questionType: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      explanation:
        'Câu lệnh SELECT được sử dụng để truy vấn và lấy dữ liệu từ bảng trong cơ sở dữ liệu.',
      isPublished: true,
      subjectId: dbSubject.id,
      topicId: sqlTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'SELECT', isCorrect: true, order: 0, questionId: q6.id },
      { content: 'INSERT', isCorrect: false, order: 1, questionId: q6.id },
      { content: 'UPDATE', isCorrect: false, order: 2, questionId: q6.id },
      { content: 'DELETE', isCorrect: false, order: 3, questionId: q6.id },
    ],
  });
  console.log('✅ Created question: SQL SELECT (Single Choice)');

  // ===== QUESTION 7: Short Answer - Normalization =====
  await prisma.question.create({
    data: {
      content: 'Dạng chuẩn nào yêu cầu loại bỏ phụ thuộc bắc cầu (transitive dependency)?',
      questionType: 'SHORT_ANSWER',
      difficulty: 'MEDIUM',
      correctAnswer: '3NF',
      explanation:
        'Dạng chuẩn 3 (3NF) yêu cầu loại bỏ phụ thuộc bắc cầu — tức là các thuộc tính không khóa không được phụ thuộc vào thuộc tính không khóa khác.',
      isPublished: true,
      subjectId: dbSubject.id,
      topicId: normalizationTopic.id,
      creatorId: teacher.id,
    },
  });
  console.log('✅ Created question: 3NF Normalization (Short Answer)');

  // ===== QUESTION 8: Single Choice - Polymorphism =====
  const q8 = await prisma.question.create({
    data: {
      content: 'Overloading và Overriding là hai dạng của tính chất nào trong OOP?',
      questionType: 'SINGLE_CHOICE',
      difficulty: 'MEDIUM',
      explanation:
        'Overloading (nạp chồng) và Overriding (ghi đè) là hai dạng thể hiện của tính đa hình (Polymorphism) trong OOP.',
      isPublished: true,
      subjectId: oopSubject.id,
      topicId: polymorphismTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'Tính đóng gói (Encapsulation)', isCorrect: false, order: 0, questionId: q8.id },
      { content: 'Tính kế thừa (Inheritance)', isCorrect: false, order: 1, questionId: q8.id },
      { content: 'Tính đa hình (Polymorphism)', isCorrect: true, order: 2, questionId: q8.id },
      { content: 'Tính trừu tượng (Abstraction)', isCorrect: false, order: 3, questionId: q8.id },
    ],
  });
  console.log('✅ Created question: Polymorphism types (Single Choice)');

  // ===== QUESTION 9: Multiple Choice - SQL Joins =====
  const q9 = await prisma.question.create({
    data: {
      content: 'Những loại JOIN nào sau đây có trong SQL? (Chọn nhiều đáp án)',
      questionType: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
      explanation: 'SQL hỗ trợ: INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN, và CROSS JOIN.',
      isPublished: true,
      subjectId: dbSubject.id,
      topicId: sqlTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'INNER JOIN', isCorrect: true, order: 0, questionId: q9.id },
      { content: 'LEFT JOIN', isCorrect: true, order: 1, questionId: q9.id },
      { content: 'DIAGONAL JOIN', isCorrect: false, order: 2, questionId: q9.id },
      { content: 'FULL OUTER JOIN', isCorrect: true, order: 3, questionId: q9.id },
      { content: 'CROSS JOIN', isCorrect: true, order: 4, questionId: q9.id },
    ],
  });
  console.log('✅ Created question: SQL JOIN types (Multiple Choice)');

  // ===== QUESTION 10: Single Choice - Array Complexity (Draft) =====
  const q10 = await prisma.question.create({
    data: {
      content: 'Độ phức tạp thời gian của việc truy cập phần tử trong mảng theo chỉ số là gì?',
      questionType: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      explanation:
        'Mảng cho phép truy cập trực tiếp bằng chỉ số với độ phức tạp O(1) — thời gian hằng số.',
      isPublished: false, // Draft question
      subjectId: dsaSubject.id,
      topicId: arrayTopic.id,
      creatorId: teacher.id,
    },
  });
  await prisma.questionChoice.createMany({
    data: [
      { content: 'O(1)', isCorrect: true, order: 0, questionId: q10.id },
      { content: 'O(n)', isCorrect: false, order: 1, questionId: q10.id },
      { content: 'O(log n)', isCorrect: false, order: 2, questionId: q10.id },
      { content: 'O(n²)', isCorrect: false, order: 3, questionId: q10.id },
    ],
  });
  console.log('✅ Created question: Array Access Complexity (Single Choice - Draft)');

  console.log('✅ Question bank seeding completed!');

  console.log('✨ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
