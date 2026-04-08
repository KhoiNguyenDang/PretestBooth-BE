-- Add lecturer role catalog and role assignment on users
ALTER TABLE "User"
  ADD COLUMN "lecturerRoleId" TEXT,
  ADD COLUMN "lecturerRoleAssignedAt" TIMESTAMP(3),
  ADD COLUMN "lecturerRoleAssignedByUserId" TEXT;

CREATE TABLE "LecturerRole" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priority" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemLocked" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LecturerRolePermission" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permission" "LecturerPermission" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LecturerRole_code_key"
  ON "LecturerRole"("code");
CREATE UNIQUE INDEX "LecturerRole_priority_key"
  ON "LecturerRole"("priority");
CREATE INDEX "LecturerRole_priority_idx"
  ON "LecturerRole"("priority");
CREATE INDEX "LecturerRole_isActive_idx"
  ON "LecturerRole"("isActive");
CREATE INDEX "LecturerRole_createdByUserId_idx"
  ON "LecturerRole"("createdByUserId");

CREATE UNIQUE INDEX "LecturerRolePermission_roleId_permission_key"
  ON "LecturerRolePermission"("roleId", "permission");
CREATE INDEX "LecturerRolePermission_roleId_idx"
  ON "LecturerRolePermission"("roleId");
CREATE INDEX "LecturerRolePermission_permission_idx"
  ON "LecturerRolePermission"("permission");

CREATE INDEX "User_lecturerRoleId_idx"
  ON "User"("lecturerRoleId");
CREATE INDEX "User_lecturerRoleAssignedByUserId_idx"
  ON "User"("lecturerRoleAssignedByUserId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_lecturerRoleId_fkey"
  FOREIGN KEY ("lecturerRoleId") REFERENCES "LecturerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_lecturerRoleAssignedByUserId_fkey"
  FOREIGN KEY ("lecturerRoleAssignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LecturerRole"
  ADD CONSTRAINT "LecturerRole_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LecturerRolePermission"
  ADD CONSTRAINT "LecturerRolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "LecturerRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
