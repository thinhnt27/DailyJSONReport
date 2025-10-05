import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/**
 * ConfigModule - Global configuration module
 *
 * Provides centralized configuration management across the application.
 * Uses environment variables and .env file for configuration.
 *
 * Features:
 * - Type-safe configuration access
 * - Environment variable validation
 * - Default values support
 * - Global availability via @Global decorator
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
