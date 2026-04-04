-- Add monitoring permission for lecturers
ALTER TYPE "LecturerPermission" ADD VALUE IF NOT EXISTS 'MONITOR_SESSIONS';
