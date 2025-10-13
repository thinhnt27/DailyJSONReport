// src/modules/file-manage/application/file-manage.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream, promises as fs } from 'fs';
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

const SUBDIR_SAFE = /[^\w./-]/g;
const DATE_DDMMYYYY = /^\d{2}-\d{2}-\d{4}$/;

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

  async findFirstJsonPathByDate(subdir: string | undefined, date: string) {
    const cleanSubdir = (subdir ?? 'events').replace(SUBDIR_SAFE, '');
    if (!DATE_DDMMYYYY.test(date))
      throw new NotFoundException('Invalid date format dd-MM-yyyy');

    const dir = join(this.baseDir, cleanSubdir, date);
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      throw new NotFoundException(`Folder not found: ${cleanSubdir}/${date}`);
    }

    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
      .map((e) => e.name);

    if (files.length === 0) {
      throw new NotFoundException(`No JSON files in ${cleanSubdir}/${date}`);
    }

    // Lấy file mới nhất theo mtime
    const stats = await Promise.all(
      files.map(async (name) => {
        const full = join(dir, name);
        const st = await fs.stat(full);
        return { name, full, mtimeMs: st.mtimeMs, size: st.size };
      }),
    );
    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const top = stats[0];
    return top; // { name, full, mtimeMs, size }
  }

  /** Đọc và parse JSON đầu tiên theo ngày */
  async readFirstJsonByDate<T = unknown>(input: {
    subdir?: string;
    date: string;
  }): Promise<{
    filename: string;
    fullPath: string;
    size: number;
    mtimeMs: number;
    data: T;
  }> {
    const f = await this.findFirstJsonPathByDate(input.subdir, input.date);
    const buf = await fs.readFile(f.full);
    const text = buf.toString('utf-8');

    // parse sang unknown trước (tránh any)
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new BadRequestException('Invalid JSON content');
    }

    // Nếu bạn không có schema, assert T ở đây (chấp nhận rủi ro dữ liệu sai shape)
    const data = parsed as T;

    return {
      filename: f.name,
      fullPath: f.full,
      size: f.size,
      mtimeMs: f.mtimeMs,
      data,
    };
  }

  /** Lấy stream file thô (để tải về) */
  async streamFirstJsonByDate(input: { subdir?: string; date: string }) {
    const f = await this.findFirstJsonPathByDate(input.subdir, input.date);
    return {
      filename: f.name,
      fullPath: f.full,
      size: f.size,
      stream: createReadStream(f.full),
    };
  }
}
