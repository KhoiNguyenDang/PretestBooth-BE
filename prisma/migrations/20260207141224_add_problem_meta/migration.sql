-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "argNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "functionName" TEXT NOT NULL DEFAULT 'solution',
ADD COLUMN     "inputTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "outputType" TEXT NOT NULL DEFAULT 'void';
