// ---------------------------------------------------------------------------
// graph.js — the network. Edges + the force simulation that makes the swarm
// behave like a connected web instead of a loose cloud.
//
// This is the "drag one, the whole sphere follows" bit. Linked nodes are joined
// by springs; everything pushes apart a little so they don't pile up; a gentle
// pull keeps the whole thing centred. Grab a node and the sim leaves it pinned
// to your finger while its neighbours get yanked along on elastic.
//
// Small node counts, so the lazy O(n^2) repulsion is fine. If you ever load
// hundreds, swap the repulsion loop for a grid/quadtree.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// Tuning knobs. Fiddle these to change the feel.
const SPRING_K = 0.025;     // how hard linked nodes pull together
const REST_LENGTH = 6;      // how far apart linked nodes want to sit
const REPULSION = 22;       // how hard every node shoves every other one away
const CENTERING = 0.004;    // gentle pull back toward the middle
const DAMPING = 0.86;       // velocity bleed — lower = more sluggish, higher = bouncier
const MAX_SPEED = 2.5;      // clamp so nothing rockets off into the void

export class Graph {
  constructor(stage, swarm) {
    this.stage = stage;
    this.swarm = swarm;

    this.edgeLines = null;   // the THREE object that draws all the lines
    this.edges = [];         // [{ a: orb, b: orb }]

    this.rebuildEdges();

    // Run the sim every frame.
    this.stage.onTick((dt) => this._tick(dt));
  }

  // (Re)build the edge list + line geometry from whatever links the nodes have.
  // Call this after adding/removing/editing nodes.
  rebuildEdges() {
    if (this.edgeLines) {
      this.stage.world.remove(this.edgeLines);
      this.edgeLines.geometry.dispose();
      this.edgeLines.material.dispose();
    }

    // Map id -> orb so we can resolve links.
    const byId = new Map();
    for (const orb of this.swarm.orbs) byId.set(orb.userData.memory.id, orb);

    // Collect unique pairs (dedupe a<->b vs b<->a).
    const seen = new Set();
    this.edges = [];
    for (const orb of this.swarm.orbs) {
      const links = orb.userData.memory.links || [];
      for (const otherId of links) {
        const other = byId.get(otherId);
        if (!other) continue; // link points at something that isn't here — skip
        const key = [orb.userData.memory.id, otherId].sort().join("::");
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push({ a: orb, b: other });
      }
    }

    // Build one LineSegments object holding every edge (two verts each).
    const positions = new Float32Array(this.edges.length * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x4fd1ff,
      transparent: true,
      opacity: 0.28,
    });
    this.edgeLines = new THREE.LineSegments(geo, mat);
    this.edgeLines.frustumCulled = false; // verts move every frame, don't cull
    this.stage.world.add(this.edgeLines);
  }

  _tick(dt) {
    const orbs = this.swarm.orbs;
    if (orbs.length === 0) return;

    // clamp dt so a stutter doesn't blow the sim up
    const step = Math.min(dt, 0.05);

    // --- accumulate forces ---
    for (const orb of orbs) {
      if (orb.userData.pinned) continue; // held by a finger — don't push it
      const force = new THREE.Vector3();

      // centre pull
      force.add(orb.position.clone().multiplyScalar(-CENTERING));

      // repulsion from everyone else
      for (const other of orbs) {
        if (other === orb) continue;
        const away = orb.position.clone().sub(other.position);
        const distSq = Math.max(away.lengthSq(), 0.5);
        force.add(away.normalize().multiplyScalar(REPULSION / distSq));
      }

      orb.userData.velocity.add(force.multiplyScalar(step));
    }

    // --- springs along edges ---
    for (const { a, b } of this.edges) {
      const delta = b.position.clone().sub(a.position);
      const dist = Math.max(delta.length(), 0.001);
      const pull = delta.normalize().multiplyScalar((dist - REST_LENGTH) * SPRING_K);
      if (!a.userData.pinned) a.userData.velocity.add(pull);
      if (!b.userData.pinned) b.userData.velocity.sub(pull);
    }

    // --- integrate ---
    for (const orb of orbs) {
      if (orb.userData.pinned) { orb.userData.velocity.set(0, 0, 0); continue; }
      const v = orb.userData.velocity;
      v.multiplyScalar(DAMPING);
      if (v.length() > MAX_SPEED) v.setLength(MAX_SPEED);
      orb.position.add(v.clone().multiplyScalar(step * 60)); // *60 so it moves at a sane pace

      // drag the floating label along with its orb
      if (orb.userData.label) {
        orb.userData.label.position.copy(orb.position).add(new THREE.Vector3(0, 1.6, 0));
      }
    }

    this._updateEdgeGeometry();
  }

  // Push current orb positions into the line geometry so the edges follow.
  _updateEdgeGeometry() {
    if (!this.edgeLines) return;
    const pos = this.edgeLines.geometry.attributes.position;
    let i = 0;
    for (const { a, b } of this.edges) {
      pos.array[i++] = a.position.x; pos.array[i++] = a.position.y; pos.array[i++] = a.position.z;
      pos.array[i++] = b.position.x; pos.array[i++] = b.position.y; pos.array[i++] = b.position.z;
    }
    pos.needsUpdate = true;
  }
}
