import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WalletService {
  constructor(private readonly redisService: RedisService) {}

  async getBalance(userId: string) {
    const balance = await this.redisService.get(`wallet:${userId}`);
    return Number(balance) || 0;
  }

  async setBalance(userId: string, amount: number) {
    return this.redisService.set(`wallet:${userId}`, amount);
  }

  async deductBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    if (balance < amount) return false;
    await this.redisService.decrBy(`wallet:${userId}`, amount);
    return true;
  }

  async addBalance(userId: string, amount: number) {
    return this.redisService.incrBy(`wallet:${userId}`, amount);
  }

  async addToPot(potIndex: number, amount: number) {
    return this.redisService.incrBy(`pot:${potIndex}`, amount);
  }

  async getPotTotal(potIndex: number) {
    const val = await this.redisService.get(`pot:${potIndex}`);
    return Number(val) || 0;
  }
}
