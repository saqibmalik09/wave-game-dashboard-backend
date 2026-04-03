import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Module({
  imports: [],
  controllers: [],
  providers: [WalletService],
})
export class WalletModule {}
