import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator
} from '@nestjs/common';
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
@Roles('ADMIN') // Protect the entire controller to ADMIN only
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(QueryUserSchema)) query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Post('import')
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
  ) {
    return this.usersService.importStudents(file);
  }
}
