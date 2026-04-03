import { Test, TestingModule } from '@nestjs/testing';
import { WaveService } from './wave.service';

describe('WaveService', () => {
  let service: WaveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WaveService],
    }).compile();

    service = module.get<WaveService>(WaveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
