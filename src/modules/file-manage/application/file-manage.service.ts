// src/modules/file-manage/application/file-manage.service.ts
import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID, createHash } from 'crypto';

export type SaveJsonInput = {
  subdir?: string; // vd: 'events' | 'analyses'
  nameHint?: string; // vd: 'event_123'
  data: unknown;
};

function formatVNDateFolder(d: Date) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  return s.replace(/\//g, '-'); // dd-MM-yyyy
}

@Injectable()
export class FileManageService {
  // ⬇️ Đổi sang thư mục trong repo. Có thể set ENV FILE_BASE_DIR=src/data
  private readonly baseDir = join(
    process.cwd(),
    process.env.FILE_BASE_DIR?.trim() || 'src/data',
  );

  async saveJson(input: SaveJsonInput) {
    const id = randomUUID();
    const subdir = input.subdir?.replace(/[^\w\-./]/g, '') || 'events';
    const dateFolder = formatVNDateFolder(new Date());
    const safeName = (input.nameHint ?? 'data').replace(/[^\w.-]+/g, '_');

    // src/data/<subdir>/<dd-MM-yyyy>/<uuid>_<hint>.json
    const relPath = join(subdir, dateFolder, `${id}_${safeName}.json`);
    const fullPath = join(this.baseDir, relPath);

    const jsonBuf = Buffer.from(JSON.stringify(input.data, null, 2), 'utf-8');
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, jsonBuf);

    const checksum = createHash('sha256').update(jsonBuf).digest('hex');
    return {
      id,
      filename: relPath.replace(/\\/g, '/'),
      fullPath,
      size: jsonBuf.length,
      checksum,
    };
  }
}
