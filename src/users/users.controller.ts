import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { QueryUserSchema, CreateUserSchema, UpdateUserSchema } from './dto/user.dto';
import type { QueryUserDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'LECTURER')
  findAll(@Query(new ZodValidationPipe(QueryUserSchema)) query: QueryUserDto, @Req() req) {
    return this.usersService.findAll(query, req.user['role']);
  }

  @Get('export')
  @Roles('ADMIN', 'LECTURER')
  async exportStudents(
    @Query(new ZodValidationPipe(QueryUserSchema)) query: QueryUserDto,
    @Req() req,
    @Res() res: Response,
  ) {
    const file = await this.usersService.exportStudents(query, req.user['role']);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return res.send(file.buffer);
  }

  @Get(':id')
  @Roles('ADMIN', 'LECTURER', 'STUDENT')
  findOne(@Param('id') id: string, @Req() req) {
    return this.usersService.findOne(id, req.user['sub'], req.user['role']);
  }

  @Post()
  @Roles('ADMIN', 'LECTURER')
  create(@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto, @Req() req) {
    return this.usersService.create(dto, req.user['role']);
  }

  @Patch(':id')
  @Roles('ADMIN', 'LECTURER', 'STUDENT')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto,
    @Req() req,
  ) {
    return this.usersService.update(id, dto, req.user['sub'], req.user['role']);
  }

  @Delete(':id')
  @Roles('ADMIN', 'LECTURER', 'STUDENT')
  remove(@Param('id') id: string, @Req() req) {
    return this.usersService.remove(id, req.user['sub'], req.user['role']);
  }

  @Post('import')
  @Roles('ADMIN', 'LECTURER')
  @UseInterceptors(FileInterceptor('file'))
  importStudents(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB limit
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() req,
  ) {
    return this.usersService.importStudents(file, req.user['role']);
  }
}
