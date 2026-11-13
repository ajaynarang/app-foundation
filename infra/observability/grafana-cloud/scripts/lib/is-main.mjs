import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** True when the module at `url` is the script Node was started with (symlinked temp folders included). */
export function isMain(url) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}
