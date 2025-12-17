import { IsUUID, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SuggestionCategory } from '../../domain/suggestion.entity';

// Query DTO
export class GetSuggestionsQueryDto {
  @ApiProperty({
    description: 'User ID to get suggestions for',
    example: '82f8c132-72e0-4c77-97a6-9c2a12dc1c49',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Filter by category',
    required: false,
    enum: SuggestionCategory,
  })
  @IsOptional()
  @IsEnum(SuggestionCategory)
  category?: SuggestionCategory;
}

// Response DTOs
export class SuggestionItemDto {
  id: string;
  type: SuggestionCategory;
  title: string;
  message: string;
  bullets: string[];
  status: string;
  isSkipped: boolean;
  skipUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SuggestionResponseDto {
  success: boolean;
  data: SuggestionItemDto[];
  total: number;
}
