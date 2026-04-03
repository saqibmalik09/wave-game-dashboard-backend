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
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { masterPrisma } from 'src/prisma/masterClient';
import { TeenpattiBetQueueService } from './teenpatti-bet-queue.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class TeenpattiService implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TeenpattiService.name);
  private betCount = 0;
  private startTime = Date.now();

  constructor(
    private readonly betQueue: TeenpattiBetQueueService,
    @Inject('IOREDIS_CLIENT') private readonly ioredis: Redis,
  ) {
    setInterval(() => this.logThroughput(), 5000);
  }
  @WebSocketServer()
  server: Server;

  // ✅ Required WebSocket lifecycle methods
  afterInit(server: Server) {
    this.betQueue.setServer(server); // Pass server to queue service
    this.logger.log('WebSocket Gateway initialized with BullMQ queue');
  }

  async handleConnection(client: Socket) {
    const userId = String(client.handshake.query.userId ?? '');
    const appKey = String(client.handshake.query.appKey ?? '');
    const token = String(client.handshake.query.token ?? '');
    const gameId = String(client.handshake.query.gameId ?? '');
    // if(gameId !="16"){
    //     console.log(`Invalid gameId ${gameId} for Teenpatti with client id ${client.id}`);
        
    //     return;
    // }
  
    try {
      if (client.data.initialized) return;
      client.data.initialized = true;

      await masterPrisma.$transaction(async (tx) => {
        const existing = await tx.gameOngoingUsers.findUnique({
          where: { userId },
        });

        if (existing) {
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
  public potTotalBets: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
  };
  public winningPotHistory: string[] = [];


  public Users = [
    { userId: 'user_101', name: 'Alice', imageProfile: 'https://randomuser.me/api/portraits/women/55.jpg', socketId: "" },
    { userId: 'user_102', name: 'Bob', imageProfile: 'https://randomuser.me/api/portraits/men/98.jpg', socketId: "" },
    { userId: 'user_103', name: 'Charlie', imageProfile: 'https://randomuser.me/api/portraits/men/78.jpg', socketId: "" },
    // { userId: 'user_105', name: 'Max', imageProfile: 'https://randomuser.me/api/portraits/men/68.jpg' },
    // { userId: 'user_108', name: 'Alex', imageProfile: 'https://randomuser.me/api/portraits/men/70.jpg' },
    // { userId: 'user_108', name: 'Alex', imageProfile: 'https://randomuser.me/api/portraits/men/70.jpg' },

  ]
  @SubscribeMessage('teenPattiTimer')
  async startTimers() {
    if (this.running) return; // prevent duplicate loops
    this.running = true;


    const phases = [
      { name: 'bettingTimer', duration: 20 },
      { name: 'winningCalculationTimer', duration: 3 },
      { name: 'resultAnnounceTimer', duration: 6 },
      { name: 'newGameStartTimer', duration: 3 },
    ];

    while (true) {
      this.announceWinningSent = false;
      for (const phase of phases) {
        for (let remaining = phase.duration; remaining >= 0; remaining--) {
          // broadcast remaining seconds to all clients
          if (phase.name !== 'winningCalculationTimer') {
            this.announceWinningSent = false;
          }
          this.server.emit('teenpattiTimer', {
            phase: phase.name,
            remaining,
          });

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        // broadcast phase complete
        this.server.emit('teenpattiTimer', {
          phase: phase.name,
          message: `${phase.name} completed.`,
        });
        if (phase.name === 'winningCalculationTimer' && !this.announceWinningSent) {
          this.announceWinningSent = true;
          await this.announceGameResult();
        }
      }

      // after all timers finish, loop restarts (new game cycle)
    }
  }


  // @SubscribeMessage('placeTeenpattiBet')
  // async placeBet(
  //   @MessageBody()
  //   bet: {
  //     userId: string;
  //     amount: number;
  //     betType?: number;
  //     appKey?: string;
  //     token?: string;
  //     gameId?: string;
  //     potIndex?: number;
  //     socketId: string;
  //     tenantBaseURL?: string;
  //   },
  // ) {
  //   const betId = uuidv4();
  //   const timestamp = Date.now();

  //   const { userId, amount, betType, token, gameId, potIndex, tenantBaseURL } = bet;

  //   const submitFlowData = {
  //     betAmount: amount,
  //     type: betType,
  //     transactionId: betId,
  //   };
  //   let socketID = '';
  //   let message = '';
  //   let apiData: any;
  //   const userSocketId = await masterPrisma.gameOngoingUsers.findFirst({
  //       where: { userId },
  //       select: { socketId: true },
  //     });

  //     if (!userSocketId?.socketId) {
  //       console.log('SocketId not found for userId:', userId);
  //       return;
  //     }

  //   socketID = userSocketId.socketId;
  //   try {
  //     // 🔹 API CALL
  //     const response = await axios.post(
  //       `${tenantBaseURL}/wave/game/submitFlow`,
  //       submitFlowData,
  //       {
  //         headers: {
  //           Authorization: `Bearer ${token}`,
  //           'Content-Type': 'application/json',
  //         },
  //         timeout: 4000,
  //       },
  //     );

  //     apiData = response.data;
  //     console.log(`Received apiData:`, apiData);

  //     //  GET SOCKET ID
  //     if (apiData.success === false) {
  //       this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
  //         success: false,
  //         message: apiData.message,
  //         data: {
  //           ...apiData.data,
  //           potIndex,
  //           amount,
  //         },
  //       });
  //     }

  //     // 🔹 SUCCESS
  //     if (response.data?.success === true) {
  // const index = Number(potIndex);
  // this.potTotalBets[index] = (this.potTotalBets[index] ?? 0) + amount;
  // this.server.emit('potTotalBets', this.potTotalBets);
  //       this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
  //         success: true,
  //         message: apiData.message,
  //         data: {
  //           ...apiData.data,
  //           potIndex,
  //           amount,
  //         },
  //       });

  //       // POT NAME
  //       let potName = '';
  //       if (bet.potIndex === 0) potName = 'Pot 1';
  //       else if (bet.potIndex === 1) potName = 'Pot 2';
  //       else if (bet.potIndex === 2) potName = 'Pot 3';

  //       // 🔹 SAVE DB
  //       if (bet.gameId === '16') {
  //         await masterPrisma.ongoingTeenpattiGame.create({
  //           data: {
  //             potIndex: Number(bet.potIndex),
  //             userId: bet.userId,
  //             amount: bet.amount,
  //             type: bet.betType,
  //             potName,
  //             appKey: bet.appKey || null,
  //           },
  //         });
  //       }
  //     } else {
  //       this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
  //         success: false,
  //         message: apiData.message,
  //         data: {
  //           ...apiData.data,
  //           potIndex,
  //           amount,
  //         },
  //       });
  //     }

  //     return {
  //       success: apiData.success,
  //       message: apiData.message,
  //       data: {
  //         betId,
  //         timestamp,
  //       },
  //     };
  //   } catch (err: any) {
  //     console.error('Error placing bet:', err.message,"eror code:",err.code);
  //     message = 'Requested server failed to respond';

  //     if (err.code === 'ECONNABORTED') {
  //       message = 'Requested server timeout';
  //     } else if (!err.response) {
  //       message = 'Requested server is unavailable';
  //     } else if (err.message) {
  //       message = err.message;
  //     }
  //     console.log('socketID:', socketID);
  //     if (socketID) {
  //       // 
  //     this.server.to(`user:${userId}`).emit('teenpattiBetResponse', { success: false, message });
  //     }
  //   }
  // }

  @SubscribeMessage('placeTeenpattiBet')
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

    const { userId } = bet;

    try {
      // Verify user socket exists
      const userSocketId = await masterPrisma.gameOngoingUsers.findFirst({
        where: { userId },
        select: { socketId: true },
      });

      if (!userSocketId?.socketId) {
        this.logger.warn(`SocketId not found for userId: ${userId}`);
        this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
          success: false,
          message: 'User session not found.Please restart game',
        });
        return;
      }
      if (!bet.gameId || !bet.appKey) {
        this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
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
        this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
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
      this.server.emit('potTotalBets', this.potTotalBets);
      // Immediately respond to user (< 50ms)
      this.server.to(`user:${userId}`).emit('betQueued', {
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

      this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
        success: false,
        message: 'Failed to queue bet',
      });

      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Get queue statistics endpoint
  @SubscribeMessage('getQueueStats')
  async getQueueStats() {
    const stats = await this.betQueue.getQueueStats();
    return {
      success: true,
      data: stats,
    };
  }


  /**
   * Batch bet placement for load testing
   */
  @SubscribeMessage('placeTeenpattiBetBatch')
  async placeBetBatch(
    @MessageBody()
    data: {
      bets: Array<{ userId: string; amount: number; betType?: number, socketId: string }>
    }
  ) {
    const { bets } = data;
    const enrichedBets = bets.map(bet => ({
      betId: uuidv4(),
      ...bet,
      game: 'teenpatti',
      timestamp: Date.now(),
      status: 'pending',
    }));

    try {
      this.server.emit('teenpattiBatchBetResponse', {
        success: true,
        message: `${bets.length} bets accepted for processing`,
        count: bets.length,
      });
      return {
        success: true,
        message: `${bets.length} bets accepted for processing`,
        count: bets.length,
      };
    } catch (error) {
      this.logger.error('Failed to place bet batch', error.stack);
      throw error;
    }
  }

  private logThroughput() {
    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    const betsPerSecond = Math.round(this.betCount / elapsed);

    if (this.betCount > 0) {
      this.logger.log(
        `📊 Bet Throughput: ${betsPerSecond} bets/sec | Total: ${this.betCount} bets in ${elapsed.toFixed(2)}s`
      );
    }
  }
  resetMetrics() {
    this.betCount = 0;
    this.startTime = Date.now();
  }

  getMetrics() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const betsPerSecond = this.betCount / elapsed;

    return {
      totalBets: this.betCount,
      elapsedTime: elapsed,
      betsPerSecond: Math.round(betsPerSecond),
    };
  }

  // public teenpattiGameProbability(): number {
  //   const options = [0, 1, 2];
  //   const randomIndex = Math.floor(Math.random() * options.length);
  //   return options[randomIndex];
  // }
  async teenpattiGameProbability(): Promise<number> {

    const MAX_HISTORY = 10;
    const gameSetting = await this.getGameConfiguration("Eeb1GshW3a", Number(16));
    const winningProbablityChance = gameSetting.winningProbabilityChance ?? {};
    // const winningProbablityChance = {
    //   low: 0.4,
    //   medium: 0.4,
    //   high: 0.2,
    // };

    /**
     * 1️⃣ Determine LOW / MEDIUM / HIGH dynamically
     * pot index can be anything
     */
    const sortedPots = Object.entries(this.potTotalBets)
      .map(([index, amount]) => ({
        index: Number(index),
        amount: Number(amount),
      }))
      .sort((a, b) => a.amount - b.amount);

    // safety check
    if (sortedPots.length !== 3) {
      throw new Error('Exactly 3 pots are required');
    }

    const categoryMap: Record<'low' | 'medium' | 'high', number> = {
      low: sortedPots[0].index,      // lowest bet pot
      medium: sortedPots[1].index,   // middle bet pot
      high: sortedPots[2].index,     // highest bet pot
    };

    /**
     * 2️⃣ Count last 10 winning categories
     */
    const historyCount = {
      low: 0,
      medium: 0,
      high: 0,
    };

    for (const h of this.winningPotHistory) {
      if (historyCount[h] !== undefined) {
        historyCount[h]++;
      }
    }

    /**
     * 3️⃣ Max allowed wins in last 10
     */
    const maxAllowed = {
      low: Math.round(winningProbablityChance.low * MAX_HISTORY),       // 4
      medium: Math.round(winningProbablityChance.medium * MAX_HISTORY), // 4
      high: Math.round(winningProbablityChance.high * MAX_HISTORY),     // 2
    };

    /**
     *  Eligible categories (not exceeding quota)
     */
    let eligibleCategories = (Object.keys(maxAllowed) as Array<'low' | 'medium' | 'high'>)
      .filter(cat => historyCount[cat] < maxAllowed[cat]);

    // fallback (rare case)
    if (eligibleCategories.length === 0) {
      eligibleCategories = ['low', 'medium', 'high'];
    }

    /**
     * 5️⃣ Weighted random selection
     */
    const totalWeight = eligibleCategories
      .reduce((sum, cat) => sum + winningProbablityChance[cat], 0);

    let rand = Math.random() * totalWeight;

    let selectedCategory: 'low' | 'medium' | 'high' = eligibleCategories[0];
    for (const cat of eligibleCategories) {
      rand -= winningProbablityChance[cat];
      if (rand <= 0) {
        selectedCategory = cat;
        break;
      }
    }

    /**
     *  Save history (last 10)
     */
    this.winningPotHistory.push(selectedCategory);
    if (this.winningPotHistory.length > MAX_HISTORY) {
      this.winningPotHistory.shift();
    }

    return categoryMap[selectedCategory];
  }
  public async playerIdAndTotalBet(potIndex: number): Promise<Record<string, number>> {
    // Group by userId and sum their bet amounts
    const betSums = await masterPrisma.ongoingTeenpattiGame.groupBy({
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

    const result = await masterPrisma.ongoingTeenpattiGame.groupBy({
      by: ['potIndex'],
      where: {
        userId: userId,
        potIndex: {
          in: [0, 1, 2],
        },
      },
      _sum: {
        amount: true,
      },
    });

    // Normalize result → always return 0,1,2
    const potSums: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
    };

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
  private readonly SUITS = ['S', 'H', 'D', 'C'];
  private readonly RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'J', 'Q', 'K'];

  public buildDeck(): string[] {
    const deck: string[] = [];
    for (const r of this.RANKS) {
      for (const s of this.SUITS) {
        deck.push(`${r}${s}.png`);
      }
    }
    return deck;
  }

  private rankValue(card: string): number {
    const r = card[0];
    if (r === 'A') return 14;
    if (r === '0') return 10;
    if (r === 'J') return 11;
    if (r === 'Q') return 12;
    if (r === 'K') return 13;
    return parseInt(r);
  }

  private isSequence(cards: string[]): boolean {
    const ranks = cards
      .map(c => this.rankValue(c))
      .sort((a, b) => a - b);

    // Normal sequence
    if (ranks[1] === ranks[0] + 1 && ranks[2] === ranks[1] + 1) return true;

    // A-2-3 special case
    return ranks.includes(14) && ranks.includes(2) && ranks.includes(3);
  }

  private isFlush(cards: string[]): boolean {
    return new Set(cards.map(c => this.suitOf(c))).size === 1;
  }

  private suitOf(card: string): string {
    return card[1];
  }

  public shuffle<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  public draw(deck: string[], count: number): string[] {
    return deck.splice(0, count);
  }

  public rankOf(card: string): string {
    return card[0];
  }

  // NEW FUNCTIONS - ADDED BELOW

  public createTrailHand(deck: string[]): string[] {
    const rankGroups: Record<string, string[]> = {};

    deck.forEach(card => {
      const r = card[0];
      rankGroups[r] = rankGroups[r] || [];
      rankGroups[r].push(card);
    });

    const availableTrailRanks = Object.keys(rankGroups).filter(r => rankGroups[r].length >= 3);

    if (availableTrailRanks.length === 0) {
      return this.createPairHand(deck);
    }

    const randomTrailRank = availableTrailRanks[Math.floor(Math.random() * availableTrailRanks.length)];
    const trailCards = this.shuffle(rankGroups[randomTrailRank]).slice(0, 3);

    trailCards.forEach(card => {
      const idx = deck.indexOf(card);
      if (idx !== -1) deck.splice(idx, 1);
    });

    return trailCards;
  }

  public createSequenceHand(deck: string[]): string[] {
    const maxAttempts = 100;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      const startRank = Math.floor(Math.random() * 11) + 2;
      const sequenceValues = [startRank, startRank + 1, startRank + 2];
      const cards: string[] = [];

      for (const val of sequenceValues) {
        let rankChar: string;
        if (val === 14) rankChar = 'A';
        else if (val === 13) rankChar = 'K';
        else if (val === 12) rankChar = 'Q';
        else if (val === 11) rankChar = 'J';
        else if (val === 10) rankChar = '0';
        else rankChar = val.toString();

        const availableCards = deck.filter(c => c[0] === rankChar);
        if (availableCards.length === 0) break;

        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        cards.push(randomCard);
      }

      if (cards.length === 3 && this.isSequence(cards) && !this.isFlush(cards)) {
        cards.forEach(card => {
          const idx = deck.indexOf(card);
          if (idx !== -1) deck.splice(idx, 1);
        });
        return cards;
      }
    }

    return this.createPairHand(deck);
  }

  public createColorHand(deck: string[]): string[] {
    const maxAttempts = 100;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      const randomSuit = this.SUITS[Math.floor(Math.random() * this.SUITS.length)];
      const suitCards = deck.filter(c => c[1] === randomSuit);

      if (suitCards.length >= 3) {
        const shuffledSuitCards = this.shuffle([...suitCards]);
        const cards = shuffledSuitCards.slice(0, 3);

        if (!this.isSequence(cards)) {
          cards.forEach(card => {
            const idx = deck.indexOf(card);
            if (idx !== -1) deck.splice(idx, 1);
          });
          return cards;
        }
      }
    }

    return this.createPairHand(deck);
  }

  public createPureSequenceHand(deck: string[]): string[] {
    const maxAttempts = 100;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      const randomSuit = this.SUITS[Math.floor(Math.random() * this.SUITS.length)];
      const startRank = Math.floor(Math.random() * 11) + 2;
      const sequenceValues = [startRank, startRank + 1, startRank + 2];
      const cards: string[] = [];

      for (const val of sequenceValues) {
        let rankChar: string;
        if (val === 14) rankChar = 'A';
        else if (val === 13) rankChar = 'K';
        else if (val === 12) rankChar = 'Q';
        else if (val === 11) rankChar = 'J';
        else if (val === 10) rankChar = '0';
        else rankChar = val.toString();

        const cardName = `${rankChar}${randomSuit}.png`;
        if (deck.includes(cardName)) {
          cards.push(cardName);
        } else {
          break;
        }
      }

      if (cards.length === 3 && this.isSequence(cards) && this.isFlush(cards)) {
        cards.forEach(card => {
          const idx = deck.indexOf(card);
          if (idx !== -1) deck.splice(idx, 1);
        });
        return cards;
      }
    }

    return this.createSequenceHand(deck);
  }

  // EXISTING FUNCTIONS - NO CHANGES

  public createPairHand(deck: string[]): string[] {
    const rankGroups: Record<string, string[]> = {};

    deck.forEach(card => {
      const r = card[0];
      rankGroups[r] = rankGroups[r] || [];
      rankGroups[r].push(card);
    });

    const availablePairRanks = Object.keys(rankGroups).filter(r => rankGroups[r].length >= 2);

    if (availablePairRanks.length === 0) {
      return deck.splice(0, 3);
    }

    const randomPairRank = availablePairRanks[Math.floor(Math.random() * availablePairRanks.length)];
    const shuffledPairCards = this.shuffle(rankGroups[randomPairRank]);
    const pairCards = shuffledPairCards.slice(0, 2);

    const possibleKickers = deck.filter(
      c =>
        c[0] !== randomPairRank &&
        !this.isSequence([...pairCards, c]) &&
        !this.isFlush([...pairCards, c])
    );

    if (possibleKickers.length === 0) {
      return deck.splice(0, 3);
    }

    const kicker = possibleKickers[Math.floor(Math.random() * possibleKickers.length)];

    const cardsToRemove = [...pairCards, kicker];
    cardsToRemove.forEach(card => {
      const idx = deck.indexOf(card);
      if (idx !== -1) {
        deck.splice(idx, 1);
      }
    });

    return [...pairCards, kicker];
  }

  public createHighCardHand(deck: string[]): string[] {
    while (true) {
      const cards = deck.splice(0, 3);

      const ranks = cards.map(c => c[0]);
      const uniqueRanks = new Set(ranks);

      if (
        uniqueRanks.size === 3 &&
        !this.isSequence(cards) &&
        !this.isFlush(cards)
      ) {
        return cards;
      }

      deck.push(...cards);
      this.shuffle(deck);
    }
  }

  // MODIFIED FUNCTION - ONLY THIS ONE CHANGES

  public generateTeenPattiResult() {
    const deck = this.shuffle(this.buildDeck());

    // Randomly choose hand type
    const handTypes = ['trail', 'pureSequence', 'sequence', 'color', 'pair', 'pair', 'pair'];
    const randomHandType = handTypes[Math.floor(Math.random() * handTypes.length)];

    let winnerCards: string[];

    switch (randomHandType) {
      case 'trail':
        winnerCards = this.createTrailHand(deck);
        break;
      case 'pureSequence':
        winnerCards = this.createPureSequenceHand(deck);
        break;
      case 'sequence':
        winnerCards = this.createSequenceHand(deck);
        break;
      case 'color':
        winnerCards = this.createColorHand(deck);
        break;
      default:
        winnerCards = this.createPairHand(deck);
    }

    const loserCardsA = this.createHighCardHand(deck);
    const loserCardsB = this.createHighCardHand(deck);

    return {
      winner: {
        cards: winnerCards,
        losers: {
          cardsA: loserCardsA,
          cardsB: loserCardsB
        }
      }
    };
  }

  public getHandRank(cards: string[]): string {
    const ranks = cards.map(c => c[0]);
    const uniqueRanks = new Set(ranks);

    if (uniqueRanks.size === 1) {
      return 'Trail';
    }

    const isSeq = this.isSequence(cards);
    const isFlushHand = this.isFlush(cards);

    if (isSeq && isFlushHand) {
      return 'Pure Sequence';
    }

    if (isSeq) {
      return 'Sequence';
    }

    if (isFlushHand) {
      return 'Color';
    }

    if (uniqueRanks.size === 2) {
      return 'Pair';
    }

    return 'High Card';
  }

  // REST OF YOUR CODE - NO CHANGES AT ALL

  @SubscribeMessage('teenpattiAnnounceGameResult')
  async announceGameResult() {
    let winningPotIndex = await this.teenpattiGameProbability();
    let winningPotImageURL = ''
    if (winningPotIndex == 0) {
      winningPotImageURL = 'APOT.png'
    }
    if (winningPotIndex == 1) {
      winningPotImageURL = 'BPOT.png'
    }
    if (winningPotIndex == 2) {
      winningPotImageURL = 'CPOT.png'
    }
    const result = this.generateTeenPattiResult();
    await masterPrisma.allGamesWinningCombinations.create({
      data: {
        gameId: 16,
        winningPotIndex: winningPotIndex,
        winningPotImageURL: winningPotImageURL,
      },
    });
    const winnerCombinationRecords = await masterPrisma.allGamesWinningCombinations.findMany({
      where: {
        gameId: 16,
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
    this.server.emit('teenpattiWinningCombinationResponse', {
      success: true,
      message: 'Winning combinations fetched successfully',
      data: winnerCombinationRecords,
    }); 
  const gameSetting = await this.getGameConfiguration("Eeb1GshW3a", Number(16));
  const winnningExpPercentage = gameSetting.winningMultiplier ?? {};

    // let winnningExpPercentage = {
    //   0: 2.9,
    //   1: 2.9,
    //   2: 2.9
    // };

    const winnerIdsAndTotalBet = await this.playerIdAndTotalBet(winningPotIndex);
    const winningPercentage = winnningExpPercentage[winningPotIndex];
    const expectedWinningAmount = this.expectedWinningAmount(
      winnerIdsAndTotalBet,
      winningPercentage
    );

    const winnerIds = Object.keys(expectedWinningAmount);
    const lastRound = await masterPrisma.gameWinnersRecord.aggregate({
      where: { gameId: 16 },
      _max: { roundId: true },
    });

    const roundId = (lastRound._max.roundId ?? 0) + 1;

    for (const userId of winnerIds) {
      const winAmount = expectedWinningAmount[userId];

      //  Create winner record FIRST (waiting state)
      const winnerRow = await masterPrisma.gameWinnersRecord.create({
        data: {
          gameId: 16,
          userId: Number(userId),
          roundId: roundId,
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
          this.server.to(`user:${userId}`).emit('toWinnerMessage', {
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

        // 4️⃣ Success → update record
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
              gameId: 16,
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
          this.server.to(`user:${userId}`).emit('teenpattiBetResponse', {
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
      gameId: 16,
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

    let potName;
    if (winningPotIndex == 0) {
      potName = "Pot A"
    } else if (winningPotIndex == 1) {
      potName = "Pot B"
    } else if (winningPotIndex == 2) {
      potName = "Pot C"
    }

    const response = {
      success: true,
      message: 'Winners announced successfully',
      data: {
        winners: winnersUserResponse,
        winningPot: potName,
        winningPotIndex: winningPotIndex,
        winningCards: result.winner.cards,
        loserCards: result.winner.losers,
        winningPotRankText: this.getHandRank(result.winner.cards),
      },
    };

    this.server.emit('teenpattiAnnounceGameResultResponse', response);

    await masterPrisma.ongoingTeenpattiGame.deleteMany({});
    this.potTotalBets = {
      0: 0,
      1: 0,
      2: 0,
    };

    return response;
  }

  @SubscribeMessage('teenpattiGameTableJoin')
  async gameTeenpattiJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() user: {
      userId: string;
      name: string;
      imageProfile: string;
      appKey: string;
      token: string;
    }
  ) {
    try {
      const userId = String(user.userId);

      await masterPrisma.gameOngoingUsers.upsert({
        where: { userId },
        update: {
          name: user.name,
          profilePicture: user.imageProfile,
          appKey: user.appKey,
        },
        create: {
          userId,
          name: user.name,
          profilePicture: user.imageProfile,
          appKey: user.appKey,
        },
      });

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
      const winnerCombinationRecords =
        await masterPrisma.allGamesWinningCombinations.findMany({
          where: {
            gameId: 16,
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

      this.server.emit('teenpattiWinningCombinationResponse', {
        success: true,
        message: 'Winning combinations fetched successfully',
        data: winnerCombinationRecords,
      });
      this.server.emit('teenpattiGameTableUpdate', {
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
    const cacheTTL = 900; // 15 minutes

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
          winningMultiplier:true
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
        winningMultiplier:gameSettings?.winningMultiplier, // Default multiplier
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
