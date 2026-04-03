export class UpdateGameSettingsDto {
  appKey: string;
  gameId: number;
  winningPercentage?: {
    potA: number;  // User-friendly: POT A
    potB: number;  // User-friendly: POT B
    potC: number;  // User-friendly: POT C
  };
  maxBetLimit?: number;
}

export class GameSettingsResponseDto {
  id: number;
  appKey: string;
  gameId: number;
  winningPercentage: {
    potA: number;
    potB: number;
    potC: number;
  };
  maxBetLimit: number;
  createdAt: Date;
  updatedAt: Date;
}