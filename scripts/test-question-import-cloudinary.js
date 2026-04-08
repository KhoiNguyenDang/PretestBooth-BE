const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module');
const { QuestionsService } = require('../dist/src/questions/questions.service');
const { PrismaService } = require('../dist/src/prisma/prisma.service');

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const questionsService = app.get(QuestionsService);
    const prisma = app.get(PrismaService);

    const actor =
      (await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) ||
      (await prisma.user.findFirst({ select: { id: true } }));

    if (!actor) {
      throw new Error('Khong tim thay user de tao cau hoi test import');
    }

    const subject = await prisma.subject.findFirst({ select: { id: true, name: true } });
    if (!subject) {
      throw new Error('Khong tim thay subject trong DB de test import');
    }

    const topic = await prisma.topic.findFirst({
      where: { subjectId: subject.id },
      select: { id: true, name: true },
    });

    const imageName = `import-cloudinary-test-${Date.now()}.png`;
    const csv = [
      'content,questionType,classification,difficulty,subjectId,topicId,image,A,B,C,D,Đáp án đúng',
      [
        `Cau hoi import test Cloudinary ${Date.now()}`,
        'SINGLE_CHOICE',
        'EXAM',
        'EASY',
        subject.id,
        topic ? topic.id : '',
        imageName,
        'Dap an A',
        'Dap an B',
        'Dap an C',
        'Dap an D',
        'A',
      ].join(','),
    ].join('\n');

    const csvFile = {
      originalname: 'import-cloudinary-test.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    };

    // 1x1 transparent PNG
    const imageFile = {
      originalname: imageName,
      mimetype: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p6X0AAAAASUVORK5CYII=',
        'base64',
      ),
    };

    const result = await questionsService.importQuestions(csvFile, actor.id, 'ADMIN', [imageFile]);

    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
