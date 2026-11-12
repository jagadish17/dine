// Tiny JSON-file store. All writes are serialized and written atomically (tmp file + rename),
// so a crash mid-write never leaves a half-written database.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const EMPTY = { groups: [], participants: [], restaurants: [], foodItems: [], selections: [] };

export function createStore(file) {
  let data = structuredClone(EMPTY);
  let queue = Promise.resolve();

  async function load() {
    try {
      const raw = await fs.readFile(file, 'utf8');
      data = { ...structuredClone(EMPTY), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await persist();
    }
  }

  async function persist() {
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  }

  /** Run a mutation exclusively, then persist. Throwing inside `fn` rolls nothing back,
   *  so mutations validate first and change state last. */
  function mutate(fn) {
    const run = queue.then(async () => {
      const result = fn(data);
      await persist();
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  return { load, mutate, get data() { return data; } };
}
