// src/modules/file-manage/file-manage.module.ts
import { Module } from '@nestjs/common';
import { FileManageService } from './application/file-manage.service';
import { FileReadController } from './interface/file-manage.controller';

@Module({
  providers: [FileManageService],
  controllers: [FileReadController],
  exports: [FileManageService],
})
export class FileManageModule {}
