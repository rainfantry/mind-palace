// ---------------------------------------------------------------------------
// editor.js — add / edit / delete memories with the mouse.
//
// The swarm is the single source of truth: every orb carries its memory in
// orb.userData.memory. So editing = mutate that + redraw, and persisting = dump
// every orb's memory to localStorage via store.js. No separate list to keep in
// sync, nothing to drift.
//
// The DOM wiring lives in ui.js; this file is just the verbs.
// ---------------------------------------------------------------------------

import { Store } from "./store.js";

export class Editor {
  constructor(swarm, graph) {
    this.swarm = swarm;
    this.graph = graph;
  }

  // Every memory currently in the world.
  _all() {
    return this.swarm.orbs.map((o) => o.userData.memory);
  }

  // Push the current state to localStorage.
  persist() {
    Store.save(this._all());
  }

  // Spin up a fresh node and drop it in. Returns the new orb.
  addNode({ title = "new memory", body = "", tag = "build", links = [] } = {}) {
    const id = "n" + Date.now().toString(36);
    const date = new Date().toISOString().slice(0, 7); // YYYY-MM
    const memory = { id, date, title, body, tag, links };
    const orb = this.swarm.addNode(memory);
    this.graph.rebuildEdges();
    this.persist();
    return orb;
  }

  // Change an existing node's fields (title/body/tag/links/date).
  updateNode(orb, fields) {
    Object.assign(orb.userData.memory, fields);
    this.swarm.refreshLabel(orb);
    this.graph.rebuildEdges(); // links may have changed
    this.persist();
  }

  // Bin a node by id.
  deleteNode(id) {
    this.swarm.removeNode(id);
    this.graph.rebuildEdges();
    this.persist();
  }

  // For the Export button — full JSON you can paste into memories.local.json.
  exportJson() {
    return Store.exportJson(this._all());
  }
}
