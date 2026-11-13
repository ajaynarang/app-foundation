import type { Citation } from '@app/shared-types';
import { TurnEvidence } from '../turn-evidence';

const doc = (n: number, title = `Guide number ${n}`): Citation => ({
  sourceType: 'KNOWLEDGE_DOCUMENT',
  sourceId: `kb_${n}`,
  title,
});

describe('TurnEvidence', () => {
  it('keeps only candidates named in the answer, in mention order', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1, 'Inviting teammates'), doc(2, 'Billing basics'), doc(3, 'Getting started')]);
    expect(evidence.citedIn('Read Getting started, then Inviting teammates.').map((c) => c.sourceId)).toEqual([
      'kb_3',
      'kb_1',
    ]);
  });

  it('matches a title case-insensitively, word-bounded', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1, 'Getting started')]);
    expect(evidence.citedIn('see the getting started guide')).toHaveLength(1);
    expect(evidence.citedIn('see the getting startedness guide')).toEqual([]);
  });

  it('returns [] when nothing retrieved is named', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1)]);
    expect(evidence.citedIn('Nothing here applies.')).toEqual([]);
  });

  it('never cites a single-word title: too likely to be ordinary prose', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1, 'Billing')]);
    expect(evidence.citedIn('Billing happens monthly.')).toEqual([]);
  });

  it('escapes regex metacharacters in titles', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1, 'C++ (legacy) notes')]);
    expect(evidence.citedIn('Use the C++ (legacy) notes.')).toHaveLength(1);
  });

  it('drops a malformed candidate instead of citing it', () => {
    const evidence = new TurnEvidence();
    evidence.offer([{ sourceType: 'KNOWLEDGE_DOCUMENT', title: 'Getting started' }, 'nope', null]);
    expect(evidence.citedIn('Getting started')).toEqual([]);
    expect(evidence.drainReading()).toEqual([]);
  });

  it('dedupes repeated offers of the same source', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1)]);
    evidence.offer([doc(1)]);
    expect(evidence.citedIn('Guide number 1')).toHaveLength(1);
    expect(evidence.drainReading()).toHaveLength(1);
  });

  it('caps reading frames per offer and drains once', () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1), doc(2), doc(3), doc(4), doc(5)]);
    expect(evidence.drainReading()).toEqual([
      { title: 'Guide number 1' },
      { title: 'Guide number 2' },
      { title: 'Guide number 3' },
    ]);
    expect(evidence.drainReading()).toEqual([]);
  });

  it('caps citations at MAX_CITATIONS_PER_MESSAGE', () => {
    const evidence = new TurnEvidence();
    const many = Array.from({ length: 12 }, (_, i) => doc(i + 1, `Guide ${String.fromCharCode(97 + i)}`));
    evidence.offer(many);
    expect(evidence.citedIn(many.map((c) => c.title).join(', '))).toHaveLength(8);
  });

  it('waitForReading resolves when a later offer queues frames', async () => {
    const evidence = new TurnEvidence();
    const waiting = evidence.waitForReading();
    evidence.offer([doc(1)]);
    await expect(waiting).resolves.toBeUndefined();
  });

  it('waitForReading resolves immediately when frames are already queued', async () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1)]);
    await expect(evidence.waitForReading()).resolves.toBeUndefined();
  });

  it('an offer of only known sources does not wake a waiter', async () => {
    const evidence = new TurnEvidence();
    evidence.offer([doc(1)]);
    evidence.drainReading();
    let woke = false;
    void evidence.waitForReading().then(() => {
      woke = true;
    });
    evidence.offer([doc(1)]);
    await Promise.resolve();
    expect(woke).toBe(false);
  });
});
