/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import { fireEvent, render, screen } from '@testing-library/react';
import { ListFilterRow } from '@app/ui/components/page-chrome/list-filter-row';
import type { ListFilterDeclaration } from '@app/ui/components/page-chrome';

const PROJECTS = [
  { value: 'pr_1', label: 'Payments' },
  { value: 'pr_2', label: 'Onboarding' },
];
const PRIORITIES = [
  { value: 'HIGH', label: 'High' },
  { value: 'LOW', label: 'Low' },
];

function declare(key: string, label: string, options: typeof PROJECTS, value?: string) {
  const onChange = jest.fn();
  const filter: ListFilterDeclaration = {
    key,
    label,
    allLabel: `All ${label.toLowerCase()}s`,
    options,
    value,
    onChange,
  };
  return { filter, onChange };
}

describe('ListFilterRow', () => {
  it('wrap: the pivot and the controls share one wrapping line; on a phone the controls take the full width', () => {
    const { container } = render(
      <ListFilterRow layout="wrap" pivot={<div data-testid="pivot" />} search={<div data-testid="search" />} />,
    );
    const row = screen.getByTestId('pivot').parentElement!.parentElement!;
    expect(row.className).toContain('flex-wrap');
    expect(row.className).not.toContain('flex-col');
    const controls = screen.getByTestId('search').parentElement!;
    expect(controls.className).toContain('w-full');
    expect(controls.className).toContain('sm:ml-auto');
    expect(container).toBeTruthy();
  });

  it('renders one declared dropdown inline as a select', () => {
    const source = declare('source', 'Source', PROJECTS);
    render(<ListFilterRow filters={[source.filter]} />);

    expect(screen.getByRole('combobox', { name: 'Source' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Filter/ })).toBeNull();
  });

  it('puts two dropdowns behind one Filter button whose count is the applied filters', () => {
    const project = declare('project', 'Project', PROJECTS, 'pr_1');
    const priority = declare('priority', 'Priority', PRIORITIES);
    render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter · 1' })).toBeTruthy();
  });

  it('shows the Filter button with no count when nothing is applied, and no chips', () => {
    const project = declare('project', 'Project', PROJECTS);
    const priority = declare('priority', 'Priority', PRIORITIES);
    render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Applied filters' })).toBeNull();
  });

  it('lists each applied filter as a chip, and removing a chip clears only that filter', () => {
    const project = declare('project', 'Project', PROJECTS, 'pr_1');
    const priority = declare('priority', 'Priority', PRIORITIES, 'HIGH');
    render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    expect(screen.getByRole('button', { name: 'Filter · 2' })).toBeTruthy();
    const chips = screen.getByRole('list', { name: 'Applied filters' });
    expect(chips.textContent).toContain('Project: Payments');
    expect(chips.textContent).toContain('Priority: High');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Project filter' }));

    expect(project.onChange).toHaveBeenCalledTimes(1);
    expect(project.onChange).toHaveBeenCalledWith(undefined);
    expect(priority.onChange).not.toHaveBeenCalled();
  });

  it('moves focus to the next chip when a chip is removed from the keyboard', () => {
    const project = declare('project', 'Project', PROJECTS, 'pr_1');
    const priority = declare('priority', 'Priority', PRIORITIES, 'HIGH');
    const { rerender } = render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    const removeProject = screen.getByRole('button', { name: 'Remove Project filter' });
    removeProject.focus();
    fireEvent.click(removeProject);
    // The param update lands and the Project chip unmounts.
    rerender(<ListFilterRow filters={[{ ...project.filter, value: undefined }, priority.filter]} />);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Priority filter' }));
  });

  it('moves focus to the previous chip when the last chip in the list is removed', () => {
    const project = declare('project', 'Project', PROJECTS, 'pr_1');
    const priority = declare('priority', 'Priority', PRIORITIES, 'HIGH');
    const { rerender } = render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    const removePriority = screen.getByRole('button', { name: 'Remove Priority filter' });
    removePriority.focus();
    fireEvent.click(removePriority);
    rerender(<ListFilterRow filters={[project.filter, { ...priority.filter, value: undefined }]} />);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Project filter' }));
  });

  it('moves focus to the Filter trigger when the only chip is removed', () => {
    const project = declare('project', 'Project', PROJECTS, 'pr_1');
    const priority = declare('priority', 'Priority', PRIORITIES);
    const { rerender } = render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    const removeProject = screen.getByRole('button', { name: 'Remove Project filter' });
    removeProject.focus();
    fireEvent.click(removeProject);
    rerender(<ListFilterRow filters={[{ ...project.filter, value: undefined }, priority.filter]} />);

    expect(screen.queryByRole('list', { name: 'Applied filters' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filter' }));
  });

  it('opens the popover with one labelled control per filter', () => {
    const project = declare('project', 'Project', PROJECTS);
    const priority = declare('priority', 'Priority', PRIORITIES);
    render(<ListFilterRow filters={[project.filter, priority.filter]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    expect(screen.getByRole('combobox', { name: 'Project' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeTruthy();
  });

  it('keeps Clear in the row only when something is applied', () => {
    const onClear = jest.fn();
    const { rerender } = render(<ListFilterRow canClear={false} onClear={onClear} />);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();

    rerender(<ListFilterRow canClear onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
