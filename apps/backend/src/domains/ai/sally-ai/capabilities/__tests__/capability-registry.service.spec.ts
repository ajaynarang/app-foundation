import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { CapabilityRegistryService } from '../capability-registry.service';

describe('CapabilityRegistryService', () => {
  let service: CapabilityRegistryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CapabilityRegistryService],
    }).compile();
    service = moduleRef.get(CapabilityRegistryService);
  });

  it('returns the dispatcher set for a DISPATCHER user', () => {
    const result = service.resolve({ userRole: UserRole.DISPATCHER });
    expect(result.mode).toBe('dispatcher');
    expect(result.quickActions.length).toBeGreaterThan(0);
    expect(result.categories.length).toBeGreaterThan(0);
  });

  it('returns the driver set for a DRIVER user', () => {
    const result = service.resolve({ userRole: UserRole.DRIVER });
    expect(result.mode).toBe('driver');
  });

  it('returns the owner set for an OWNER user', () => {
    const result = service.resolve({ userRole: UserRole.OWNER });
    expect(result.mode).toBe('owner');
  });

  it('returns the admin set for an ADMIN user', () => {
    const result = service.resolve({ userRole: UserRole.ADMIN });
    expect(result.mode).toBe('admin');
  });

  it('returns the super_admin set for a SUPER_ADMIN user', () => {
    const result = service.resolve({ userRole: UserRole.SUPER_ADMIN });
    expect(result.mode).toBe('super_admin');
  });

  it('returns the customer set for a CUSTOMER user', () => {
    const result = service.resolve({ userRole: UserRole.CUSTOMER });
    expect(result.mode).toBe('customer');
  });

  it('falls back to prospect when no role is provided', () => {
    const result = service.resolve({});
    expect(result.mode).toBe('prospect');
  });

  it('honors an explicit mode override over the user role', () => {
    const result = service.resolve({ requestedMode: 'prospect', userRole: UserRole.DISPATCHER });
    expect(result.mode).toBe('prospect');
  });

  it('ignores an unknown mode override and falls back to the user role', () => {
    const result = service.resolve({ requestedMode: 'gibberish', userRole: UserRole.DISPATCHER });
    expect(result.mode).toBe('dispatcher');
  });

  it('every category item has a non-empty example prompt', () => {
    const result = service.resolve({ userRole: UserRole.DISPATCHER });
    for (const category of result.categories) {
      for (const item of category.items) {
        expect(item.example.length).toBeGreaterThan(0);
        expect(item.id).toBeTruthy();
      }
    }
  });
});
