// ---------------------------------------------------------------------------
// memories.js — load the memory data, three layers deep.
//
// Priority, lowest to highest (higher wins on matching id):
//   1. data/memories.json         the public seed (safe stuff, committed)
//   2. data/memories.local.json   your real archive (gitignored, optional)
//   3. localStorage               your in-browser edits/adds (via store.js)
//
// Returns a clean, date-sorted array of nodes.
// ---------------------------------------------------------------------------

import { Store } from "./store.js";

const PUBLIC_FILE = "data/memories.json";
const LOCAL_FILE = "data/memories.local.json";

async function tryFetch(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // missing local file is normal
  }
}

export async function loadMemories() {
  const seed = await tryFetch(PUBLIC_FILE);
  if (!seed) {
    throw new Error("couldn't load the public seed — are you serving over http? (file:// won't cut it)");
  }
  const local = await tryFetch(LOCAL_FILE);
  const saved = Store.load();

  // Merge by id, in priority order.
  const byId = new Map();
  for (const node of seed.nodes || []) byId.set(node.id, node);
  if (local && Array.isArray(local.nodes)) {
    for (const node of local.nodes) byId.set(node.id, node);
  }
  for (const node of saved) byId.set(node.id, node);

  const merged = [...byId.values()];
  merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return merged;
}
