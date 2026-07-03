import { EventContextInterceptor } from '../event-context.interceptor';
import { EventContext } from '../event-context';
import { Observable, of, lastValueFrom } from 'rxjs';

describe('EventContextInterceptor', () => {
  let interceptor: EventContextInterceptor;

  beforeEach(() => {
    interceptor = new EventContextInterceptor();
  });

  function createMockContext(user?: any) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  function createMockHandler(fn?: () => any) {
    return {
      handle: () => of(fn ? fn() : 'result'),
    } as any;
  }

  it('sets actor from user context', async () => {
    const user = { userId: 'u-1', firstName: 'John', lastName: 'Doe' };
    let capturedActor: any;

    const handler = {
      handle: () =>
        new Observable((subscriber) => {
          capturedActor = EventContext.getActor();
          subscriber.next('ok');
          subscriber.complete();
        }),
    } as any;

    const result$ = interceptor.intercept(createMockContext(user), handler);
    await lastValueFrom(result$);

    expect(capturedActor).toEqual({
      id: 'u-1',
      type: 'user',
      label: 'John Doe',
    });
  });

  it('passes through when no user', async () => {
    const handler = createMockHandler();
    const result$ = interceptor.intercept(createMockContext(undefined), handler);
    const result = await lastValueFrom(result$);
    expect(result).toBe('result');
  });

  it('handles user with only id field', async () => {
    const user = { id: 42 };
    let capturedActor: any;

    const handler = {
      handle: () =>
        new Observable((subscriber) => {
          capturedActor = EventContext.getActor();
          subscriber.next('ok');
          subscriber.complete();
        }),
    } as any;

    const result$ = interceptor.intercept(createMockContext(user), handler);
    await lastValueFrom(result$);

    expect(capturedActor).toEqual({
      id: '42',
      type: 'user',
      label: undefined,
    });
  });

  it('uses sub field as fallback for user id', async () => {
    const user = { sub: 'firebase-uid-123' };
    let capturedActor: any;

    const handler = {
      handle: () =>
        new Observable((subscriber) => {
          capturedActor = EventContext.getActor();
          subscriber.next('ok');
          subscriber.complete();
        }),
    } as any;

    const result$ = interceptor.intercept(createMockContext(user), handler);
    await lastValueFrom(result$);

    expect(capturedActor?.id).toBe('firebase-uid-123');
  });
});
