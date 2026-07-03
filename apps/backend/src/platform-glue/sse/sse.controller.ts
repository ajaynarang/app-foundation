import { Controller, Sse, Req, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Observable, Subject, interval, map, takeUntil, merge } from 'rxjs';
import { Request } from 'express';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { SseService } from '@appshore/kernel/infrastructure/sse/sse.service';
import { SSE_EVENTS } from '@appshore/kernel/infrastructure/sse/sse-events.constants';

@ApiTags('SSE')
@Controller('sse')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(private readonly sseService: SseService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Subscribe to real-time events via SSE' })
  stream(@CurrentUser() user: any, @Req() req: Request): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const disconnect$ = new Subject<void>();

    this.sseService.addClient(user.userId, user.tenantDbId, subject);

    // Send initial heartbeat
    subject.next({
      data: JSON.stringify({
        connected: true,
        timestamp: new Date().toISOString(),
      }),
      type: SSE_EVENTS.HEARTBEAT,
    } as MessageEvent);

    // Periodic heartbeat every 30 seconds
    const heartbeat$ = interval(30_000).pipe(
      takeUntil(disconnect$),
      map(
        () =>
          ({
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
            type: SSE_EVENTS.HEARTBEAT,
          }) as MessageEvent,
      ),
    );

    req.on('close', () => {
      disconnect$.next();
      disconnect$.complete();
      this.sseService.removeClient(user.userId, subject);
    });

    return merge(subject.asObservable(), heartbeat$);
  }
}
