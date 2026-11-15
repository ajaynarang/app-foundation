import { BULK_OPS_JOB_NAMES, QUEUE_NAMES, WEBHOOKS_JOB_NAMES } from '../queue.constants';
import { JOB_CATEGORIES, MANUAL_CATEGORY_TYPES, TYPE_DISPLAY_NAMES } from '../job.types';
import { EMPTY_APP_JOB_VOCABULARY, buildJobVocabulary, type AppJobVocabulary } from '../job-vocabulary';

const app = (over: Partial<AppJobVocabulary>): AppJobVocabulary => ({ ...EMPTY_APP_JOB_VOCABULARY, ...over });

describe('buildJobVocabulary', () => {
  it('with an empty app vocabulary, answers exactly the kernel maps', () => {
    const v = buildJobVocabulary(EMPTY_APP_JOB_VOCABULARY);

    expect(v.categories).toEqual(JOB_CATEGORIES);
    expect(v.allCategories).toEqual(Object.keys(JOB_CATEGORIES));
    expect(v.displayNames).toEqual(TYPE_DISPLAY_NAMES);
    expect(v.manualTypes).toEqual(MANUAL_CATEGORY_TYPES);
    expect(v.queueNames).toEqual(Object.values(QUEUE_NAMES));
  });

  it('merges app queues, job names, display names, categories and manual types beside the kernel ones', () => {
    const v = buildJobVocabulary(
      app({
        queueNames: { REPORTS: 'reports' },
        jobNames: { REPORTS: { BUILD: 'report-build' }, BULK_OPS: { REVALIDATE: 'credential-revalidate' } },
        displayNames: { 'report-build': 'Report Build', 'credential-revalidate': 'Credential Revalidation' },
        categories: {
          reports: { display: 'Reports', queue: 'reports', requiredIntegration: null, tenantVisible: true },
        },
        manualTypes: { reports: ['report-build'] },
      }),
    );

    expect(v.queueNames).toContain('reports');
    expect(v.jobNames).toEqual(expect.arrayContaining(['report-build', 'credential-revalidate', 'deliver']));
    expect(v.displayNames['report-build']).toBe('Report Build');
    expect(v.displayNames[BULK_OPS_JOB_NAMES.JOB_CLEANUP]).toBe('Job Cleanup');
    expect(v.categories.reports.queue).toBe('reports');
    expect(v.allCategories).toEqual([...Object.keys(JOB_CATEGORIES), 'reports']);
    expect(v.tenantVisibleCategories).toContain('reports');
    expect(v.categoryDisplayNames.reports).toBe('Reports');
    expect(v.manualTypes.reports).toEqual(['report-build']);
    expect(v.manualTypes.webhooks).toEqual([WEBHOOKS_JOB_NAMES.DELIVER]);
  });

  it('refuses an app queue whose key or name the kernel already defines', () => {
    expect(() => buildJobVocabulary(app({ queueNames: { BULK_OPS: 'app-bulk' } }))).toThrow(
      /queue key "BULK_OPS" is defined twice.*job-names\.ts/,
    );
    expect(() => buildJobVocabulary(app({ queueNames: { MY_EVENTS: QUEUE_NAMES.EVENTS } }))).toThrow(
      /queue "events" is defined twice/,
    );
  });

  it('refuses a job name the kernel or another app queue already defines', () => {
    expect(() =>
      buildJobVocabulary(app({ jobNames: { BULK_OPS: { MINE: BULK_OPS_JOB_NAMES.OUTBOX_RELAY } } })),
    ).toThrow(/job name "outbox-relay" is defined twice/);
    expect(() =>
      buildJobVocabulary(app({ jobNames: { BULK_OPS: { A: 'app-sync' }, AI_BACKGROUND: { B: 'app-sync' } } })),
    ).toThrow(/job name "app-sync" is defined twice/);
  });

  it('refuses job names for a queue nobody declared', () => {
    expect(() => buildJobVocabulary(app({ jobNames: { NOPE: { X: 'x' } } }))).toThrow(/unknown queue key "NOPE"/);
  });

  it('refuses a display name the kernel already defines', () => {
    expect(() => buildJobVocabulary(app({ displayNames: { [BULK_OPS_JOB_NAMES.JOB_CLEANUP]: 'Mine' } }))).toThrow(
      /display name for "job-cleanup" is defined twice/,
    );
  });

  it('refuses a category the kernel already defines, or one on an unknown queue', () => {
    const meta = { display: 'X', queue: QUEUE_NAMES.BULK_OPS, requiredIntegration: null, tenantVisible: false };
    expect(() => buildJobVocabulary(app({ categories: { maintenance: meta } }))).toThrow(
      /category "maintenance" is defined twice/,
    );
    expect(() => buildJobVocabulary(app({ categories: { x: { ...meta, queue: 'nowhere' } } }))).toThrow(
      /category "x" names unknown queue "nowhere"/,
    );
  });

  it('refuses manual types for an unknown category, or a type listed twice', () => {
    expect(() => buildJobVocabulary(app({ manualTypes: { nowhere: ['x'] } }))).toThrow(
      /manual types name unknown category "nowhere"/,
    );
    expect(() => buildJobVocabulary(app({ manualTypes: { webhooks: [WEBHOOKS_JOB_NAMES.DELIVER] } }))).toThrow(
      /manual type "deliver" in category "webhooks" is defined twice/,
    );
  });
});
