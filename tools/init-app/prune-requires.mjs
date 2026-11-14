/**
 * The prune step of init-app. It runs right after the feature manifests and reads only the disk: a skill, reference,
 * agent or hotspot file that requires a feature (frontmatter `requires: <feature>`, a hotspot file named
 * `<feature>.json` or carrying `"requires"`) is deleted when that feature's folder is absent, and a row of a skill's
 * table that links to a file that no longer exists is removed. It knows nothing about how a feature was removed. The
 * skills guard (tools/guards/skills-guard.mjs) fails on any leftover, so the two check each other.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_FOLDERS, parseFrontmatter } from '../guards/skills-guard.mjs';

const listOf = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Prunes `root`; returns one line per action. With dryRun, changes nothing and reports the same lines. */
export function pruneRequires(root, { dryRun = false } = {}) {
  const absent = (feature) => feature in FEATURE_FOLDERS && !fs.existsSync(path.join(root, FEATURE_FOLDERS[feature]));
  const needsAbsent = (rel) => {
    try {
      const { fm } = parseFrontmatter(fs.readFileSync(path.join(root, rel), 'utf8'));
      return listOf(fm?.requires).find(absent);
    } catch {
      return undefined;
    }
  };
  const deleted = new Set();
  const actions = [];
  const remove = (rel, feature) => {
    deleted.add(rel);
    actions.push(`delete ${rel} (requires ${feature}, ${FEATURE_FOLDERS[feature]} is absent)`);
    if (!dryRun) fs.rmSync(path.join(root, rel), { recursive: true, force: true });
  };
  const gone = (rel) =>
    [...deleted].some((d) => rel === d || rel.startsWith(d + '/')) || !fs.existsSync(path.join(root, rel));

  const skillsDir = path.join(root, '.claude/skills');
  const skills = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  for (const name of skills) {
    const feature = needsAbsent(`.claude/skills/${name}/SKILL.md`);
    if (feature) remove(`.claude/skills/${name}`, feature);
  }
  const markdown = [];
  const collect = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) collect(child);
      else if (e.name.endsWith('.md')) markdown.push(child);
    }
  };
  for (const name of skills) if (!gone(`.claude/skills/${name}`)) collect(`.claude/skills/${name}`);
  collect('.claude/agents');
  for (const rel of markdown) {
    if (rel.endsWith('/SKILL.md')) continue;
    const feature = needsAbsent(rel);
    if (feature) remove(rel, feature);
  }

  const hotspots = path.join(root, '.claude/hooks/hotspots');
  if (fs.existsSync(hotspots))
    for (const file of fs.readdirSync(hotspots).filter((f) => f.endsWith('.json'))) {
      let feature = path.basename(file, '.json');
      try {
        feature = JSON.parse(fs.readFileSync(path.join(hotspots, file), 'utf8')).requires ?? feature;
      } catch {
        /* an unreadable hotspot file is the skills guard's to report */
      }
      if (absent(feature)) remove(`.claude/hooks/hotspots/${file}`, feature);
    }

  for (const rel of markdown.filter((r) => r.endsWith('/SKILL.md') && !gone(r))) {
    const abs = path.join(root, rel);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    const dir = path.posix.dirname(rel);
    const kept = lines.filter((line) => {
      if (!line.trimStart().startsWith('|')) return true;
      const dead = [...line.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)]
        .map((m) => m[1])
        .filter((t) => !/^[a-z][a-z0-9+.-]*:/i.test(t))
        .find((t) => gone(path.posix.normalize(path.posix.join(dir, t))));
      if (dead) actions.push(`remove the row linking ${dead} from ${rel}`);
      return !dead;
    });
    if (kept.length !== lines.length && !dryRun) fs.writeFileSync(abs, kept.join('\n'));
  }
  return actions;
}
