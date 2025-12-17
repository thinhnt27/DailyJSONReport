import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SkipSuggestionDto {
  @ApiProperty({
    description: 'Whether to skip (true) or unskip (false)',
    required: true,
    type: Boolean,
  })
  @IsBoolean()
  skip!: boolean;
}

export class SkipSuggestionResponseDto {
  success: boolean;
  data: {
    id: string;
    isSkipped: boolean;
    skipUntil: Date | null;
  };
}
