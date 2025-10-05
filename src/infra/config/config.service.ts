import { Injectable } from '@nestjs/common';

export interface DatabaseConfig {
  url: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
}

/**
 * ConfigService - Centralized configuration management
 *
 * Provides type-safe access to application configuration.
 * Reads from environment variables with fallback defaults.
 */
@Injectable()
export class ConfigService {
  get database(): DatabaseConfig {
    return {
      url: process.env.DATABASE_URL || '',
    };
  }

  get app(): AppConfig {
    return {
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: (process.env.NODE_ENV || 'development') as AppConfig['nodeEnv'],
    };
  }

  /**
   * Check if running in production
   */
  get isProduction(): boolean {
    return this.app.nodeEnv === 'production';
  }

  /**
   * Check if running in development
   */
  get isDevelopment(): boolean {
    return this.app.nodeEnv === 'development';
  }

  /**
   * Check if running in test
   */
  get isTest(): boolean {
    return this.app.nodeEnv === 'test';
  }
}
