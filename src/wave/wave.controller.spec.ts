import { Test, TestingModule } from '@nestjs/testing';
import { WaveController } from './wave.controller';

describe('WaveController', () => {
  let controller: WaveController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaveController],
    }).compile();

    controller = module.get<WaveController>(WaveController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
