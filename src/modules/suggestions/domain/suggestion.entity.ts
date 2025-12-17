// Re-export Prisma generated type as Domain entity
export type { suggestions as Suggestion } from '@prisma/client';

// Suggestion categories
export enum SuggestionCategory {
  FALL_RISK = 'fallRisk',
  DEVICE_CHECK = 'deviceCheck',
  SLEEP_QUALITY = 'sleepQuality',
}

// Suggestion interaction types
export enum SuggestionInteractionType {
  BENEFITS_ONLY = 'benefitsOnly',
  RISKS_ONLY = 'risksOnly',
}

// Status enum
export type SuggestionStatus = 'ACTIVE' | 'HIDDEN' | 'RESOLVED';
