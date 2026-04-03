import { Module, forwardRef } from '@nestjs/common';
import { TeenpattiController } from './teenpatti.controller';
import { TeenpattiService } from './teenpatti.service';
import { SocketModule } from 'src/socket/socket.module';
import { TeenpattiBetQueueService } from './teenpatti-bet-queue.service';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    SocketModule,
    RedisModule, 
  ],
  controllers: [TeenpattiController],
  providers: [
    TeenpattiService,
    TeenpattiBetQueueService,
  ],
  exports: [TeenpattiService],
})
export class TeenpattiModule {}

