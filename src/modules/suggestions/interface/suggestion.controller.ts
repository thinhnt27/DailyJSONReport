// Controller for Suggestion REST API
import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SuggestionService } from '../application/suggestion.service';
import { GetSuggestionsQueryDto, SuggestionResponseDto } from './dto/get-suggestions.dto';
import { SkipSuggestionDto, SkipSuggestionResponseDto } from './dto/skip-suggestion.dto';
import { SuggestionCategory } from '../domain/suggestion.entity';

@ApiTags('Suggestions')
@Controller('api/suggestions')
export class SuggestionController {
  constructor(private readonly suggestionService: SuggestionService) {}

  /**
   * GET /api/suggestions
   * Retrieve active suggestions for a user
   */
  @Get()
  @ApiOperation({
    summary: 'Get user suggestions',
    description: 'Retrieve active suggestions for a specific user, optionally filtered by category',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved suggestions',
    type: SuggestionResponseDto,
  })
  @ApiQuery({ name: 'userId', required: true, type: String, description: 'User ID' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: SuggestionCategory,
    description: 'Filter by suggestion category',
  })
  async getSuggestions(
    @Query() query: GetSuggestionsQueryDto,
  ): Promise<SuggestionResponseDto> {
    const suggestions = await this.suggestionService.getSuggestionsForUser(
      query.userId,
      query.category,
    );

    return {
      success: true,
      data: suggestions.map((s) => {
        // Parse meta if it's a string
        let meta: any = s.meta;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch (e) {
            meta = {};
          }
        }
        
        return {
          id: s.suggestion_id,
          type: s.type as SuggestionCategory,
          title: s.title || '',
          message: s.message || '',
          bullets: (meta?.bullets as string[]) || [],
          status: s.status,
          isSkipped: s.skip_until ? new Date(s.skip_until) > new Date() : false,
          skipUntil: s.skip_until,
          createdAt: s.created_at,
          updatedAt: s.updated_at || s.created_at,
        };
      }),
      total: suggestions.length,
    };
  }

  /**
   * POST /api/suggestions/:id/toggle-skip
   * Toggle skip status for a suggestion (skip for 30 days or unskip)
   */
  @Post(':id/toggle-skip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle skip status',
    description: 'Skip a suggestion for 30 days or unskip it',
  })
  @ApiParam({ name: 'id', description: 'Suggestion ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Successfully toggled skip status',
    type: SkipSuggestionResponseDto,
  })
  async toggleSkip(
    @Param('id') id: string,
    @Body() body: SkipSuggestionDto,
  ): Promise<SkipSuggestionResponseDto> {
    const updated = await this.suggestionService.toggleSkipSuggestion(
      id,
      body.skip,
    );

    return {
      success: true,
      data: {
        id: updated.suggestion_id,
        isSkipped: updated.skip_until ? new Date(updated.skip_until) > new Date() : false,
        skipUntil: updated.skip_until,
      },
    };
  }

  /**
   * POST /api/suggestions/:id/resolve
   * Resolve (dismiss) a suggestion
   */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve suggestion',
    description: 'Mark a suggestion as resolved/dismissed',
  })
  @ApiParam({ name: 'id', description: 'Suggestion ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Successfully resolved suggestion',
  })
  async resolve(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.suggestionService.resolveSuggestion(id);
    return { success: true };
  }

  /**
   * POST /api/suggestions/analyze/:userId
   * Manual trigger for testing - analyze fall risk for a specific user
   */
  @Post('analyze/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manual trigger analysis',
    description: 'Manually trigger fall risk analysis for a user (for testing)',
  })
  @ApiParam({ name: 'userId', description: 'User ID to analyze', type: String })
  @ApiQuery({ 
    name: 'days', 
    required: false, 
    type: Number, 
    description: 'Number of days to look back (default: 7)',
    example: 7,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully triggered analysis',
  })
  async manualAnalyze(
    @Param('userId') userId: string,
    @Query('days') days?: number,
  ): Promise<{ success: boolean; message: string; details: { days: number } }> {
    const daysToAnalyze = days ? Number(days) : 7;
    await this.suggestionService.analyzeFallRiskForUser(userId, daysToAnalyze);
    return { 
      success: true,
      message: `Analysis completed for user ${userId}`,
      details: { days: daysToAnalyze },
    };
  }

  /**
   * POST /api/suggestions/device-check/:userId
   * Manually trigger device check analysis for a specific user
   */
  @Post('device-check/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger device check analysis',
    description: 'Manually analyze camera quality and generate device check suggestions',
  })
  @ApiParam({ name: 'userId', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully triggered device check analysis',
  })
  async manualDeviceCheck(
    @Param('userId') userId: string,
    @Query('debug') debug?: string,
  ): Promise<any> {
    const result = await this.suggestionService.analyzeDeviceCheckForUser(userId, debug === 'true');
    return result || { 
      success: true,
      message: `Device check analysis completed for user ${userId}`,
    };
  }
}

