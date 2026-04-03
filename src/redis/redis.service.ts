import { Inject, Injectable } from '@nestjs/common';
import type { RedisClientType } from 'redis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType) {}

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async set(key: string, value: string | number) {
    return this.redisClient.set(key, value.toString());
  }

  async incrBy(key: string, value: number) {
    return this.redisClient.incrBy(key, value);
  }

  async decrBy(key: string, value: number) {
    return this.redisClient.decrBy(key, value);
  }
}
