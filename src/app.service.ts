import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    console.log(`PORT URL:  ${process.env.PORT}`);
    return 'Hello World!';
  }
}
