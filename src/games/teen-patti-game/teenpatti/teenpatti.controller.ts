import { Controller, Post, Get, Body, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { TeenpattiService } from './teenpatti.service';

@ApiTags('Teenpatti')
@Controller('teenpatti')
export class TeenpattiController {
  constructor(private readonly teenpattiService: TeenpattiService) { }

  @Post('/start-timers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually start the game timers' })
  async startTimersManually() {
    this.teenpattiService.startTimers();
    return { success: true, message: 'Timers started manually' };
  }

@Post('/game-settings/update')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Create or Update game settings (winning probability, multiplier & max bet limit)' })
@ApiBody({
  description: 'Game settings with probability and multiplier',
  schema: {
    type: 'object',
    required: ['appKey', 'gameId'],
    properties: {
      appKey: {
        type: 'string',
        example: 'Eeb1GshW3a',
        description: 'Unique app key for the game'
      },
      gameId: {
        type: 'number',
        example: 16,
        description: 'Game ID'
      },
      winningProbabilityChance: {
        type: 'object',
        description: 'Winning probability for low, medium, high',
        properties: {
          low: { type: 'number', example: 0.4, description: 'Low probability' },
          medium: { type: 'number', example: 0.4, description: 'Medium probability' },
          high: { type: 'number', example: 0.2, description: 'High probability' }
        }
      },
      winningMultiplier: {
        type: 'object',
        description: 'Winning multiplier for POT A, POT B, POT C',
        properties: {
          potA: { type: 'number', example: 2.9, description: 'POT A multiplier (index 0)' },
          potB: { type: 'number', example: 2.9, description: 'POT B multiplier (index 1)' },
          potC: { type: 'number', example: 2.9, description: 'POT C multiplier (index 2)' }
        }
      },
      maxBetLimit: {
        type: 'number',
        example: 500000,
        description: 'Maximum bet limit'
      }
    }
  }
})
@ApiResponse({
  status: 200,
  description: 'Game settings created/updated successfully',
  schema: {
    example: {
      success: true,
      message: 'Game settings updated successfully',
      data: {
        id: 1,
        appKey: 'Eeb1GshW3a',
        gameId: 16,
        winningProbabilityChance: {
          low: 0.4,
          medium: 0.4,
          high: 0.2
        },
        winningMultiplier: {
          potA: 2.9,
          potB: 2.9,
          potC: 2.9
        },
        maxBetLimit: 500000,
        createdAt: '2025-01-25T10:30:00.000Z',
        updatedAt: '2025-01-25T10:30:00.000Z'
      }
    }
  }
})
async upsertGameSettings(@Body() body: any) {
  return await this.teenpattiService.upsertGameSettings(body);
}
  @Get('/game-settings/:appKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get game settings by appKey' })
  @ApiResponse({
    status: 200,
    description: 'Game settings retrieved successfully'
  })
  async getGameSettings(@Param('appKey') appKey: string) {
    return await this.teenpattiService.getGameSettings(appKey);
  }
}

