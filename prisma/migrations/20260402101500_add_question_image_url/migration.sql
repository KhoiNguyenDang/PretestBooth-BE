-- Add optional image URL for question content (text + image)
ALTER TABLE "Question"
ADD COLUMN "imageUrl" TEXT;
