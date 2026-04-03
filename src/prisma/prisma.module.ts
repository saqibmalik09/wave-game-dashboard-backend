import { Global, Module } from '@nestjs/common';
import { PrismaController } from './prisma.controller';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  exports: [PrismaService],
  controllers: [PrismaController],
  providers: [PrismaService]
})
export class PrismaModule {}
