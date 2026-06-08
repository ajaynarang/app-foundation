import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventContext } from './event-context';
import { EventActor } from './domain-event';

@Injectable()
export class EventContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) return next.handle();

    const actor: EventActor = {
      id: String(user.userId || user.id || user.sub),
      type: 'user',
      label: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
    };

    return new Observable((subscriber) => {
      EventContext.run(actor, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
