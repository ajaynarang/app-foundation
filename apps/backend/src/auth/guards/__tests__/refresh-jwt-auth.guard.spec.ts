import { RefreshJwtAuthGuard } from '../refresh-jwt-auth.guard';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    class MockAuthGuard {}
    return MockAuthGuard;
  },
}));

describe('RefreshJwtAuthGuard', () => {
  it('should be defined', () => {
    const guard = new RefreshJwtAuthGuard();
    expect(guard).toBeDefined();
  });

  it('should be an instance of RefreshJwtAuthGuard', () => {
    const guard = new RefreshJwtAuthGuard();
    expect(guard).toBeInstanceOf(RefreshJwtAuthGuard);
  });
});
