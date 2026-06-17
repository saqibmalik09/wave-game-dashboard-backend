import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client-master';
import { masterPrisma } from 'src/prisma/masterClient';
import {
  buildPerGameProfitStats,
  finalizeProfitTotals,
  gameName,
  summarizeGames,
} from './bet-stats.util';

type BetTable = 'Bet' | 'AllBet';

@Injectable()
export class BetStatsService {
  async profitByGame(appKeys: string[], table: BetTable = 'Bet') {
    const rows =
      table === 'AllBet'
        ? await masterPrisma.allBet.groupBy({
            by: ['gameId', 'type'],
            where: { appKey: { in: appKeys } },
            _sum: { bet: true },
            _count: { _all: true },
          })
        : await masterPrisma.bet.groupBy({
            by: ['gameId', 'type'],
            where: { appKey: { in: appKeys } },
            _sum: { bet: true },
            _count: { _all: true },
          });
    const games = buildPerGameProfitStats(rows);
    const summary = summarizeGames(games);
    return { games, summary };
  }

  async profitByGameInRange(
    appKeys: string[],
    from: Date,
    toExclusive: Date,
    table: BetTable = 'Bet',
  ) {
    const where = {
      appKey: { in: appKeys },
      createdAt: { gte: from, lt: toExclusive },
    };
    const rows =
      table === 'AllBet'
        ? await masterPrisma.allBet.groupBy({
            by: ['gameId', 'type'],
            where,
            _sum: { bet: true },
            _count: { _all: true },
          })
        : await masterPrisma.bet.groupBy({
            by: ['gameId', 'type'],
            where,
            _sum: { bet: true },
            _count: { _all: true },
          });
    return buildPerGameProfitStats(rows);
  }

  async profitByUser(
    appKeys: string[],
    table: BetTable = 'Bet',
    limit = 50,
  ) {
    const tableName = table === 'AllBet' ? 'AllBet' : 'Bet';
    const rows = await masterPrisma.$queryRaw<
      Array<{
        userId: string | null;
        stakes: bigint | number | null;
        payouts: bigint | number | null;
      }>
    >(
      Prisma.sql`
        SELECT
          userId,
          SUM(CASE WHEN type = 1 THEN COALESCE(bet, 0) ELSE 0 END) AS stakes,
          SUM(CASE WHEN type = 2 THEN COALESCE(bet, 0) ELSE 0 END) AS payouts
        FROM ${Prisma.raw(tableName)}
        WHERE appKey IN (${Prisma.join(appKeys)})
        GROUP BY userId
        ORDER BY stakes DESC
        LIMIT ${limit}
      `,
    );

    const userIds = rows
      .map((r) => r.userId)
      .filter((id): id is string => Boolean(id));

    const users =
      userIds.length > 0
        ? await masterPrisma.user.findMany({
            where: { userId: { in: userIds }, appKey: { in: appKeys } },
          })
        : [];

    const userNameById = new Map(
      users.map((u) => [u.userId ?? String(u.id), u.name ?? '']),
    );

    return rows.map((row) => {
      const stakes = Number(row.stakes ?? 0);
      const payouts = Number(row.payouts ?? 0);
      const totals = finalizeProfitTotals(stakes, payouts);
      const uid = row.userId ?? '';
      return {
        userId: uid,
        userName: userNameById.get(uid) ?? uid,
        totalBetAmount: stakes,
        totalPayoutAmount: payouts,
        netPlayerResult: payouts - stakes,
        houseProfitFromUser: totals.netProfit,
        rtpPercent: totals.rtpPercent,
      };
    });
  }

  async dailyAggregates(
    appKeys: string[],
    from: Date,
    toExclusive: Date,
    table: BetTable = 'Bet',
  ) {
    const tableName = table === 'AllBet' ? 'AllBet' : 'Bet';
    const rows = await masterPrisma.$queryRaw<
      Array<{
        day: Date | string;
        totalBetCoins: bigint | number | null;
        customerWinCoins: bigint | number | null;
      }>
    >(
      Prisma.sql`
        SELECT
          DATE(createdAt) AS day,
          SUM(CASE WHEN type = 1 THEN COALESCE(bet, 0) ELSE 0 END) AS totalBetCoins,
          SUM(CASE WHEN type = 2 THEN COALESCE(bet, 0) ELSE 0 END) AS customerWinCoins
        FROM ${Prisma.raw(tableName)}
        WHERE appKey IN (${Prisma.join(appKeys)})
          AND createdAt >= ${from}
          AND createdAt < ${toExclusive}
        GROUP BY DATE(createdAt)
        ORDER BY day ASC
      `,
    );

    return rows.map((row) => {
      const totalBetCoins = Number(row.totalBetCoins ?? 0);
      const customerWinCoins = Number(row.customerWinCoins ?? 0);
      const profitCoins = totalBetCoins - customerWinCoins;
      const rtpPercent =
        totalBetCoins > 0
          ? +((customerWinCoins / totalBetCoins) * 100).toFixed(2)
          : 0;
      const day =
        row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day).slice(0, 10);
      return { day, totalBetCoins, customerWinCoins, profitCoins, rtpPercent };
    });
  }

  async perDayGamePlayer(
    appKeys: string[],
    from: Date,
    toExclusive: Date,
    table: BetTable = 'Bet',
  ) {
    const tableName = table === 'AllBet' ? 'AllBet' : 'Bet';
    const rows = await masterPrisma.$queryRaw<
      Array<{
        day: Date | string;
        gameId: number;
        userId: string | null;
        betPlacedCoins: bigint | number | null;
        winCoins: bigint | number | null;
      }>
    >(
      Prisma.sql`
        SELECT
          DATE(createdAt) AS day,
          gameId,
          userId,
          SUM(CASE WHEN type = 1 THEN COALESCE(bet, 0) ELSE 0 END) AS betPlacedCoins,
          SUM(CASE WHEN type = 2 THEN COALESCE(bet, 0) ELSE 0 END) AS winCoins
        FROM ${Prisma.raw(tableName)}
        WHERE appKey IN (${Prisma.join(appKeys)})
          AND createdAt >= ${from}
          AND createdAt < ${toExclusive}
        GROUP BY DATE(createdAt), gameId, userId
        ORDER BY day ASC, gameId ASC, betPlacedCoins DESC
      `,
    );

    const userIds = [
      ...new Set(
        rows.map((r) => r.userId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const users =
      userIds.length > 0
        ? await masterPrisma.user.findMany({
            where: { userId: { in: userIds }, appKey: { in: appKeys } },
          })
        : [];
    const userNameById = new Map(
      users.map((u) => [u.userId ?? String(u.id), u.name ?? '']),
    );

    return rows.map((row) => {
      const day =
        row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day).slice(0, 10);
      const uid = row.userId ?? '';
      return {
        day,
        gameId: Number(row.gameId),
        gameName: gameName(Number(row.gameId)),
        userId: uid,
        userName: userNameById.get(uid) ?? uid,
        betPlacedCoins: Number(row.betPlacedCoins ?? 0),
        winCoins: Number(row.winCoins ?? 0),
      };
    });
  }

  async betLogTotals(appKeys: string[], table: BetTable, limit: number) {
    const rows =
      table === 'AllBet'
        ? await masterPrisma.allBet.findMany({
            where: { appKey: { in: appKeys } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : await masterPrisma.bet.findMany({
            where: { appKey: { in: appKeys } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          });

    let totalBetCoins = 0;
    let totalWinningCoins = 0;
    let totalBetActions = 0;
    let totalWinActions = 0;
    for (const row of rows) {
      const amount = row.bet ?? 0;
      if (row.type === 1) {
        totalBetCoins += amount;
        totalBetActions += 1;
      } else if (row.type === 2) {
        totalWinningCoins += amount;
        totalWinActions += 1;
      }
    }
    const netProfit = totalBetCoins - totalWinningCoins;
    return {
      rows,
      totals: {
        rows: rows.length,
        totalBetActions,
        totalWinActions,
        totalBetCoins,
        totalWinningCoins,
        netProfit,
        profitPercentage:
          totalBetCoins > 0
            ? +((netProfit / totalBetCoins) * 100).toFixed(2)
            : 0,
        rtpPercent:
          totalBetCoins > 0
            ? +((totalWinningCoins / totalBetCoins) * 100).toFixed(2)
            : 0,
      },
    };
  }
}
