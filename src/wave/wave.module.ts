import { Module } from '@nestjs/common';
import { WaveController } from './wave.controller';
import { WaveService } from './wave.service';
import { AdminService } from 'src/admin/admin.service';

@Module({
  controllers: [WaveController],
  providers: [WaveService, AdminService]
})
export class WaveModule { }
