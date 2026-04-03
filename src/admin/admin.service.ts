import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-tenant.dto';
import { getTenantPrisma } from '../prisma/tenant.service';
import mysql from 'mysql2/promise';
import { execSync } from 'child_process';
import { errorResponse, successResponse } from 'src/common/response/response-helper';
import { v4 as uuidv4 } from 'uuid';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { masterPrisma } from 'src/prisma/masterClient';


@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class AdminService implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly master: PrismaService) { }
  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    console.log(' Teenpatti Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(` Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // ✅ Create new organization and tenant DB
  async createOrganization(dto: CreateOrganizationDto) {
    try {
      // 1️⃣ Create tenant DB dynamically
      const connection = await mysql.createConnection({
        host: dto.dbHost,
        user: dto.dbUser,
        password: dto.dbPassword,
      });
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dto.dbName}\`;`);
      await connection.end();

      // 2️⃣ Build tenant DB URL dynamically
      const tenantDbUrl = `mysql://${dto.dbUser}:${dto.dbPassword}@${dto.dbHost}:3306/${dto.dbName}`;

      // 3️⃣ Run tenant migrations ONLY on this DB
      execSync('npx prisma migrate deploy --schema=prisma/tenant/schema.prisma', {
        stdio: 'inherit',
        env: {
          TENANT_DATABASE_URL: tenantDbUrl, // override DATABASE_URL for this run
        },
      });

      // 4️⃣ Save organization in master DB
      const org = await this.master.organization.create({
        data: {
          name: dto.name,
          email: dto.email,
          dbHost: dto.dbHost,
          dbName: dto.dbName,
          dbUser: dto.dbUser,
          dbPassword: dto.dbPassword,
        },
      });

      // 5️⃣ Test tenant connection
      const tenantPrisma = await getTenantPrisma(org);
      await tenantPrisma.$connect();
      await tenantPrisma.$disconnect();

      return successResponse(
        'Organization created & tenant DB ready',
        org,
        HttpStatus.OK
      );
    } catch (error) {
      return errorResponse(
        'Failed to create organization',
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  //  Get all organizations
  async getAllOrganizations() {
    try {
      const orgs = await this.master.organization.findMany();
      return successResponse(
        'Organizations fetched successfully',
        orgs,
        HttpStatus.OK,
      );
    } catch (error) {
      return errorResponse(
        'Failed to fetch organizations',
        error.message,
        HttpStatus.NOT_ACCEPTABLE,
      );
    }
  }

  // ✅ Get Tenant Users by Organization ID
  async getTenantUsers(orgId: number) {
    try {
      const org = await this.master.organization.findUnique({
        where: { id: orgId },
      });

      if (!org) {
        return errorResponse(
          `Organization not found with ID: ${orgId}`,
          null,
          HttpStatus.OK,
        );
      }

      const tenantPrisma = await getTenantPrisma(org);
      const users = await tenantPrisma.user.findMany();
      await tenantPrisma.$disconnect();

      return successResponse(
        `Users fetched for organization: ${org.name}`,
        users,
        HttpStatus.OK,
      );
    } catch (error) {
      return errorResponse(
        'Failed to fetch tenant users',
        error.message,
        HttpStatus.NOT_ACCEPTABLE,
      );
    }
  }
  @SubscribeMessage('allGames')
  async getAllGames() {
    try {
      const games = await masterPrisma.game.findMany();
      return {
        success: true,
        message: 'All games fetched successfully',
        data: games,
      };
    } catch (err) {
      console.error('Error fetching all games:', err);
      return {
        success: false,
        message: 'Failed to fetch games',
        error: err.message,
      };
    }
  }

  @SubscribeMessage('gameConfiguration')
  async waveGameConfiguration(@MessageBody() { gameId }: { gameId: number }) {
    if (!gameId || typeof gameId !== 'number') {
      const response = {
        success: false,
        message: 'Invalid or missing gameId',
        data: null,
      };
      this.server.emit('gameConfigurationResponse', response);
      return response;
    }

    try {
      // Fetch only the config column from the database
      const game = await masterPrisma.game.findUnique({
        where: { id: gameId },
        select: { config: true },
      });

      if (!game || !game.config) {
        const response = {
          success: false,
          message: `No configuration found for gameId ${gameId}`,
          data: null,
        };
        this.server.emit('gameConfigurationResponse', response);
        return response;
      }

      const response = {
        success: true,
        message: 'Game configuration fetched successfully',
        data: game.config, // return only the config JSON
      };

      // Emit the response to all clients or filter to a specific client as needed
      this.server.emit('gameConfigurationResponse', response);
      return response;
    } catch (err) {
      console.error(`Error fetching game configuration for ID ${gameId}:`, err);
      const response = {
        success: false,
        message: 'Failed to fetch game configuration',
        error: err.message,
        data: null,
      };
      this.server.emit('gameConfigurationResponse', response);
      return response;
    }
  }

  @SubscribeMessage('tenantDetailsByAppKey')
  async tenantDetailsByAppKey(@MessageBody() body: { appKey: string }) {
    const appKey = body.appKey; 
    const appKeyConfigs: Record<string, any> = {
      "Eeb1GshW3a": {
        activeGames: "16,2003,77",
        tanantName: "Ricolive",
        environemnt: "production",
        tenantAppKey: "Eeb1GshW3a",
        tenantProductionDomain: "https://joygames.ricolivee.vip",
        tenantTestingDomain: "https://joygames.ricolivee.vip",
        tenantPassword: "24563672ER",
      },
      "b1K7dw2MZ3": {
        activeGames: "16,2003,77",
        tanantName: "Banolive",
        environemnt: "production",
        tenantAppKey: "b1K7dw2MZ3",
        tenantProductionDomain: "https://banolive.com/",
        tenantTestingDomain: "https://test.banolive.com/",
        tenantPassword: "22578672ER",
      },
      "2FUSmZfG0A": {
        activeGames: "16,2003,77",
        tanantName: "Fruity",
        environemnt: "production",
        tenantAppKey: "2FUSmZfG0A",
        tenantProductionDomain: "https://fruitylivy.com/",
        tenantTestingDomain: "https://socket.fruitylivy.com/",
        tenantPassword: "4357983jf",
      },
    };
    if (!appKey || typeof appKey !== "string") {
      const response = {
        success: false,
        message: "Invalid or missing appKey",
        data: null,
      };

      this.server.emit("tenantDetailsByAppKeyResponse", response);
      return response;
    }
    const tenantDetails = appKeyConfigs[appKey];

    if (!tenantDetails) {
      const response = {
        success: false,
        message: `No configuration found for tenant key ${appKey}`,
        data: null,
      };

      this.server.emit("tenantDetailsByAppKeyResponse", response);
      return response;
    }
    const response = {
      success: true,
      message: "Tenant configuration fetched successfully",
      data: tenantDetails,
    };

    this.server.emit("tenantDetailsByAppKeyResponse", response);
    return response;
  }


  private users = {
    "token123": {
      id: "10144et4",
      name: "John Doe",
      balance: 912000,
      profilePicture: "https://randomuser.me/api/portraits/men/70.jpg",
    },
    "abc999": {
      id: "202578232",
      name: "Saqib Malik",
      balance: 12000,
      profilePicture: "https://randomuser.me/api/portraits/men/55.jpg",
    },
    "urwhj234": {
      id: "202553452",
      name: "Saqib Malik",
      balance: 56978,
      profilePicture: "https://randomuser.me/api/portraits/men/59.jpg",
    }
  };


  async validateUserToken(token: string) {
    return this.users[token] || null;
  }

  async gameSubmitFlow(token: string) {
    return this.users[token] || null;
  }


  async createGameInMaster({
    name,
    description = null,
    appKey = null,
    status = "active",
    config = {},
  }) {
    try {
      if(!appKey )
      {
        return "Appkey is required.";
      }
      const newGame = await masterPrisma.game.create({
        data: {
          name,
          description,
          appKey,
          status,
          config,  // 👈 FULL JSON stored exactly
        },
      });

      return {
        success: true,
        message: "Game created successfully",
        data: newGame,
      };
    } catch (err) {
      console.error("Error creating game:", err);
      return {
        success: false,
        message: "Failed to create game",
        error: err.message,
      };
    }
  }

  public async gameStatistics(appKey: string) {
    const rows = await masterPrisma.bet.groupBy({
      by: ['gameId', 'type'],
      where: {
        appKey
      },
      _sum: {
        bet: true
      },
      _count: {
        _all: true
      }
    });
  
    const gameMap: Record<number, any> = {};
  
    for (const row of rows) {
      const gameId = row.gameId;
  
      if (!gameMap[gameId]) {
        gameMap[gameId] = {
          gameId,
          totalBetAmount: 0,
          totalPayoutAmount: 0,
          totalBets: 0
        };
      }
  
      if (row.type === 1) {
        gameMap[gameId].totalBetAmount += row._sum.bet || 0;
        gameMap[gameId].totalBets += row._count._all;
      }
  
      if (row.type === 2) {
        gameMap[gameId].totalPayoutAmount += row._sum.bet || 0;
      }
    }
  
    // finalize
    const games = Object.values(gameMap).map((g: any) => {
      const netProfit = g.totalBetAmount - g.totalPayoutAmount;
      return {
        ...g,
        netProfit,
        profitPercentage: g.totalBetAmount > 0
          ? +(netProfit / g.totalBetAmount * 100).toFixed(2)
          : 0
      };
    });
  
    // overall summary
    const summary = games.reduce(
      (acc, g) => {
        acc.totalBetAmount += g.totalBetAmount;
        acc.totalPayoutAmount += g.totalPayoutAmount;
        acc.totalBets += g.totalBets;
        acc.netProfit += g.netProfit;
        return acc;
      },
      {
        totalBetAmount: 0,
        totalPayoutAmount: 0,
        netProfit: 0,
        totalBets: 0
      }
    );
  
    return {
      appKey,
      summary: {
        ...summary,
        profitPercentage:
          summary.totalBetAmount > 0
            ? +(summary.netProfit / summary.totalBetAmount * 100).toFixed(2)
            : 0
      },
      games
    };
  }
  // Clear 
 public async gameBetClear(appKey: string) {
  try {
    // delete all bets for this appKey
    const result = await masterPrisma.bet.deleteMany({
      where: {
        appKey,
      },
    });

    return {
      appKey,
      deletedBetsCount: result.count,
    };
  } catch (error) {
    console.error('Error clearing bets:', error);
    throw error;
  }
}

}



