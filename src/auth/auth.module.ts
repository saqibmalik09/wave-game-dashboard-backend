import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DatabaseService } from '../common/database.service';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        JwtModule.register({}), // Configuration is done in the service
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, DatabaseService],
    exports: [AuthService],
})
export class AuthModule { }
