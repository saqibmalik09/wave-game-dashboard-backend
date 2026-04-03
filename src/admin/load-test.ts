import { io, Socket } from 'socket.io-client';

/**
 * Load testing script for Teen Patti betting system
 * Tests WebSocket bet placement at high concurrency
 */

interface LoadTestConfig {
  serverUrl: string;
  numClients: number;
  betsPerClient: number;
  betInterval: number; // ms between bets
  tableIds: string[];
}

class LoadTester {
  private clients: Socket[] = [];
  private totalBetsSent = 0;
  private totalBetsAcknowledged = 0;
  private totalBetsAccepted = 0;
  private totalErrors = 0;
  private startTime = 0;

  constructor(private config: LoadTestConfig) {}

  async run() {
    console.log('🚀 Starting load test...');
    console.log(`📊 Config: ${this.config.numClients} clients, ${this.config.betsPerClient} bets each`);
    console.log(`🎯 Target: ${this.config.numClients * this.config.betsPerClient} total bets\n`);

    this.startTime = Date.now();

    // Create clients
    await this.createClients();

    // Wait for all connections
    await this.waitForConnections();

    // Start sending bets
    await this.sendBets();

    // Wait for processing
    await this.waitForCompletion();

    // Show results
    this.showResults();

    // Cleanup
    this.disconnect();
  }

  private async createClients() {
    console.log('📡 Connecting clients...');

    for (let i = 0; i < this.config.numClients; i++) {
      const client = io(this.config.serverUrl, {
        transports: ['websocket'],
        reconnection: false,
      });

      // Setup event listeners
      client.on('connected', (data) => {
        // console.log(`✅ Client ${i} connected: ${data.socketId}`);
      });

      client.on('betAcknowledged', () => {
        this.totalBetsAcknowledged++;
      });

      client.on('betAccepted', () => {
        this.totalBetsAccepted++;
      });

      client.on('betError', (error) => {
        this.totalErrors++;
        console.error(`❌ Bet error:`, error);
      });

      this.clients.push(client);
    }
  }

  private async waitForConnections() {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const connected = this.clients.filter(c => c.connected).length;
        if (connected === this.config.numClients) {
          clearInterval(checkInterval);
          console.log(`✅ All ${this.config.numClients} clients connected\n`);
          resolve();
        }
      }, 100);
    });
  }

  private async sendBets() {
    console.log('💸 Sending bets...\n');

    const promises = this.clients.map((client, clientIndex) => {
      return this.sendBetsForClient(client, clientIndex);
    });

    await Promise.all(promises);
  }

  private async sendBetsForClient(client: Socket, clientIndex: number) {
    const userId = `user_${clientIndex}`;
    const tableId = this.config.tableIds[clientIndex % this.config.tableIds.length];

    // Join table first
    client.emit('joinTable', { tableId, userId });

    for (let i = 0; i < this.config.betsPerClient; i++) {
      const bet = {
        userId,
        amount: Math.floor(Math.random() * 1000) + 100,
        tableId,
        betType: ['player', 'banker', 'tie'][Math.floor(Math.random() * 3)],
      };

      client.emit('placeBet', bet);
      this.totalBetsSent++;

      // Optional: Add delay between bets
      if (this.config.betInterval > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.betInterval));
      }
    }
  }

  private async waitForCompletion() {
    console.log('⏳ Waiting for all bets to be processed...\n');

    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.totalBetsAccepted + this.totalErrors >= this.totalBetsSent) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 30000);
    });
  }

  private showResults() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const betsPerSecond = Math.round(this.totalBetsSent / elapsed);
    const successRate = ((this.totalBetsAccepted / this.totalBetsSent) * 100).toFixed(2);

    console.log('═══════════════════════════════════════');
    console.log('           LOAD TEST RESULTS           ');
    console.log('═══════════════════════════════════════');
    console.log(`Total Time: ${elapsed.toFixed(2)}s`);
    console.log(`Bets Sent: ${this.totalBetsSent}`);
    console.log(`Bets Acknowledged: ${this.totalBetsAcknowledged}`);
    console.log(`Bets Accepted: ${this.totalBetsAccepted}`);
    console.log(`Errors: ${this.totalErrors}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Throughput: ${betsPerSecond} bets/second`);
    console.log('═══════════════════════════════════════\n');
  }

  private disconnect() {
    console.log('Disconnecting all clients...');
    this.clients.forEach(client => client.disconnect());
  }
}

// Run load test
const config: LoadTestConfig = {
  serverUrl: 'http://localhost:4005',
  numClients: 100,
  betsPerClient: 100,
  betInterval: 0, // No delay for maximum throughput
  tableIds: ['table_1', 'table_2', 'table_3', 'table_4', 'table_5'],
};

const tester = new LoadTester(config);
tester.run().catch(console.error);