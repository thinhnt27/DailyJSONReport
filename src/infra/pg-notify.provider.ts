// src/infra/pg-notify.provider.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientConfig } from 'pg';
import { Client as PgRawClient } from 'pg';

interface AlarmPayload {
  user_id?: string;
  detected_at?: string; // ISO
  bucket_day?: string; // YYYY-MM-DD
  op?: string;
  at?: string;
  source_trigger?: string; // <— thêm để log nguồn trigger
}

function isAlarmPayload(v: unknown): v is AlarmPayload {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const isStr = (x: unknown) => typeof x === 'string';
  if (o.user_id !== undefined && !isStr(o.user_id)) return false;
  if (o.detected_at !== undefined && !isStr(o.detected_at)) return false;
  if (o.bucket_day !== undefined && !isStr(o.bucket_day)) return false;
  if (o.op !== undefined && !isStr(o.op)) return false;
  if (o.at !== undefined && !isStr(o.at)) return false;
  if (o.source_trigger !== undefined && !isStr(o.source_trigger)) return false;
  return true;
}

function parsePayload(payload: string | null): AlarmPayload | null {
  if (payload == null) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    return isAlarmPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Tối thiểu các API bạn dùng từ pg.Client */
interface IPgClient {
  connect(): Promise<void>;
  query(sql: string): Promise<void>;
  end(): Promise<void>;
  on(
    event: 'notification',
    listener: (msg: { channel: string; payload: string | null }) => void,
  ): this;
}

/** Factory cô lập cast any để không vướng no-unsafe-* */
function createPgClient(config: ClientConfig): IPgClient {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const raw = new PgRawClient(config);

  const client: IPgClient = {
    connect: async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await (raw as any).connect();
    },
    query: async (sql: string): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await (raw as any).query(sql);
    },
    end: async (): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await (raw as any).end();
    },
    on: (event, listener) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (raw as any).on(event, listener);
      return client;
    },
  };
  return client;
}

/** Chỉ cho phép channel theo pattern identifier PostgreSQL */
function sanitizeChannel(input: string): string {
  const name = input.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    // fallback an toàn
    return 'detection_alarm_channel';
  }
  return name;
}

@Injectable()
export class PgNotifyProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgNotifyProvider.name);
  private client: IPgClient | null = null;

  /** Channel riêng đúng trigger bạn muốn nghe (cấu hình qua ENV) */
  private readonly CHANNEL = sanitizeChannel(
    process.env.PG_NOTIFY_CHANNEL ?? 'detection_alarm_channel',
  );

  /** Lưu lại notify gần nhất để debug nhanh */
  public lastNotify?: { at: string; payload: AlarmPayload };

  /** Callback khi có notify */
  onAlarm?: (p: AlarmPayload) => void;

  async onModuleInit(): Promise<void> {
    this.logger.log('PgNotifyProvider init starting');

    const dsn = process.env.DATABASE_URL ?? process.env.DATABASE_URL;

    if (!dsn || dsn.trim().length === 0) {
      this.logger.error('Missing PG_NOTIFY_DATABASE_URL / DATABASE_URL env');
      throw new Error('Missing DATABASE_URL env');
    }

    this.logger.log(`PgNotifyProvider using DSN=${dsn}`);
    this.logger.log(`PgNotifyProvider channel=${this.CHANNEL}`);

    const config: ClientConfig = {
      connectionString: dsn,
      ssl: { rejectUnauthorized: false },
    };

    const client = createPgClient(config);
    await client.connect();

    client.on('notification', (msg) => {
      this.logger.log(
        `Raw NOTIFY: channel=${msg.channel} payload=${msg.payload}`,
      );

      if (msg.channel !== this.CHANNEL) return;

      const data = parsePayload(msg.payload);
      if (data) {
        this.lastNotify = { at: new Date().toISOString(), payload: data };
        this.logger.log(
          `NOTIFY <- channel=${this.CHANNEL} trigger=${
            data.source_trigger ?? 'unknown'
          } bucket_day=${data.bucket_day ?? 'n/a'}`,
        );
        this.onAlarm?.(data);
      } else {
        this.logger.warn(
          `Ignored NOTIFY payload (invalid JSON/shape): ${String(msg.payload)}`,
        );
      }
    });

    await client.query(`LISTEN ${this.CHANNEL}`);

    this.client = client;
    this.logger.log(`LISTEN ${this.CHANNEL} ready`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.query(`UNLISTEN ${this.CHANNEL}`);
      await this.client.end();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown error on disconnect';
      this.logger.warn(`pg disconnect warning: ${msg}`);
    } finally {
      this.client = null;
    }
  }
}
