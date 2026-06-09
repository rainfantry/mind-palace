// ---------------------------------------------------------------------------
// store.js — saves your edits.
//
// The editor writes here. Anything you add or change in the browser gets stuffed
// into localStorage, so it survives a refresh without you touching any files.
// On boot, memories.js layers this on top of the seed + local file.
//
// Want it permanent / portable? Hit Export in the editor — it dumps the whole
// lot as JSON you can drop into data/memories.local.json.
// ---------------------------------------------------------------------------

const KEY = "mindpalace.memories.v1";

export const Store = {
  // Pull saved edits. Returns an array of nodes (possibly empty).
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.nodes) ? parsed.nodes : [];
    } catch (err) {
      console.warn("store: couldn't read saved memories:", err);
      return [];
    }
  },

  // Save the full node list. Editor calls this after every change.
  save(nodes) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ nodes }, null, 2));
      return true;
    } catch (err) {
      console.warn("store: save cooked it:", err);
      return false;
    }
  },

  // Hand back a pretty JSON string for the Export button.
  exportJson(nodes) {
    return JSON.stringify({ nodes }, null, 2);
  },

  // Nuke saved edits (back to seed + local file).
  clear() {
    localStorage.removeItem(KEY);
  },
};
