// ---------------------------------------------------------------------------
// memories.js — load the memory data.
//
// One job: go grab the JSON, and if there's a local override file, load that
// over the top. The public seed (data/memories.json) is the safe stuff. The
// real archive (data/memories.local.json) is gitignored and never leaves your
// machine. Same node from both files? Local wins.
// ---------------------------------------------------------------------------

const PUBLIC_FILE = "data/memories.json";
const LOCAL_FILE = "data/memories.local.json"; // gitignored, your real history

// Pull a JSON file. Returns null instead of throwing — a missing local file is
// normal and shouldn't cook the boot.
async function tryFetch(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // local file just won't exist most of the time — no dramas, move on.
    return null;
  }
}

// Load everything and hand back a clean array of nodes.
export async function loadMemories() {
  const seed = await tryFetch(PUBLIC_FILE);
  if (!seed) {
    throw new Error("couldn't load the public seed — are you serving over http? (file:// won't cut it)");
  }

  const local = await tryFetch(LOCAL_FILE);

  // Merge by id. Start with the public lot, then let local overwrite/add.
  const byId = new Map();
  for (const node of seed.nodes || []) byId.set(node.id, node);
  if (local && Array.isArray(local.nodes)) {
    for (const node of local.nodes) byId.set(node.id, node);
  }

  const merged = [...byId.values()];

  // Sort oldest-to-newest so the layout reads like a timeline you walk through.
  merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return merged;
}
