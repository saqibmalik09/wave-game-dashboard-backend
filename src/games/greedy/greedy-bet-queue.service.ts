// src/teenpatti/teenpatti-bet-queue.service.ts
import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import axios from 'axios';
import PQueue from 'p-queue';
import CircuitBreaker from 'opossum';
import { Server } from 'socket.io';
import { masterPrisma } from 'src/prisma/masterClient';

interface BetJobData {
  betId: string;
  userId: string;
  amount: number;
  betType?: number;
  token?: string;
  gameId?: string;
  potIndex?: number;
  tenantBaseURL?: string;
  appKey?: string;
  timestamp: number;
}

interface ApiResponse {
  success: boolean;
  message: string;
  data: {
    id?: number;
    balance?: number;
    name?: string;
    profilePicture?: string;
  };
}

@Injectable()
export class GreedyBetQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GreedyBetQueueService.name);
  private betQueue: Queue<BetJobData>;
  private worker: Worker<BetJobData>;
  private pQueue: PQueue;
  private circuitBreaker: CircuitBreaker<[BetJobData], ApiResponse>;
  private server: Server;

  private stats = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    businessLogicFailed: 0,
  };
  public  GREEDY_POTS = [
    { index: 1, name: "Pot Burger", image: "BurgerGreedy.png" },
    { index: 2, name: "Pot Shrink", image: "ShrinkGreedy.png" },
    { index: 3, name: "Pot Fish", image: "FishGreedy.png" },
    { index: 4, name: "Pot Meat", image: "MeatGreedy.png" },
    { index: 5, name: "Pot Cherry", image: "CherryGreedy.png" },
    { index: 6, name: "Pot Orange", image: "OrangeGreedy.png" },
    { index: 7, name: "Pot Apple", image: "AppleGreedy.png" },
    { index: 8, name: "Pot Strawberry", image: "StrawberryGreedy.png" },
];
  constructor(@Inject('IOREDIS_CLIENT') private readonly ioredis: Redis) {}

  async onModuleInit() {
    await this.initializeQueue();
    await this.initializeWorker();
    this.initializeRateLimiter();
    this.initializeCircuitBreaker();
    this.startStatsLogger();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.betQueue?.close();
  }

  setServer(server: Server) {
    this.server = server;
    this.logger.log('Socket.IO server set for bet queue service');
  }

  private async initializeQueue() {
    this.betQueue = new Queue<BetJobData>('greedy-bets', {
      connection: this.ioredis,
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    });

    this.logger.log('BullMQ Queue initialized');
  }

  private async initializeWorker() {
    this.worker = new Worker<BetJobData>(
      'greedy-bets',
      async (job: Job<BetJobData>) => this.processBetJob(job),
      {
        connection: this.ioredis,
        concurrency: 5,
        limiter: { max: 3, duration: 1000 },
      },
    );

    this.worker.on('completed', (job) => {
      this.stats.completed++;
      this.stats.processing--;
      this.logger.log(`Job ${job.id} completed for user ${job.data.userId}`);
    });

    this.worker.on('failed', (job, err) => {
      this.stats.failed++;
      this.stats.processing--;

      if (job && job.attemptsMade < 8) {
        this.logger.warn(`Job ${job.id} failed (Attempt ${job.attemptsMade}/8): ${err.message}`);
      } else {
        this.logger.error(`Job  permanently failed after 8 attempts: ${err.message}`);
        this.handleJobFailure(job, err);
      }
    });

    this.worker.on('active', (job) => {
      this.stats.processing++;
      this.logger.debug(`Job ${job.id} is now active (Attempt ${job.attemptsMade + 1}/8)`);
    });

    this.logger.log('BullMQ Worker initialized with concurrency 5 and 3 jobs/sec');
  }

  private initializeRateLimiter() {
    this.pQueue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 3 });
    this.logger.log('Rate limiter initialized: 3 concurrent calls, 3 calls/sec');
  }

  private initializeCircuitBreaker() {
    const options = {
      timeout: 8000,
      errorThresholdPercentage: 50,
      resetTimeout: 15000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      volumeThreshold: 5,
    };

    this.circuitBreaker = new CircuitBreaker(this.callExternalApi.bind(this), options);

    this.circuitBreaker.on('open', () => this.logger.warn('Circuit breaker OPENED'));
    this.circuitBreaker.on('halfOpen', () => this.logger.log('Circuit breaker HALF-OPEN'));
    this.circuitBreaker.on('close', () => this.logger.log('Circuit breaker CLOSED'));

    this.logger.log('Circuit breaker initialized');
  }

  async addBetToQueue(betData: BetJobData): Promise<{ betId: string; queuePosition: number }> {
    try {
      const job = await this.betQueue.add('place-greedy-bet', betData);
      this.stats.queued++;
      const waiting = await this.betQueue.getWaitingCount();
      this.logger.log(`Bet ${betData.betId} queued (Position: ${waiting + 1})`);
      return { betId: betData.betId, queuePosition: waiting + 1 };
    } catch (error) {
      this.logger.error(`Failed to queue bet: ${error.message}`);
      throw error;
    }
  }

  private async processBetJob(job: Job<BetJobData>): Promise<ApiResponse> {
    const { betId, userId } = job.data;

    if (this.server) {
      this.server.to(`user:${userId}`).emit('greedybetProcessing', {
        betId,
        status: 'processing',
        attempt: job.attemptsMade + 1,
        maxAttempts: 5,
      });
    }

    try {
      if (this.circuitBreaker.opened) throw new Error('Service temporarily unavailable - retrying soon');

      const apiResponse = await this.pQueue.add(() => this.circuitBreaker.fire(job.data));
        //if response data balance is 0  then return  message success false and message insufficient balance to user Id
        // if (apiResponse.data && apiResponse.data.balance === 0) {
        //   apiResponse.success = false;
       
        //   this.server.to(`user:${userId}`).emit('greedyBetResponse', {
        //     success: false,
        //     message: 'Insufficient balance',
        //     data: { ...apiResponse.data, betId },
        //   });
        //   this.stats.businessLogicFailed++;
        //   return apiResponse;
        // }
        // //if balance is less then amount then return message insufficient balance
        // if (apiResponse.data && apiResponse.data.balance! < job.data.amount) {
        //   apiResponse.success = false;
        //     this.server.to(`user:${userId}`).emit('greedyBetResponse', {
        //     success: false,
        //     message: 'Insufficient balance',
        //     data: { ...apiResponse.data, betId },
        //   });
        //   this.stats.businessLogicFailed++;
        //   return apiResponse;
        // }
        const { potIndex, userId, amount, betType, appKey } = job.data;
        const potName = this.GREEDY_POTS.find(p => p.index === potIndex)?.name || `Unknown Pot ${potIndex}` ;
      if (this.server) {
        this.server.to(`user:${userId}`).emit('greedyBetResponse', {
          ...apiResponse,
          data: { ...apiResponse.data, betId, potIndex: Number(potIndex), betType, amount, potName },
        });
      }

      if (apiResponse.success && job.data.gameId == '1') {
        //integer cast job.data.gameId
        const gameId = Number(job.data.gameId);
        await masterPrisma.ongoingGreedyGame.create({
          data: { potIndex: Number(potIndex), userId, amount, type: betType, potName, appKey: appKey || null },
        });
        await masterPrisma.bet.create({
          data: { gameId, userId, bet: amount, type: betType, appKey: appKey || null },
        });
        await masterPrisma.allBet.create({
          data: { gameId, userId, bet: amount, type: betType, appKey: appKey || null },
        });
      }

      return apiResponse;
    } catch (error: any) {
      if (this.server) {
        this.server.to(`user:${userId}`).emit('greedyBetResponse', {
          success: false,
          message: error.message || 'Unknown error',
          data: { betId, permanentFailure: job.attemptsMade >= 7 },
        });
      }
      this.stats.failed++;
      throw error;
    }
  }

  private async callExternalApi(betData: BetJobData): Promise<ApiResponse> {
    const { betId, amount, betType, token, tenantBaseURL, userId } = betData;

    const submitFlowData = { betAmount: amount, type: betType, transactionId: betId };

    try {
      const response = await axios.post(`${tenantBaseURL}/wave/game/submitFlow`, submitFlowData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 7000,
      });
      return response.data;
    } catch (error: any) {
      let message = 'Unknown error';

      if (error.code === 'ECONNABORTED') message = 'API timeout';
      else if (error.code === 'ECONNREFUSED') message = 'API connection refused';
      else if (!error.response) message = 'No response from API';
      else if (error.response.status >= 500) message = `API server error: ${error.response.status}`;
      else if (error.response.status === 429) message = 'Rate limit exceeded';
      else message = error.response.data?.message || 'API client error';

      if (this.server) {
        this.server.to(`user:${userId}`).emit('greedyBetResponse', {
          success: false,
          message,
          data: { betId, permanentFailure: true },
        });
      }

      throw new Error(message);
    }
  }

  private handleJobFailure(job: Job<BetJobData> | undefined, error: Error) {
    if (!job) return;
    const { userId, betId } = job.data;

    let message = 'Failed to process bet after 8 attempts';
    if (error.message.includes('timeout')) message = 'API timeout - please contact support';
    else if (error.message.includes('unavailable')) message = 'Service temporarily unavailable - please try again later';
    else if (error.message.includes('Rate limit')) message = 'Too many requests - please slow down';

    if (this.server) {
      this.server.to(`user:${userId}`).emit('greedyBetResponse', {
        success: false,
        message,
        data: { betId, error: error.message, permanentFailure: true },
      });
    }
  }

  async getQueueStats() {
    const [waiting, active, delayed] = await Promise.all([
      this.betQueue.getWaitingCount(),
      this.betQueue.getActiveCount(),
      this.betQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed: this.stats.completed,
      failed: this.stats.failed,
      delayed,
      businessLogicFailed: this.stats.businessLogicFailed,
      circuitBreakerOpen: this.circuitBreaker.opened,
      circuitBreakerHalfOpen: this.circuitBreaker.halfOpen,
    };
  }

  private startStatsLogger() {
    setInterval(async () => {
      const stats = await this.getQueueStats();
      const circuitStatus = stats.circuitBreakerOpen
        ? 'OPEN'
        : stats.circuitBreakerHalfOpen
        ? 'HALF-OPEN'
        : 'CLOSED';

      this.logger.log(
        `Queue Stats - Waiting: ${stats.waiting}, Active: ${stats.active}, Completed: ${stats.completed}, API Failed: ${stats.failed}, Business Logic Failed: ${stats.businessLogicFailed}, Circuit: ${circuitStatus}`,
      );
    }, 10000);
  }
}
