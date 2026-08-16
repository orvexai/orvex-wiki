import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis, { RedisOptions } from 'ioredis';
import {
  createRetryStrategy,
  parseRedisUrl,
  RedisConfig,
} from '../../common/helpers';
import { WebSocketCellGuard } from '../../common/cell-isolation/websocket-cell.guard';

export class WsRedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private redisConfig: RedisConfig;

  constructor(
    app: any,
    private readonly webSocketCellGuard: WebSocketCellGuard,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    this.redisConfig = parseRedisUrl(process.env.REDIS_URL);

    const options: RedisOptions = {
      family: this.redisConfig.family,
      retryStrategy: createRetryStrategy(),
    };

    const pubClient = new Redis(process.env.REDIS_URL, options);
    const subClient = new Redis(process.env.REDIS_URL, options);

    pubClient.on('error', (err) => () => {});
    subClient.on('error', (err) => () => {});

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      allowRequest: (request, callback) =>
        this.webSocketCellGuard.allowSocketIoRequest(request, callback),
    });
    server.adapter(this.adapterConstructor);
    return server;
  }
}
