import * as fs from 'fs';
import * as path from 'path';
import { KB_AUDIENCE, ROLE_AUDIENCE, kbAudiencesFor, kbRoleFromToolArgs, knownKbAudiences } from '../kb-audience';

describe('knowledge-base audience rule (server-decided)', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER', 'owner', undefined, null, ''])(
    'a %s caller reads the shared audience in the starter, whose role map is empty',
    (role) => {
      expect(kbAudiencesFor(role)).toEqual([KB_AUDIENCE.ALL]);
    },
  );

  it('ships an empty role map, so the only known audience is all', () => {
    expect(ROLE_AUDIENCE).toEqual({});
    expect(knownKbAudiences()).toEqual(['all']);
  });

  it('reads the role only from the server-injected _role, never another argument', () => {
    expect(kbRoleFromToolArgs({})).toBeUndefined();
    expect(kbRoleFromToolArgs({ _role: 'ADMIN' })).toBe('ADMIN');
    expect(kbRoleFromToolArgs({ _role: 42 })).toBeUndefined();
    expect(kbRoleFromToolArgs({ audience: 'admin' } as never)).toBeUndefined();
  });

  it('every golden question names a caller and expects only files that caller can retrieve', () => {
    const goldenPath = path.resolve(__dirname, '../../../../../content/kb-eval/golden.json');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf-8')) as {
      questions: Array<{ q: string; caller: string; expect: string[] }>;
    };
    expect(golden.questions.length).toBeGreaterThan(0);

    const contentRoot = path.resolve(__dirname, '../../../../../content');
    for (const question of golden.questions) {
      expect(question.caller).toBeTruthy();
      expect(question.expect.length).toBeGreaterThan(0);
      for (const file of question.expect) {
        // Gold labels name real files, so a renamed file fails here instead of silently scoring as a miss.
        expect([question.q, fs.existsSync(path.join(contentRoot, file))]).toEqual([question.q, true]);
        const audience = /^audience:\s*(\S+)/m.exec(fs.readFileSync(path.join(contentRoot, file), 'utf-8'))?.[1];
        expect([question.q, kbAudiencesFor(question.caller).includes(audience ?? '')]).toEqual([question.q, true]);
      }
    }
  });
});
