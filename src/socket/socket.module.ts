import { Module, forwardRef } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { SocketService } from './socket.service';
import { SocketController } from './socket.controller';
import { TeenpattiModule } from 'src/games/teen-patti-game/teenpatti/teenpatti.module';

@Module({
  imports: [forwardRef(() => TeenpattiModule)], // ✅ Fix: allow circular dependency
  providers: [SocketGateway, SocketService],
  controllers: [SocketController],
  exports: [SocketGateway],
})
export class SocketModule {}
