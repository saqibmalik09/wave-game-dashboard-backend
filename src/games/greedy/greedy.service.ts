import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Redis } from 'ioredis';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import axios from 'axios';
import { masterPrisma } from 'src/prisma/masterClient';
import { GreedyBetQueueService } from './greedy-bet-queue.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class GreedyService implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GreedyService.name);

  constructor(
    private readonly betQueue: GreedyBetQueueService,
    @Inject('IOREDIS_CLIENT') private readonly ioredis: Redis,
  ) {
    // greedy handler
  }
  @WebSocketServer()
  server: Server;

  // Required WebSocket lifecycle methods
  afterInit(server: Server) {
    this.betQueue.setServer(server); // Pass server to queue service
    this.logger.log('WebSocket Gateway initialized with BullMQ queue');
  }

  async handleConnection(client: Socket) {
    const userId = String(client.handshake.query.userId ?? '');
    const appKey = String(client.handshake.query.appKey ?? '');
    const token = String(client.handshake.query.token ?? '');
    const gameId = Number(client.handshake.query.gameId ?? '');
    console.log(`Client connected: ${client.id} for userId: ${userId} gameId: ${gameId}`);
    if (gameId != 1) {
      console.log(`Invalid gameId ${gameId} for Greedys`);
      return;
    }
    try {
      if (client.data.initialized) return;
      client.data.initialized = true;

      await masterPrisma.$transaction(async (tx) => {
        const existing = await tx.gameOngoingUsers.findUnique({
          where: { userId },
        });

        if (existing) {
          console.log(`Updating existing ongoing user record for userId ${userId} gameId ${gameId}`);
          await tx.gameOngoingUsers.update({
            where: { userId },
            data: {
              socketId: client.id,
              appKey,
              token,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.gameOngoingUsers.create({
            data: {
              userId,
              socketId: client.id,
              gameId: gameId,
              appKey,
              token
            },
          });
        }
      });
      await client.join(`user:${userId}`);

    } catch (err) {
      if (err.code === 'P2002') {
        console.warn(`Duplicate connection ignored for userId ${userId}`);
        return;
      }

      console.error('DB error:', err);
    }

  }


  async handleDisconnect(client: Socket) {
    try {
      console.log(`Client disconnected: ${client.id}`);
      // 1. Find user record using socketId
      const user = await masterPrisma.gameOngoingUsers.findFirst({
        where: { socketId: client.id },
      });
      if (user) {
        await masterPrisma.gameOngoingUsers.delete({
          where: { userId: user.userId },
        });
        await client.join(`user:${user.userId}`);
        console.log(`Deleted disconnected user: ${user.userId}`);
      } else {
        console.log(`No user found with socketId: ${client.id}`);
      }
    } catch (error) {
      console.error("Error in handleDisconnect:", error);
    }
  }

  public running = false;
  public announceWinningSent = false;
  public announceRoundCountSent = false;
  public potTotalBets: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
  };
  public winningPotHistory: string[] = [];

  public GREEDY_POTS = [
    { index: 1, name: "Pot Burger", image: "BurgerGreedy.png" },
    { index: 2, name: "Pot Shrink", image: "ShrinkGreedy.png" },
    { index: 3, name: "Pot Fish", image: "FishGreedy.png" },
    { index: 4, name: "Pot Meat", image: "MeatGreedy.png" },
    { index: 5, name: "Pot Cherry", image: "CherryGreedy.png" },
    { index: 6, name: "Pot Orange", image: "OrangeGreedy.png" },
    { index: 7, name: "Pot Apple", image: "AppleGreedy.png" },
    { index: 8, name: "Pot Strawberry", image: "StrawberryGreedy.png" },
  ];
  public Users = [
    { userId: 'user_101', name: 'Alice', imageProfile: 'https://randomuser.me/api/portraits/women/55.jpg', socketId: "" },
    { userId: 'user_102', name: 'Bob', imageProfile: 'https://randomuser.me/api/portraits/men/98.jpg', socketId: "" },
    { userId: 'user_103', name: 'Charlie', imageProfile: 'https://randomuser.me/api/portraits/men/78.jpg', socketId: "" },
  ]
  private getPotByIndex(potIndex: number) {
    return this.GREEDY_POTS.find(p => p.index === potIndex) ?? {
      index: potIndex,
      name: "Unknown Pot",
      image: "DEFAULT_POT.png",
    };
  }
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  @SubscribeMessage('greedyTimer')
  async startTimers() {
    if (this.running) return; // prevent duplicate loops
    this.running = true;


    const phases = [
      { name: 'bettingTimer', duration: 20 },
      { name: 'winningCalculationTimer', duration: 3 },
      { name: 'resultAnnounceTimer', duration: 5 },
      { name: 'newGameStartTimer', duration: 3 },
    ];

    while (true) {
      this.announceWinningSent = false;
      this.announceRoundCountSent = false;
      for (const phase of phases) {
        for (let remaining = phase.duration; remaining >= 0; remaining--) {
          if (phase.name !== 'winningCalculationTimer') {
            this.announceWinningSent = false;
          }
          if (phase.name !== 'announceRoundCountSent') {
            this.announceRoundCountSent = false;
          }
          this.server.emit('greedyTimer', {
            phase: phase.name,
            remaining,
          });

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        // broadcast phase complete
        this.server.emit('greedyTimer', {
          phase: phase.name,
          message: `${phase.name} completed.`,
        });
        if (phase.name === 'winningCalculationTimer' && !this.announceWinningSent) {
          this.announceWinningSent = true;
          // this.sleep(2000).then(() => {
          this.announceGameResult().catch(console.error);
          // });
        }
        if (phase.name === 'resultAnnounceTimer' && !this.announceRoundCountSent) {
          this.announceRoundCountSent = true;
          await this.GameStartDetails();
        }
      }

    }
  }

  @SubscribeMessage('placeGreedyBet')
  async placeBet(@MessageBody()
  bet: {
    userId: string;
    amount: number;
    betType?: number;
    appKey?: string;
    token?: string;
    gameId?: string;
    potIndex?: number;
    socketId: string;
    tenantBaseURL?: string;
  },
  ) {
    const betId = uuidv4();
    const timestamp = Date.now();

    const { userId, gameId } = bet;

    try {
      // Verify user socket exists
      const userSocketId = await masterPrisma.gameOngoingUsers.findFirst({
        where: { userId, gameId: Number(gameId) },
        select: { socketId: true },
      });

      if (!userSocketId?.socketId) {
        this.logger.warn(`SocketId not found for userId: ${userId}`);
        this.server.to(`user:${userId}`).emit('greedyBetResponse', {
          success: false,
          message: 'User session not found.Please restart game',
        });
        return;
      }
      if (!bet.gameId || !bet.appKey) {
        this.server.to(`user:${userId}`).emit('greedyBetResponse', {
          success: false,
          message: 'Invalid game config',
        });
        return;
      }
      const gameSetting = await this.getGameConfiguration(bet.appKey, Number(bet.gameId));
      const betLimit = gameSetting.betLimit ?? 500000;

      const totalBetAmount = await this.betsByplayerId(userId);
      const newTotal = totalBetAmount + bet.amount;

      if (newTotal > betLimit) {
        let winningAmount = await this.betsByplayerIdPotsAmount(userId)
        this.server.to(`user:${userId}`).emit('greedyBetResponse', {
          success: false,
          message: `Bet limit ${betLimit} exceeded.`,
          betLimit: 1,
          winningAmount
        });
        return;
      }
      // Add bet to queue immediately
      const queueResult = await this.betQueue.addBetToQueue({
        betId,
        userId,
        amount: bet.amount,
        betType: bet.betType,
        token: bet.token,
        gameId: bet.gameId,
        potIndex: bet.potIndex,
        tenantBaseURL: bet.tenantBaseURL,
        appKey: bet.appKey,
        timestamp,
      });
      const index = Number(bet.potIndex);
      this.potTotalBets[index] = (this.potTotalBets[index] ?? 0) + bet.amount;
      this.server.emit('greedyPotTotalBets', this.potTotalBets);
      // Immediately respond to user (< 50ms)
      this.server.to(`user:${userId}`).emit('greedybetQueued', {
        success: true,
        message: 'Bet queued successfully',
        data: {
          betId,
          queuePosition: queueResult.queuePosition,
          timestamp,
          amount: bet.amount,
          potIndex: bet.potIndex,
        },
      });

      this.logger.log(
        ` Bet ${betId} queued instantly for user ${userId} (Position: ${queueResult.queuePosition})`,
      );

      return {
        success: true,
        message: 'Bet queued',
        data: {
          betId,
          queuePosition: queueResult.queuePosition,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to queue bet: ${error.message}`);

      this.server.to(`user:${userId}`).emit('greedyBetResponse', {
        success: false,
        message: 'Failed to queue bet',
      });

      return {
        success: false,
        message: error.message,
      };
    }
  }
  public async GameStartDetails() {
    // increment first
    const game = await masterPrisma.gameSettings.update({
      where: { id: 1 },
      data: {
        currentRoundID: {
          increment: 1,
        },
      },
      select: {
        currentRoundID: true,
      },
    });

    // emit updated count
    this.server.emit("CurrentRoundIDResponse", {
      success: true,
      message: "Current game round incremented",
      data: {
        count: game.currentRoundID,
      },
    });
  }




  // public greedyGameProbability(): number {
  //   const options = this.GREEDY_POTS.map(p => p.index);
  //   const randomIndex = Math.floor(Math.random() * options.length);
  //   return options[randomIndex];
  // }
  async greedyGameProbability(): Promise<number> {
    // HARD CONSTRAINTS - NEVER VIOLATE
    const MIN_HOUSE_EDGE = 0.05;   // 5% minimum (HARD FLOOR)
    const TARGET_HOUSE_EDGE = 0.15; // 15% target
    const MAX_HOUSE_EDGE = 0.30;    // 30% maximum (HARD CEILING)

    const MIN_USER_RTP = 0.70;      // Users get minimum 70%
    const TARGET_USER_RTP = 0.85;   // Target 85% user return
    const MAX_USER_RTP = 0.95;      // Maximum 95% user return

    // Get game configuration
    const gameSetting = await this.getGameConfiguration("Eeb1GshW3aa", 1);
    const baseProbabilities = gameSetting.winningProbabilityChance; // Your suggestion: 2,1,1,0,0,2,2,2
    const multipliers = gameSetting.winningMultiplier;

    // Current round data
    const totalCollected = Object.values(this.potTotalBets).reduce((s, b) => s + (b || 0), 0);

    if (totalCollected === 0) {
      return this.pickFromBaseProbabilities(baseProbabilities);
    }

    // ==========================================
    // CRITICAL: GET CUMULATIVE PROFIT STATS
    // ==========================================
    const cumulativeStats = await this.getHouseProfitStats(1);

    // Calculate current house edge from ALL historical data
    const currentHouseEdge = cumulativeStats.houseProfitPercent;
    // ==========================================
    // CALCULATE EACH POT'S POTENTIAL OUTCOME
    // ==========================================
    const potAnalysis: {
      pot: number;
      betAmount: number;
      potentialPayout: number;
      newHouseEdge: number;
      score: number;
    }[] = [];

    for (let pot = 1; pot <= 8; pot++) {
      const betAmount = this.potTotalBets[pot] || 0;
      const potentialPayout = betAmount * multipliers[pot];

      // Calculate what house edge would be if this pot wins
      const newTotalBet = cumulativeStats.totalBet + totalCollected;
      const newTotalPayout = cumulativeStats.totalPayout + potentialPayout;
      const newHouseEdge = (newTotalBet - newTotalPayout) / newTotalBet;

      let score = baseProbabilities[pot] || 0.1; // Start with base probability

      // ==========================================
      // HARD CONSTRAINT ENFORCEMENT
      // ==========================================

      // RULE 1: NEVER let house edge go below 5%
      if (newHouseEdge < MIN_HOUSE_EDGE) {
        // This pot would violate minimum profit - severely penalize
        score *= 0.01; // 99% reduction in probability
        console.log(`POT ${pot}: Would drop house edge to ${(newHouseEdge * 100).toFixed(2)}% (below ${MIN_HOUSE_EDGE * 100}%) - BLOCKED`);
      }

      // RULE 2: NEVER let house edge go above 30%
      else if (newHouseEdge > MAX_HOUSE_EDGE) {
        // House is taking too much - boost this pot heavily
        score *= 5.0;
        console.log(` POT ${pot}: House edge too high, boosting pot (new edge: ${(newHouseEdge * 100).toFixed(2)}%)`);
      }

      // RULE 3: Strong correction if approaching danger zones
      else if (newHouseEdge < 0.08) {
        // Approaching minimum - reduce probability
        score *= 0.2;
        console.log(` POT ${pot}: Near minimum edge (${(newHouseEdge * 100).toFixed(2)}%) - reducing`);
      }
      else if (newHouseEdge > 0.25) {
        // Approaching maximum - increase probability
        score *= 3.0;
        console.log(` POT ${pot}: Near maximum edge (${(newHouseEdge * 100).toFixed(2)}%) - increasing`);
      }

      // RULE 4: Gentle steering toward target (15%)
      else {
        const distanceFromTarget = Math.abs(newHouseEdge - TARGET_HOUSE_EDGE);

        if (newHouseEdge < TARGET_HOUSE_EDGE) {
          // Below target, prefer lower payouts
          score *= (1 - distanceFromTarget * 2);
        } else {
          // Above target, prefer higher payouts
          score *= (1 + distanceFromTarget * 2);
        }
      }

      // Ensure score stays positive
      score = Math.max(score, 0.001);

      potAnalysis.push({
        pot,
        betAmount,
        potentialPayout,
        newHouseEdge,
        score
      });
    }

    // ==========================================
    // SECONDARY FILTER: PREVENT CATASTROPHIC OUTCOMES
    // ==========================================

    // If current round would cause huge loss, filter out worst pots
    if (currentHouseEdge < 0.10) {
      // House is struggling - be extra conservative
      potAnalysis.forEach(p => {
        if (p.newHouseEdge < MIN_HOUSE_EDGE + 0.02) {
          p.score *= 0.05; // Further reduce risky pots
        }
      });
    }

    // ==========================================
    // WEIGHTED RANDOM SELECTION
    // ==========================================
    const totalWeight = potAnalysis.reduce((s, p) => s + p.score, 0);

    if (totalWeight === 0) {
      // Emergency fallback - pick pot with least payout
      const safestPot = potAnalysis.reduce((min, p) =>
        p.potentialPayout < min.potentialPayout ? p : min
      );
      console.log(` Emergency: Selecting safest pot ${safestPot.pot}`);
      return safestPot.pot;
    }

    let rand = Math.random() * totalWeight;

    for (const p of potAnalysis) {
      rand -= p.score;
      if (rand <= 0) {
        console.log(` Selected POT ${p.pot}: Payout=${p.potentialPayout}, New House Edge=${(p.newHouseEdge * 100).toFixed(2)}%`);
        return p.pot;
      }
    }

    // Final fallback
    return potAnalysis[0].pot;
  }

  // --- Helper: pick pure base probabilities ---
  private pickFromBaseProbabilities(baseProbabilities: Record<number, number>): number {
    const pool = Object.entries(baseProbabilities).map(([pot, weight]) => ({
      pot: parseInt(pot),
      weight,
    }));

    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;

    for (const p of pool) {
      rand -= p.weight;
      if (rand <= 0) return p.pot;
    }

    return pool[0]?.pot || 1;
  }

  // --- Helper: calculate exposure per pot ---
  public async calculateExposure(potTotalBets: Record<number, number>, multipliers: Record<number, number>) {
    const exposure: Record<number, number> = {};
    for (let pot = 1; pot <= 8; pot++) {
      exposure[pot] = (potTotalBets[pot] || 0) * multipliers[pot];
    }
    return exposure;
  }

  // --- Helper: get historical house/user stats ---
  async getHouseProfitStats(gameId: number) {
    const stats = await masterPrisma.bet.aggregate({
      where: { gameId },
      _sum: { bet: true },
    });

    const payouts = await masterPrisma.bet.aggregate({
      where: { gameId, type: 2 }, // type 2 = payout
      _sum: { bet: true },
    });

    const totalBet = stats._sum.bet ?? 0;
    const totalPayout = Math.abs(payouts._sum.bet ?? 0); // Ensure positive

    if (totalBet === 0) {
      return {
        totalBet: 0,
        totalPayout: 0,
        houseProfitPercent: 0,
        userReturnPercent: 0
      };
    }

    const houseProfit = totalBet - totalPayout;

    return {
      totalBet,
      totalPayout,
      houseProfit,
      houseProfitPercent: houseProfit / totalBet,
      userReturnPercent: totalPayout / totalBet,
    };
  }
  public async playerIdAndTotalBet(potIndex: number): Promise<Record<string, number>> {
    // Group by userId and sum their bet amounts
    const betSums = await masterPrisma.ongoingGreedyGame.groupBy({
      by: ['userId'],
      where: { potIndex },
      _sum: { amount: true },
    });

    // Filter out null userIds and format result
    const winnerAmounts = betSums
      .filter(b => b.userId !== null)
      .reduce((acc, b) => {
        acc[b.userId as string] = b._sum.amount || 0;
        return acc;
      }, {} as Record<string, number>);

    return winnerAmounts;
  }

  // BY USER ID
  public async betsByplayerId(userId: string): Promise<number> {
    const result = await masterPrisma.ongoingTeenpattiGame.aggregate({
      where: {
        userId: userId,
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ?? 0;
  }
  public async betsByplayerIdPotsAmount(
    userId: string
  ): Promise<Record<number, number>> {

    const GREEDY_POTS = this.GREEDY_POTS.map(p => p.index);

    const result = await masterPrisma.ongoingGreedyGame.groupBy({
      by: ['potIndex'],
      where: {
        userId,
        potIndex: { in: GREEDY_POTS },
      },
      _sum: { amount: true },
    });

    const potSums: Record<number, number> = {};
    GREEDY_POTS.forEach(p => (potSums[p] = 0));

    for (const row of result) {
      if (row.potIndex !== null) {
        potSums[row.potIndex] = row._sum.amount ?? 0;
      }
    }

    return potSums;
  }


  public expectedWinningAmount(
    winnerIdsAndTotalBet: Record<string, number>,
    winningPercentage: number
  ): Record<string, number> {
    const results: Record<string, number> = {};

    for (const userId in winnerIdsAndTotalBet) {
      const totalBet = winnerIdsAndTotalBet[userId] ?? 0;
      const winningAmount = Math.round(totalBet * winningPercentage);
      results[userId] = winningAmount;
    }

    return results;
  }
  ///winning probability

  // EXISTING FUNCTIONS - NO CHANGES



  @SubscribeMessage('teenpattiAnnounceGameResult')
  async announceGameResult() {
    let winningPotIndex = await this.greedyGameProbability();
  
  // SAFETY CHECK: Verify this won't cause catastrophic loss
  const stats = await this.getHouseProfitStats(1);
  const totalCollected = Object.values(this.potTotalBets).reduce((s, b) => s + b, 0);
  const potentialPayout = (this.potTotalBets[winningPotIndex] || 0) * 
    (await this.getGameConfiguration("Eeb1GshW3aa", 1)).winningMultiplier[winningPotIndex];
  
  const newHouseEdge = (stats.totalBet + totalCollected - stats.totalPayout - potentialPayout) / 
    (stats.totalBet + totalCollected);
  
  if (newHouseEdge < 0.05) {
    console.log(`🚨 CIRCUIT BREAKER: Pot ${winningPotIndex} would drop house edge to ${(newHouseEdge * 100).toFixed(2)}%`);
    
    // Force select pot with minimum payout
    const gameConfig = await this.getGameConfiguration("Eeb1GshW3aa", 1);
    const safePots = Object.entries(this.potTotalBets)
      .map(([pot, bet]) => ({
        pot: parseInt(pot),
        payout: bet * gameConfig.winningMultiplier[parseInt(pot)]
      }))
      .sort((a, b) => a.payout - b.payout);
    
    winningPotIndex = safePots[0].pot;
    console.log(`🛡️ Override to POT ${winningPotIndex} (lowest payout)`);
  }
    const winningPot = this.getPotByIndex(winningPotIndex);

    const winningPotImageURL = winningPot.image;
    const potName = winningPot.name;
    // const result = this.generateTeenPattiResult();
    await masterPrisma.allGamesWinningCombinations.create({
      data: {
        gameId: 1,
        winningPotIndex: winningPotIndex,
        winningPotImageURL: winningPotImageURL,
      },
    });
    const winnerCombinationRecords = await masterPrisma.allGamesWinningCombinations.findMany({
      where: {
        gameId: 1,
      },
      orderBy: {
        createdAt: 'desc', // latest first
      },
      take: 30,
      select: {
        winningPotIndex: true,
        winningPotImageURL: true,
      },
    });

    this.server.emit('greedyWinningCombinationResponse', {
      success: true,
      message: 'Winning combinations fetched successfully',
      data: winnerCombinationRecords,
    });
    const gameSetting = await this.getGameConfiguration("Eeb1GshW3aa", Number(1));
    const winnningExpPercentage = gameSetting.winningMultiplier ?? {};

    const winnerIdsAndTotalBet = await this.playerIdAndTotalBet(winningPotIndex);

    const winningPercentage = winnningExpPercentage[winningPotIndex];
    const expectedWinningAmount = this.expectedWinningAmount(
      winnerIdsAndTotalBet,
      winningPercentage
    );

    const winnerIds = Object.keys(expectedWinningAmount);


    for (const userId of winnerIds) {
      const winAmount = expectedWinningAmount[userId];

      //  Create winner record FIRST (waiting state)
      const winnerRow = await masterPrisma.gameWinnersRecord.create({
        data: {
          gameId: 1,
          userId: Number(userId),
          roundId: 0,
          potIndex: winningPotIndex,
          amount: winAmount,
          type: 2,
          appKey: null,
          isRewarded: 0,
          message: 'waiting',
        },
      });

      const winnerRecord = await masterPrisma.gameOngoingUsers.findFirst({
        where: { userId: userId },
        select: {
          socketId: true,
          appKey: true,
          token: true,
        },
      });

      if (!winnerRecord) {
        await masterPrisma.gameWinnersRecord.update({
          where: { id: winnerRow.id },
          data: {
            message: 'failed',
          },
        });
        continue;
      }

      try {
        //  Emit socket message
        if (winnerRecord.socketId) {
          this.server.to(`user:${userId}`).emit('toGreedyWinnerMessage', {
            userId,
            winningAmount: winAmount,
            betType: 2,
            winningPotIndex,
          });
        }

        // Call reward API
        const response = await axios.post(
          'https://joygames.ricolivee.vip/wave/game/submitFlow',
          {
            betAmount: winAmount,
            type: 2,
            transactionId: uuidv4(),
          },
          {
            headers: {
              Authorization: `Bearer ${winnerRecord.token}`,
              'Content-Type': 'application/json',
            },
            timeout: 4000,
          }
        );

        //  Success → update record
        if (response.status === 200) {
          await masterPrisma.gameWinnersRecord.update({
            where: { id: winnerRow.id },
            data: {
              isRewarded: 1,
              message: 'success',
              appKey: winnerRecord.appKey,
            },
          });

          await masterPrisma.bet.create({
            data: {
              gameId: 1,
              userId: userId,
              bet: winAmount,
              type: 2,
              appKey: winnerRecord.appKey,
              winningPercentage,
              isRewarded: 1,
            },
          });
        }
      } catch (err) {
        // 5️⃣ Failure → update record
        await masterPrisma.gameWinnersRecord.update({
          where: { id: winnerRow.id },
          data: {
            message: 'failed',
          },
        });

        if (winnerRecord?.socketId) {
          this.server.to(`user:${userId}`).emit('greedyBetResponse', {
            success: false,
            message: 'Reward failed',
          });
        }
      }
    }
    const winnersDbRecords = await masterPrisma.gameOngoingUsers.findMany({
      where: {
        userId: { in: winnerIds },
      },
      select: {
        userId: true,
        name: true,
        profilePicture: true,
      },
    });

    const REQUIRED_WINNERS = 3;

    let winnersUserResponse = winnersDbRecords.map(user => ({
      userId: user.userId,
      name: user.name,
      amountWon: expectedWinningAmount[user.userId] || 0,
      gameId: 1,
      imageProfile: user.profilePicture || null,
    }));

    if (winnersUserResponse.length < REQUIRED_WINNERS) {
      const needed = REQUIRED_WINNERS - winnersUserResponse.length;

      const existingIds = new Set(winnersUserResponse.map(w => w.userId));
      const potValues = Object.values(this.potTotalBets);
      const minPot = Math.min(...potValues);
      const maxPot = Math.max(...potValues);
      const getRandomAmount = (min = 2000, max = 70000) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

      const fakeWinners = this.Users
        .filter(u => !existingIds.has(u.userId))
        .slice(0, needed)
        .map(u => ({
          userId: u.userId,
          name: u.name,
          amountWon: getRandomAmount(minPot, maxPot),
          gameId: 16,
          imageProfile: u.imageProfile,
        }));

      winnersUserResponse = [
        ...winnersUserResponse,
        ...fakeWinners,
      ];
    }

    const response = {
      success: true,
      message: 'Winners announced successfully',
      data: {
        winners: winnersUserResponse,
        winningPot: potName,
        winningPotIndex: winningPotIndex,
        winningCards: [],
        loserCards: [],
        winningPotRankText: "Pair",
      },
    };

    this.server.emit('greedyAnnounceGameResultResponse', response);

    await masterPrisma.ongoingGreedyGame.deleteMany({});
    this.potTotalBets = this.GREEDY_POTS.reduce((acc, pot) => {
      {
        acc[pot.index] = 0;
        return acc;
      }
    }, {} as Record<number, number>);
    this.server.emit('greedyPotTotalBets', this.potTotalBets);

    return response;
  }

  @SubscribeMessage('greedyGameTableJoin')
  async gameGreedyJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() user: {
      userId: string;
      name: string;
      imageProfile: string;
      appKey: string;
      token: string;
      gameId: number;
    }
  ) {
    try {
      const userId = String(user.userId);

      await masterPrisma.gameOngoingUsers.upsert({
        where: { userId },
        update: {
          name: user.name,
          gameId: user.gameId,
          profilePicture: user.imageProfile,
          appKey: user.appKey,
        },
        create: {
          userId,
          gameId: user.gameId,
          name: user.name,
          profilePicture: user.imageProfile,
          appKey: user.appKey,
        },
      });
      // console.log(`User ${userId} joined Greedy game table hit `);
      const dummyPlayers = [
        { userId: 'gzvISjgXLW', name: 'Alex', profilePicture: 'https://randomuser.me/api/portraits/women/1.jpg' },
        { userId: 'sdBPg21sbL', name: 'Max', profilePicture: 'https://randomuser.me/api/portraits/men/2.jpg' },
        { userId: 'EscjvllJMV', name: 'Zabir', profilePicture: 'https://randomuser.me/api/portraits/men/3.jpg' },
        { userId: 'YZPiqFzhZ1', name: 'Waseem', profilePicture: 'https://randomuser.me/api/portraits/men/4.jpg' },
      ];

      const usersInGame = await masterPrisma.gameOngoingUsers.findMany();
      const combinedUsers = [...usersInGame, ...dummyPlayers];
      let userSocketId = await masterPrisma.gameOngoingUsers.findFirst({
        where: { userId },
        select: {
          socketId: true,
        },
      });
      if (!userSocketId || !userSocketId.socketId) {
        return;
      }
      const winnerCombinationRecords = await masterPrisma.allGamesWinningCombinations.findMany({
        where: {
          gameId: user.gameId,
        },
        orderBy: {
          createdAt: 'desc', // latest first
        },
        take: 30,
        select: {
          winningPotIndex: true,
          winningPotImageURL: true,
        },
      });
      this.server.emit('greedyWinningCombinationResponse', {
        success: true,
        message: 'Winning combinations fetched successfully',
        data: winnerCombinationRecords,
      });
      this.server.emit('greedyGameTableUpdate', {
        users: combinedUsers,
      });

      return { success: true, users: combinedUsers };

    } catch (err: any) {
      console.error('Teen Patti Join Error:', err);
      return { success: false, users: [], message: err.message };
    }
  }


  @SubscribeMessage('teenpattiGameTableLeave')
  async gameTeenpattiLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() user: any
  ) {
    const { userId } = user;

    if (!userId) {
      return { success: false, message: "userId is required" };
    }

    try {
      // Delete the user from the master database table
      await masterPrisma.gameOngoingUsers.deleteMany({
        where: { userId },
      });
      client.leave('teenPattiGame');

      // Fetch remaining users to emit the updated table
      const remainingUsers = await masterPrisma.gameOngoingUsers.findMany({
        select: {
          userId: true,
          name: true,
          profilePicture: true,
        },
      });

      this.server.to('teenPattiGame').emit('teenpattiGameTableUpdate', {
        users: remainingUsers,
      });

      return { success: true, users: remainingUsers };
    } catch (err) {
      console.error("Failed to remove user from database:", err);
      return { success: false, message: "Failed to remove user", error: err.message };
    }
  }


  // @SubscribeMessage('userUpdatedData')
  // async getUserData() {
  //   const response = {
  //     success: true,
  //     message: 'User data fetched successfully',
  //     data: {
  //       user: [
  //         {
  //           userId: 'user_123',
  //           balance: 1500,
  //           gameId: 16,
  //           imageProfile: 'https://randomuser.me/api/portraits/men/75.jpg',
  //         },
  //         {
  //           userId: 'user_345',
  //           balance: 1500,
  //           gameId: 16,
  //           imageProfile: 'https://randomuser.me/api/portraits/men/75.jpg',
  //         }
  //       ],
  //     },
  //   };

  //   if (this.server) {
  //     this.server.emit('userUpdatedDataResponse', response);
  //   }
  //   return response;
  // }

  // @SubscribeMessage('teenpattiPotBetsAndUsers')
  // async getPotBetsAndUsers(@MessageBody() { gameId }: { gameId: number }) {
  //   const potsAndUsers = {
  //     16: {
  //       pots: [
  //         { potName: 'pot1', betCoins: [50, 100, 100, 200, 500, 100, 50, 200], totalBetAmount: 1300 },
  //         { potName: 'pot2', betCoins: [100, 100, 200, 50, 500, 100], totalBetAmount: 1050 },
  //         { potName: 'pot3', betCoins: [50, 100, 100, 500, 200], totalBetAmount: 950 },
  //       ],
  //       users: this.Users,
  //     },
  //     42: {
  //       pots: [
  //         { potName: 'pot1', betCoins: [10, 50, 100, 200], totalBetAmount: 360 },
  //         { potName: 'pot2', betCoins: [25, 25, 50], totalBetAmount: 100 },
  //       ],
  //       users: [
  //         { userId: 'user_201', name: 'David', imageProfile: 'https://randomuser.me/api/portraits/men/80.jpg' },
  //         { userId: 'user_202', name: 'Eva', imageProfile: 'https://randomuser.me/api/portraits/women/81.jpg' },
  //       ],
  //     },
  //   };

  //   const result = potsAndUsers[gameId];

  //   if (!result) {
  //     const response = {
  //       success: false,
  //       message: `No pot or user data found for gameId ${gameId}`,
  //       data: null,
  //     };
  //     this.server.emit('teenpattiPotBetsAndUsersResponse', response);
  //     return response;
  //   }

  //   const response = {
  //     success: true,
  //     message: 'Game bets fetched successfully',
  //     data: result,
  //   };

  //   this.server.emit('teenpattiPotBetsAndUsersResponse', response);
  //   return response;
  // }

  private convertMultiplierToDatabaseFormat(multiplier: any) {
    if (!multiplier) return { 0: 0, 1: 0, 2: 0 };
    return {
      0: multiplier.potA ?? 0,
      1: multiplier.potB ?? 0,
      2: multiplier.potC ?? 0
    };
  }

  /**
   * Convert database format (0, 1, 2) to POT A/B/C
   */
  private convertMultiplierToUserFormat(dbFormat: any) {
    if (!dbFormat || !Array.isArray(dbFormat)) return { potA: 0, potB: 0, potC: 0 };
    return {
      potA: dbFormat[0] ?? 0,
      potB: dbFormat[1] ?? 0,
      potC: dbFormat[2] ?? 0
    };
  }


  /**
   * UPSERT Game Settings - Handles BOTH probability and multiplier
   */
  async upsertGameSettings(data: any) {
    const { appKey, gameId, winningProbabilityChance, winningMultiplier, maxBetLimit } = data;

    if (!appKey || !gameId) {
      return {
        success: false,
        message: 'appKey and gameId are required'
      };
    }

    try {
      // Convert multiplier to database array format [potA, potB, potC]
      const multiplierDb = this.convertMultiplierToDatabaseFormat(winningMultiplier);

      const gameSetting = await masterPrisma.gameSettings.upsert({
        where: { appKey },
        update: {
          gameId,
          ...(winningProbabilityChance && { winningPercentage: winningProbabilityChance }),
          ...(maxBetLimit !== undefined && { maxBetLimit }),
          winningMultiplier: multiplierDb
        },
        create: {
          appKey,
          gameId,
          winningPercentage: winningProbabilityChance || { low: 0.4, medium: 0.4, high: 0.2 },
          winningMultiplier: multiplierDb,
          maxBetLimit: maxBetLimit || 500000
        }
      });

      // Invalidate cache
      await this.invalidateGameConfigCache(appKey, gameId);

      return {
        success: true,
        message: 'Game settings updated successfully',
        data: {
          id: gameSetting.id,
          appKey: gameSetting.appKey,
          gameId: gameSetting.gameId,
          winningProbabilityChance: gameSetting.winningPercentage,
          winningMultiplier: this.convertMultiplierToUserFormat(gameSetting.winningMultiplier),
          maxBetLimit: gameSetting.maxBetLimit,
          createdAt: gameSetting.createdAt,
          updatedAt: gameSetting.updatedAt
        }
      };
    } catch (err) {
      console.error('Failed to upsert game settings:', err);
      return {
        success: false,
        message: 'Failed to update game settings',
        error: err.message
      };
    }
  }


  /**
   * GET Game Settings
   */
  async getGameSettings(appKey: string) {
    if (!appKey) {
      return {
        success: false,
        message: 'appKey is required'
      };
    }

    try {
      const gameSetting = await masterPrisma.gameSettings.findUnique({
        where: { appKey },
        select: {
          id: true,
          appKey: true,
          gameId: true,
          winningPercentage: true,
          winningMultiplier: true,
          maxBetLimit: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!gameSetting) {
        return {
          success: false,
          message: `Game settings not found for appKey: ${appKey}`
        };
      }

      return {
        success: true,
        data: {
          id: gameSetting.id,
          appKey: gameSetting.appKey,
          gameId: gameSetting.gameId,
          winningProbabilityChance: gameSetting.winningPercentage,
          winningMultiplier: this.convertMultiplierToUserFormat(gameSetting.winningMultiplier),
          maxBetLimit: gameSetting.maxBetLimit,
          createdAt: gameSetting.createdAt,
          updatedAt: gameSetting.updatedAt
        }
      };
    } catch (err) {
      console.error('Failed to fetch game settings:', err);
      return {
        success: false,
        message: 'Failed to fetch game settings',
        error: err.message
      };
    }
  }

  /**
   * Get game configuration with Redis caching (15 minutes TTL)
   * Returns BOTH probability and multiplier
   */
  async getGameConfiguration(appKey: string, gameId: number) {
    const cacheKey = `game:config:${appKey}:${gameId}`;
    const cacheTTL = 10; // 15 minutes

    try {
      const cachedConfig = await this.ioredis.get(cacheKey);

      if (cachedConfig) {
        return JSON.parse(cachedConfig);
      }

      const gameSettings = await masterPrisma.gameSettings.findFirst({
        where: { appKey, gameId },
        select: {
          winningPercentage: true,
          maxBetLimit: true,
          winningMultiplier: true
        }
      });

      if (!gameSettings) {
        return {
          winningProbabilityChance: { low: 0.4, medium: 0.4, high: 0.2 },
          winningMultiplier: { 0: 2.9, 1: 2.9, 2: 2.9 },
          betLimit: 500000
        };
      }

      const config = {
        winningProbabilityChance: gameSettings?.winningPercentage,
        winningMultiplier: gameSettings?.winningMultiplier, // Default multiplier
        betLimit: gameSettings?.maxBetLimit
      };

      await this.ioredis.setex(cacheKey, cacheTTL, JSON.stringify(config));

      return config;
    } catch (err) {
      console.error('Failed to fetch game configuration:', err);
      throw err;
    }
  }

  /**
   * Invalidate cache
   */
  async invalidateGameConfigCache(appKey: string, gameId: number) {
    const cacheKey = `game:config:${appKey}:${gameId}`;
    try {
      await this.ioredis.del(cacheKey);
    } catch (err) {
      console.error(`Failed to invalidate cache: ${err.message}`);
    }
  }
}
