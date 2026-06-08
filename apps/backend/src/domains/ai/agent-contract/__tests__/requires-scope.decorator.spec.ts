import 'reflect-metadata';
import { RequiresScope, getRequiredScope, REQUIRES_SCOPE_METADATA_KEY } from '../requires-scope.decorator';

describe('@RequiresScope', () => {
  it('attaches scope metadata to a method', () => {
    class Fake {
      @RequiresScope('fleet:read')
      read() {
        return 'ok';
      }
    }
    const scope = Reflect.getMetadata(REQUIRES_SCOPE_METADATA_KEY, Fake.prototype, 'read');
    expect(scope).toBe('fleet:read');
  });

  it('getRequiredScope reads metadata from prototype + method name', () => {
    class Fake {
      @RequiresScope('invoices:write:sensitive')
      voidInvoice() {
        return null;
      }
    }
    expect(getRequiredScope(Fake.prototype, 'voidInvoice')).toBe('invoices:write:sensitive');
  });

  it('getRequiredScope returns undefined when absent', () => {
    class Fake {
      bare() {
        return null;
      }
    }
    expect(getRequiredScope(Fake.prototype, 'bare')).toBeUndefined();
  });

  it('rejects unknown scope strings at decoration time', () => {
    expect(() => {
      class Fake {
        @RequiresScope('bogus:read' as any)
        bad() {
          return null;
        }
      }
      // instantiate to ensure decorator runs
      new Fake();
    }).toThrow(/Invalid scope/);
  });
});
