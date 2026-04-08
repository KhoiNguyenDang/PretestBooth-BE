import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { QuestionsService } from './questions.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { CreateSubjectSchema, UpdateSubjectSchema } from './dto/create-subject.dto';
import type { CreateSubjectDto, UpdateSubjectDto } from './dto/create-subject.dto';
import { CreateTopicSchema, UpdateTopicSchema } from './dto/create-topic.dto';
import type { CreateTopicDto, UpdateTopicDto } from './dto/create-topic.dto';
import { CreateQuestionSchema } from './dto/create-question.dto';
import type { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionSchema } from './dto/update-question.dto';
import type { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionSchema } from './dto/query-question.dto';
import type { QueryQuestionDto } from './dto/query-question.dto';

@Controller('questions')
@UseGuards(AuthGuard('jwt'))
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // ==================== SUBJECT ENDPOINTS ====================

  @Post('subjects')
  createSubject(
    @Body(new ZodValidationPipe(CreateSubjectSchema)) dto: CreateSubjectDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.createSubject(dto, userId, userRole);
  }

  @Get('subjects')
  findAllSubjects() {
    return this.questionsService.findAllSubjects();
  }

  @Put('subjects/:id')
  updateSubject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSubjectSchema)) dto: UpdateSubjectDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.updateSubject(id, dto, userId, userRole);
  }

  @Delete('subjects/:id')
  @HttpCode(HttpStatus.OK)
  deleteSubject(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.deleteSubject(id, userId, userRole);
  }

  // ==================== TOPIC ENDPOINTS ====================

  @Post('subjects/:subjectId/topics')
  createTopic(
    @Param('subjectId') subjectId: string,
    @Body(new ZodValidationPipe(CreateTopicSchema)) dto: CreateTopicDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.createTopic(subjectId, dto, userId, userRole);
  }

  @Get('subjects/:subjectId/topics')
  findTopicsBySubject(@Param('subjectId') subjectId: string) {
    return this.questionsService.findTopicsBySubject(subjectId);
  }

  @Put('topics/:id')
  updateTopic(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTopicSchema)) dto: UpdateTopicDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.updateTopic(id, dto, userId, userRole);
  }

  @Delete('topics/:id')
  @HttpCode(HttpStatus.OK)
  deleteTopic(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.deleteTopic(id, userId, userRole);
  }

  // ==================== QUESTION ENDPOINTS ====================

  @Post()
  createQuestion(
    @Body(new ZodValidationPipe(CreateQuestionSchema)) dto: CreateQuestionDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.create(userId, userRole, dto);
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadQuestionImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(png|jpe?g|webp|gif)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.uploadQuestionImage(file, userId, userRole);
  }

  @Get()
  findAllQuestions(
    @Query(new ZodValidationPipe(QueryQuestionSchema)) query: QueryQuestionDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.findAll(query, userId, userRole);
  }

  @Get(':id')
  findOneQuestion(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.findOne(id, userId, userRole);
  }

  @Put(':id')
  updateQuestion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateQuestionSchema)) dto: UpdateQuestionDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.update(id, dto, userId, userRole);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  removeQuestion(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.remove(id, userId, userRole);
  }

  @Patch(':id/publish')
  togglePublish(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.togglePublish(id, userId, userRole);
  }

  @Post('import')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'images', maxCount: 300 },
    ]),
  )
  importQuestions(
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
    @Req() req,
  ) {
    const file = files?.file?.[0];
    if (!file) {
      throw new BadRequestException('Vui lòng upload file Excel/CSV/ZIP ở field file');
    }

    if (file.size > 30 * 1024 * 1024) {
      throw new BadRequestException('File import vượt quá 30MB');
    }

    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.questionsService.importQuestions(file, userId, userRole, files?.images || []);
  }
}
