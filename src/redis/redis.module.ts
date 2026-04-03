// src/redis/redis.module.ts
import { Global, Module } from '@nestjs/common';
import { createClient } from 'redis';
import { RedisService } from './redis.service';
import IORedis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const client = createClient({
          url: 'redis://127.0.0.1:6379',
        });

        client.on('connect', () => console.log('Redis: Connecting...'));
        client.on('ready', () => console.log('Redis: Connected and ready!'));
        client.on('end', () => console.log('Redis: Connection closed'));
        client.on('error', (err) => console.error('Redis Client Error', err));

        await client.connect();
        return client;
      },
    },
    {
      provide: 'IOREDIS_CLIENT',
      useFactory: () => {
        const ioredis = new IORedis({
          host: '127.0.0.1',
          port: 6379,
          maxRetriesPerRequest: null, // Required for BullMQ
        });
        console.log('IORedis client created for BullMQ');
        return ioredis;
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', 'IOREDIS_CLIENT', RedisService],
})
export class RedisModule {}