// src/modules/file-manage/file-manage.module.ts
import { Module } from '@nestjs/common';
import { FileManageService } from './application/file-manage.service';
import { FileReadController } from './interface/file-manage.controller';
import { LmStudioService } from '../lm-studio/application/lmstudio.service';

@Module({
  imports: [],

  providers: [FileManageService, LmStudioService],

  controllers: [FileReadController],

  exports: [FileManageService],
})
export class FileManageModule {}
