import { Module, forwardRef } from '@nestjs/common';
import { SocketModule } from 'src/socket/socket.module';
import { RedisModule } from 'src/redis/redis.module';
import { GreedyService } from './greedy.service';
import { GreedyBetQueueService } from './greedy-bet-queue.service';
import { GreedyController } from './greedy.controller';

@Module({
  imports: [
    SocketModule,
    RedisModule, 
  ],
  controllers: [GreedyController],
  providers: [
    GreedyService,
    GreedyBetQueueService,
  ],
  exports: [GreedyService],
})
export class GreedyModule {}