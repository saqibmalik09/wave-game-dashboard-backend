export const GAME_NAME_BY_ID: Record<number, string> = {
  1: 'Greedy',
  16: 'Teen Patti',
  17: 'Crazy Fruit',
  77: 'Lucky 77',
};

export function gameName(gameId: number): string {
  return GAME_NAME_BY_ID[gameId] ?? `Game ${gameId}`;
}

export type ProfitRow = {
  gameId?: number;
  type: number | null;
  _sum: { bet: number | null };
  _count: { _all: number };
};

export type ProfitTotals = {
  totalBetAmount: number;
  totalPayoutAmount: number;
  totalBets: number;
  netProfit: number;
  profitPercentage: number;
  rtpPercent: number;
};

export function emptyProfitTotals(): ProfitTotals {
  return {
    totalBetAmount: 0,
    totalPayoutAmount: 0,
    totalBets: 0,
    netProfit: 0,
    profitPercentage: 0,
    rtpPercent: 0,
  };
}

export function finalizeProfitTotals(
  stakes: number,
  payouts: number,
  betCount = 0,
): ProfitTotals {
  const netProfit = stakes - payouts;
  return {
    totalBetAmount: stakes,
    totalPayoutAmount: payouts,
    totalBets: betCount,
    netProfit,
    profitPercentage:
      stakes > 0 ? +((netProfit / stakes) * 100).toFixed(2) : 0,
    rtpPercent: stakes > 0 ? +((payouts / stakes) * 100).toFixed(2) : 0,
  };
}

export function buildPerGameProfitStats(
  rows: Array<{
    gameId: number;
    type: number | null;
    _sum: { bet: number | null };
    _count: { _all: number };
  }>,
) {
  const gameMap: Record<
    number,
    { gameId: number; totalBetAmount: number; totalPayoutAmount: number; totalBets: number }
  > = {};

  for (const row of rows) {
    const gameId = row.gameId;
    if (!gameMap[gameId]) {
      gameMap[gameId] = {
        gameId,
        totalBetAmount: 0,
        totalPayoutAmount: 0,
        totalBets: 0,
      };
    }
    if (row.type === 1) {
      gameMap[gameId].totalBetAmount += row._sum.bet || 0;
      gameMap[gameId].totalBets += row._count._all;
    }
    if (row.type === 2) {
      gameMap[gameId].totalPayoutAmount += row._sum.bet || 0;
    }
  }

  return Object.values(gameMap)
    .map((g) => {
      const totals = finalizeProfitTotals(
        g.totalBetAmount,
        g.totalPayoutAmount,
        g.totalBets,
      );
      return {
        gameId: g.gameId,
        gameName: gameName(g.gameId),
        totalBetAmount: totals.totalBetAmount,
        totalPayoutAmount: totals.totalPayoutAmount,
        totalBets: totals.totalBets,
        netProfit: totals.netProfit,
        profitPercentage: totals.profitPercentage,
        rtpPercent: totals.rtpPercent,
        houseProfitPercent: totals.profitPercentage,
      };
    })
    .sort((a, b) => a.gameId - b.gameId);
}

export function summarizeGames(
  games: Array<{
    totalBetAmount: number;
    totalPayoutAmount: number;
    totalBets: number;
    netProfit: number;
  }>,
): ProfitTotals {
  const stakes = games.reduce((s, g) => s + g.totalBetAmount, 0);
  const payouts = games.reduce((s, g) => s + g.totalPayoutAmount, 0);
  const betCount = games.reduce((s, g) => s + g.totalBets, 0);
  return finalizeProfitTotals(stakes, payouts, betCount);
}
