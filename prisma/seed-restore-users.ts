import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

type LegacyUserRow = {
  id: string;
  email: string;
  name: string | null;
  password: string;
  studentCode: string | null;
  role: 'STUDENT' | 'LECTURER' | 'ADMIN';
  refreshToken: string | null;
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiry: string | null;
  resetPasswordCode: string | null;
  resetPasswordExpiry: string | null;
  isLocked: boolean;
  lockedAt: string | null;
  lockedReason: string | null;
  dateOfBirth: string | null;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
  className: string | null;
  kycStatus: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  kycRegisteredAt: string | null;
  kycVerifiedAt: string | null;
  kycLastAttemptAt: string | null;
  kycConsentVersion: string | null;
  kycConsentedAt: string | null;
  lecturerRoleId: string | null;
  lecturerRoleAssignedAt: string | null;
  lecturerRoleAssignedByUserId: string | null;
  faceEmbedding: unknown | null;
  faceEmbeddingModel: string | null;
  faceEmbeddingVersion: string | null;
  faceEmbeddingNorm: number | null;
  faceEmbeddingUpdatedAt: string | null;
  studentCardFaceMatchScore: number | null;
  studentCardImageUrl: string | null;
  studentCardVerifiedAt: string | null;
  kycFaceImageUrl: string | null;
  kycManualReviewNotes: string | null;
  kycManualReviewRejectionReason: string | null;
  kycManualReviewRequestedAt: string | null;
  kycManualReviewRequestedReason: string | null;
  kycManualReviewReviewedAt: string | null;
  kycManualReviewStatus: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  kycManualReviewedByUserId: string | null;
  kycStudentImageUrl: string | null;
};

type LecturerPermissionKey =
  | 'CREATE_EXAM'
  | 'REVIEW_QUESTION'
  | 'MANAGE_QUESTION_BANK'
  | 'MANAGE_STUDENTS'
  | 'MANAGE_BOOTHS'
  | 'MONITOR_SESSIONS'
  | 'LECTURER_ADMIN';

type RoleSeed = {
  id: string;
  code: string;
  name: string;
  description: string;
  priority: number;
  permissions: LecturerPermissionKey[];
};

const ROLE_SEEDS: RoleSeed[] = [
  {
    id: '22222222-2222-4222-8222-000000000001',
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
    id: '22222222-2222-4222-8222-000000000002',
    code: 'LECTURER_EXAM_MANAGER',
    name: 'Lecturer Exam Manager',
    description: 'Can create exams and manage question/problem banks',
    priority: 20,
    permissions: ['CREATE_EXAM', 'REVIEW_QUESTION', 'MANAGE_QUESTION_BANK', 'MONITOR_SESSIONS'],
  },
  {
    id: '22222222-2222-4222-8222-000000000003',
    code: 'LECTURER_MONITOR',
    name: 'Lecturer Monitor',
    description: 'Can monitor sessions and manage booths',
    priority: 30,
    permissions: ['MONITOR_SESSIONS', 'MANAGE_BOOTHS'],
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const snapshotPath = join(process.cwd(), 'prisma', 'seed-data', 'users-legacy-snapshot.json');

function parseDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

async function loadSnapshot(): Promise<LegacyUserRow[]> {
  const raw = readFileSync(snapshotPath, 'utf8');
  return JSON.parse(raw) as LegacyUserRow[];
}

async function seedRoles(tx: PrismaClient, adminUserId: string) {
  for (const roleSeed of ROLE_SEEDS) {
    const role = await tx.lecturerRole.upsert({
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

    await tx.lecturerRolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { notIn: roleSeed.permissions },
      },
    });

    for (const permission of roleSeed.permissions) {
      await tx.lecturerRolePermission.upsert({
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
  }
}

async function main() {
  const snapshot = await loadSnapshot();
  const adminUser = snapshot.find((user) => user.role === 'ADMIN') ?? snapshot[0];

  if (!adminUser) {
    throw new Error(`No user rows found in snapshot: ${snapshotPath}`);
  }

  if (process.env.SEED_USERS_DRY_RUN === 'true') {
    console.log(`Loaded ${snapshot.length} user rows from ${snapshotPath}`);
    console.log(`Admin user: ${adminUser.id} ${adminUser.email}`);
    console.log('Dry run only; no writes performed.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const user of snapshot) {
      await tx.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          name: user.name,
          studentCode: user.studentCode,
          role: user.role,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          studentCode: user.studentCode,
          role: user.role,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
      });
    }

    await seedRoles(tx as unknown as PrismaClient, adminUser.id);

    for (const user of snapshot) {
      await tx.userAuth.upsert({
        where: { userId: user.id },
        update: {
          password: user.password,
          refreshToken: user.refreshToken,
          isEmailVerified: user.isEmailVerified,
          emailVerificationToken: user.emailVerificationToken,
          emailVerificationExpiry: parseDate(user.emailVerificationExpiry),
          resetPasswordCode: user.resetPasswordCode,
          resetPasswordExpiry: parseDate(user.resetPasswordExpiry),
          isLocked: user.isLocked,
          lockedAt: parseDate(user.lockedAt),
          lockedReason: user.lockedReason,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
        create: {
          userId: user.id,
          password: user.password,
          refreshToken: user.refreshToken,
          isEmailVerified: user.isEmailVerified,
          emailVerificationToken: user.emailVerificationToken,
          emailVerificationExpiry: parseDate(user.emailVerificationExpiry),
          resetPasswordCode: user.resetPasswordCode,
          resetPasswordExpiry: parseDate(user.resetPasswordExpiry),
          isLocked: user.isLocked,
          lockedAt: parseDate(user.lockedAt),
          lockedReason: user.lockedReason,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
      });

      await tx.userProfile.upsert({
        where: { userId: user.id },
        update: {
          name: user.name,
          studentCode: user.studentCode,
          dateOfBirth: parseDate(user.dateOfBirth),
          className: user.className,
          studentCardImageUrl: user.studentCardImageUrl,
          studentCardVerifiedAt: parseDate(user.studentCardVerifiedAt),
          studentCardFaceMatchScore: user.studentCardFaceMatchScore,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
        create: {
          userId: user.id,
          name: user.name,
          studentCode: user.studentCode,
          dateOfBirth: parseDate(user.dateOfBirth),
          className: user.className,
          studentCardImageUrl: user.studentCardImageUrl,
          studentCardVerifiedAt: parseDate(user.studentCardVerifiedAt),
          studentCardFaceMatchScore: user.studentCardFaceMatchScore,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
      });

      await tx.userKyc.upsert({
        where: { userId: user.id },
        update: {
          kycStatus: user.kycStatus,
          kycRegisteredAt: parseDate(user.kycRegisteredAt),
          kycVerifiedAt: parseDate(user.kycVerifiedAt),
          kycLastAttemptAt: parseDate(user.kycLastAttemptAt),
          kycFaceImageUrl: user.kycFaceImageUrl,
          kycStudentImageUrl: user.kycStudentImageUrl,
          kycManualReviewStatus: user.kycManualReviewStatus,
          kycManualReviewRequestedAt: parseDate(user.kycManualReviewRequestedAt),
          kycManualReviewRequestedReason: user.kycManualReviewRequestedReason,
          kycManualReviewReviewedAt: parseDate(user.kycManualReviewReviewedAt),
          kycManualReviewedByUserId: user.kycManualReviewedByUserId,
          kycManualReviewRejectionReason: user.kycManualReviewRejectionReason,
          kycManualReviewNotes: user.kycManualReviewNotes,
          kycConsentVersion: user.kycConsentVersion,
          kycConsentedAt: parseDate(user.kycConsentedAt),
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
        create: {
          userId: user.id,
          kycStatus: user.kycStatus,
          kycRegisteredAt: parseDate(user.kycRegisteredAt),
          kycVerifiedAt: parseDate(user.kycVerifiedAt),
          kycLastAttemptAt: parseDate(user.kycLastAttemptAt),
          kycFaceImageUrl: user.kycFaceImageUrl,
          kycStudentImageUrl: user.kycStudentImageUrl,
          kycManualReviewStatus: user.kycManualReviewStatus,
          kycManualReviewRequestedAt: parseDate(user.kycManualReviewRequestedAt),
          kycManualReviewRequestedReason: user.kycManualReviewRequestedReason,
          kycManualReviewReviewedAt: parseDate(user.kycManualReviewReviewedAt),
          kycManualReviewedByUserId: user.kycManualReviewedByUserId,
          kycManualReviewRejectionReason: user.kycManualReviewRejectionReason,
          kycManualReviewNotes: user.kycManualReviewNotes,
          kycConsentVersion: user.kycConsentVersion,
          kycConsentedAt: parseDate(user.kycConsentedAt),
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
      });

      await tx.userFaceEmbedding.upsert({
        where: { userId: user.id },
        update: {
          faceEmbedding: user.faceEmbedding as never,
          faceEmbeddingModel: user.faceEmbeddingModel,
          faceEmbeddingVersion: user.faceEmbeddingVersion,
          faceEmbeddingNorm: user.faceEmbeddingNorm,
          faceEmbeddingUpdatedAt: parseDate(user.faceEmbeddingUpdatedAt),
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
        create: {
          userId: user.id,
          faceEmbedding: user.faceEmbedding as never,
          faceEmbeddingModel: user.faceEmbeddingModel,
          faceEmbeddingVersion: user.faceEmbeddingVersion,
          faceEmbeddingNorm: user.faceEmbeddingNorm,
          faceEmbeddingUpdatedAt: parseDate(user.faceEmbeddingUpdatedAt),
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
      });

      await tx.pointAccount.upsert({
        where: { userId: user.id },
        update: {
          totalPoints: user.totalPoints,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
        create: {
          userId: user.id,
          totalPoints: user.totalPoints,
          createdAt: parseDate(user.createdAt) ?? undefined,
          updatedAt: parseDate(user.updatedAt) ?? undefined,
        } as any,
      });

      if (user.lecturerRoleId || user.lecturerRoleAssignedAt || user.lecturerRoleAssignedByUserId) {
        await tx.lecturerMetadata.upsert({
          where: { userId: user.id },
          update: {
            lecturerRoleId: user.lecturerRoleId,
            lecturerRoleAssignedAt: parseDate(user.lecturerRoleAssignedAt),
            lecturerRoleAssignedByUserId: user.lecturerRoleAssignedByUserId,
            createdAt: parseDate(user.createdAt) ?? undefined,
            updatedAt: parseDate(user.updatedAt) ?? undefined,
          } as any,
          create: {
            userId: user.id,
            lecturerRoleId: user.lecturerRoleId,
            lecturerRoleAssignedAt: parseDate(user.lecturerRoleAssignedAt),
            lecturerRoleAssignedByUserId: user.lecturerRoleAssignedByUserId,
            createdAt: parseDate(user.createdAt) ?? undefined,
            updatedAt: parseDate(user.updatedAt) ?? undefined,
          } as any,
        });
      }
    }
  });

  console.log(`Seeded ${snapshot.length} users from ${snapshotPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });