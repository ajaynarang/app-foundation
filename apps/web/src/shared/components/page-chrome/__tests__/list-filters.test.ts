/* global describe, it, expect, jest */
import {
  appliedFilters,
  describeFilter,
  filterRowMode,
  type ListFilterDeclaration,
} from '@app/ui/components/page-chrome';

const PROJECTS = [
  { value: 'pr_1', label: 'Payments' },
  { value: 'pr_2', label: 'Onboarding' },
];
const PRIORITIES = [
  { value: 'HIGH', label: 'High' },
  { value: 'LOW', label: 'Low' },
];

function filter(key: string, label: string, options: typeof PROJECTS, value?: string): ListFilterDeclaration {
  return { key, label, allLabel: `All ${label.toLowerCase()}s`, options, value, onChange: jest.fn() };
}

describe('filterRowMode', () => {
  it('has no filter slot when the screen declares no dropdowns', () => {
    expect(filterRowMode([])).toBe('none');
    expect(filterRowMode(undefined)).toBe('none');
  });

  it('keeps exactly one dropdown inline', () => {
    expect(filterRowMode([filter('source', 'Source', PROJECTS)])).toBe('inline');
  });

  it('moves two or more dropdowns behind the Filter button', () => {
    expect(filterRowMode([filter('project', 'Project', PROJECTS), filter('priority', 'Priority', PRIORITIES)])).toBe(
      'button',
    );
    expect(
      filterRowMode([
        filter('project', 'Project', PROJECTS),
        filter('priority', 'Priority', PRIORITIES),
        filter('owner', 'Owner', PROJECTS),
      ]),
    ).toBe('button');
  });
});

describe('appliedFilters', () => {
  it('counts only the filters that hold a value — the badge and the chips read the same list', () => {
    const filters = [filter('project', 'Project', PROJECTS, 'pr_1'), filter('priority', 'Priority', PRIORITIES)];
    expect(appliedFilters(filters).map((entry) => entry.key)).toEqual(['project']);
    expect(appliedFilters([filter('project', 'Project', PROJECTS)])).toEqual([]);
  });
});

describe('describeFilter', () => {
  it('names the filter and the option label the value stands for', () => {
    expect(describeFilter(filter('project', 'Project', PROJECTS, 'pr_1'))).toEqual({
      label: 'Project',
      valueLabel: 'Payments',
    });
  });

  it('falls back to the raw value when the options do not know it', () => {
    expect(describeFilter(filter('project', 'Project', PROJECTS, 'pr_gone'))).toEqual({
      label: 'Project',
      valueLabel: 'pr_gone',
    });
  });
});
