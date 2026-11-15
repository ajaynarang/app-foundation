import { getProcessRole, reportsOpsGauges, setProcessRole } from '../process-role';

describe('process role', () => {
  afterEach(() => setProcessRole('api'));

  it('defaults to api, the HTTP process booted by main.ts', () => {
    expect(getProcessRole()).toBe('api');
  });

  it('reports worker once the worker entry point claims it', () => {
    setProcessRole('worker');

    expect(getProcessRole()).toBe('worker');
  });
});

describe('reportsOpsGauges', () => {
  afterEach(() => setProcessRole('api'));

  it('is true in the worker, whatever the key says', () => {
    setProcessRole('worker');

    expect(reportsOpsGauges({})).toBe(true);
    expect(reportsOpsGauges({ OPS_GAUGES_FROM_API: 'false' })).toBe(true);
  });

  it('is false in the API when the key is unset, so a worker and an API never both report', () => {
    expect(reportsOpsGauges({})).toBe(false);
    expect(reportsOpsGauges({ OPS_GAUGES_FROM_API: '' })).toBe(false);
    expect(reportsOpsGauges({ OPS_GAUGES_FROM_API: '1' })).toBe(false);
  });

  it('is true in the API only when OPS_GAUGES_FROM_API=true (no worker task)', () => {
    expect(reportsOpsGauges({ OPS_GAUGES_FROM_API: 'true' })).toBe(true);
    expect(reportsOpsGauges({ OPS_GAUGES_FROM_API: ' TRUE ' })).toBe(true);
  });
});
