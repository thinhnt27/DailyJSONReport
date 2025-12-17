import type { suggestions } from '@prisma/client';

export const SUGGESTION_REPO = 'SUGGESTION_REPO';

export interface ISuggestionRepo {
  // Query methods
  findByUserId(userId: string, category?: string): Promise<suggestions[]>;
  findById(suggestionId: string): Promise<suggestions | null>;
  findByType(userId: string, type: string): Promise<suggestions | null>;
  findActiveSuggestionsByType(type: string): Promise<suggestions[]>;

  // Command methods
  create(data: CreateSuggestionData): Promise<suggestions>;
  update(
    suggestionId: string,
    data: Partial<UpdateSuggestionData>,
  ): Promise<suggestions>;
  skip(suggestionId: string): Promise<suggestions>;
  unskip(suggestionId: string): Promise<suggestions>;
  resolve(suggestionId: string): Promise<suggestions>;
  deleteById(suggestionId: string): Promise<void>;
  upsertSuggestion(data: CreateSuggestionData): Promise<suggestions>;
}

// Data transfer types for repository
export interface CreateSuggestionData {
  user_id: string;
  type: string;
  title: string;
  message?: string;
  meta?: Record<string, any>;
  resource_type?: string;
  resource_id?: string;
}

export interface UpdateSuggestionData {
  status?: string;
  skip_until?: Date;
  skip_reason?: string;
  updated_at?: Date;
}
