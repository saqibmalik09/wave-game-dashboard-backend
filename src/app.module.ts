import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { PrismaModule } from './prisma/prisma.module';
import { TeenpattiModule } from './games/teen-patti-game/teenpatti/teenpatti.module';
import { GreedyModule } from './games/greedy/greedy.module';
import { TenantOrOrganizationModule } from './tenant-or-organization/tenant-or-organization.module';
import { SocketModule } from './socket/socket.module';
import { RedisModule } from './redis/redis.module';
import { WalletModule } from './wallet/wallet.module';

// RBAC Modules
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UsersModule } from './users/users.module';
import { DatabaseService } from './common/database.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AdminModule,
    PrismaModule,
    TeenpattiModule,
    GreedyModule,
    TenantOrOrganizationModule,
    SocketModule,
    RedisModule,
    WalletModule,
    // RBAC Modules
    AuthModule,
    RolesModule,
    PermissionsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseService],
})
export class AppModule { }
