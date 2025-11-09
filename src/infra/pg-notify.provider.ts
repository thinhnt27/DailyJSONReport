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

@Injectable()
export class PgNotifyProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgNotifyProvider.name);
  private client: IPgClient | null = null;

  /** Channel riêng cho đúng trigger */
  private readonly CHANNEL =
    process.env.PG_NOTIFY_CHANNEL?.trim() || 'system_alarm_channel_update';

  /** Đăng ký callback nhận thông báo */
  onAlarm?: (p: AlarmPayload) => void;

  async onModuleInit(): Promise<void> {
    const dsn = process.env.DATABASE_URL; // hoặc SUPABASE_DB_URL_SESSION nếu bạn dùng DSN session
    if (!dsn || dsn.trim().length === 0) {
      throw new Error('Missing DATABASE_URL env');
    }

    const config: ClientConfig = {
      connectionString: dsn,
      ssl: { rejectUnauthorized: false },
    };

    const client = createPgClient(config);
    await client.connect();
    await client.query(`LISTEN ${this.CHANNEL}`);

    client.on('notification', (msg) => {
      if (msg.channel !== this.CHANNEL) return;
      const data = parsePayload(msg.payload);
      if (data) {
        this.onAlarm?.(data);
      } else {
        this.logger.warn(
          `Ignored NOTIFY payload (invalid JSON/shape): ${String(msg.payload)}`,
        );
      }
    });

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
