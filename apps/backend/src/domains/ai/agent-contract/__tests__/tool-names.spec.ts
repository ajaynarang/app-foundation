import { ToolNames, TOOL_NAMES_LIST } from '../tool-names.constants';

describe('ToolNames', () => {
  it('exposes every tool name as a unique string', () => {
    const values = Object.values(ToolNames);
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(v).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/);
    }
  });

  it('TOOL_NAMES_LIST matches Object.values(ToolNames)', () => {
    expect([...TOOL_NAMES_LIST].sort()).toEqual(Object.values(ToolNames).sort());
  });
});
