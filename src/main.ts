// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Enable CORS for WebSocket
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // Serve static files from 'public' folder
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Wave Games Kafka API')
    .setDescription('Dynamic Kafka + Multi-tenant System')
    .setVersion('1.0')
    .addTag('kafka')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // http://127.0.0.1:5005/api

  const PORT = process.env.PORT || 5005;
  await app.listen(PORT);

  console.log(`✅ Application is running on: http://127.0.0.1:${PORT}`);
  console.log(`📘 Swagger available at: http://127.0.0.1:${PORT}/api`);
}
bootstrap();
