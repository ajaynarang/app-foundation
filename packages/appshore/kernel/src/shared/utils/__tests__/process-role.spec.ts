import { getProcessRole, setProcessRole } from '../process-role';

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
