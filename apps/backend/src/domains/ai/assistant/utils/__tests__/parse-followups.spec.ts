import { parseFollowups } from '../parse-followups';

describe('parseFollowups', () => {
  it('returns original text and empty array when no followups block', () => {
    const text = 'Hello, here is your fleet status.';
    const result = parseFollowups(text);
    expect(result.cleanText).toBe(text);
    expect(result.followUps).toEqual([]);
  });

  it('extracts followups from a single block', () => {
    const text = `Here is your answer.

<followups>
What is the driver's HOS?
Show me active loads
Check fleet status
</followups>`;
    const result = parseFollowups(text);
    expect(result.cleanText).toBe('Here is your answer.');
    expect(result.followUps).toHaveLength(3);
    expect(result.followUps).toContain("What is the driver's HOS?");
    expect(result.followUps).toContain('Show me active loads');
  });

  it('uses the last block when multiple followup blocks exist', () => {
    const text = `First answer.

<followups>
Old suggestion one
Old suggestion two
</followups>

Second answer.

<followups>
New suggestion one
New suggestion two
</followups>`;
    const result = parseFollowups(text);
    expect(result.followUps).toContain('New suggestion one');
    expect(result.followUps).toContain('New suggestion two');
    expect(result.followUps).not.toContain('Old suggestion one');
  });

  it('filters out lines that are too short (< 5 chars)', () => {
    const text = `Answer.

<followups>
Hi
This is a valid follow-up
OK
</followups>`;
    const result = parseFollowups(text);
    expect(result.followUps).toEqual(['This is a valid follow-up']);
  });

  it('filters out lines that are too long (> 100 chars)', () => {
    const text = `Answer.

<followups>
Short question
${'A'.repeat(101)}
Another good one
</followups>`;
    const result = parseFollowups(text);
    expect(result.followUps).toEqual(['Short question', 'Another good one']);
  });

  it('strips <followup> tags from individual lines', () => {
    const text = `Answer.

<followups>
<followup>What loads are active?</followup>
<followup>Check driver HOS</followup>
</followups>`;
    const result = parseFollowups(text);
    expect(result.followUps).toContain('What loads are active?');
    expect(result.followUps).toContain('Check driver HOS');
  });

  it('handles trailing content after closing tag', () => {
    const text = `Answer.

<followups>
Show fleet status
</followups>
Some trailing text`;
    const result = parseFollowups(text);
    expect(result.followUps).toContain('Show fleet status');
  });
});
