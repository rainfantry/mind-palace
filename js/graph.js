// ---------------------------------------------------------------------------
// graph.js — the network: edges + the force simulation.
//
// Layout has STRUCTURE now, not just a soup:
//   - a CENTER node (the persona / subject) is pinned at the origin — the radial
//     point everything hangs off.
//   - every category gets its own DIRECTION on the sphere (a sector), so nodes
//     group with their own kind: corruption clusters one way, trauma another,
//     defense another. The force sphere is the reference frame.
//   - links (springs) + repulsion still shape the detail inside each group, and
//     grabbing/brushing still shoves things around — the layout just re-settles.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const SPRING_K = 0.025;
const REST_LENGTH = 5.5;
const REPULSION = 18;
const CENTERING = 0.002;     // weak — grouping does most of the centring now
const DAMPING = 0.86;
const MAX_SPEED = 2.5;

// category grouping
const GROUP_RADIUS = 11;     // how far each category's sector sits from the centre
const GROUP_K = 0.02;        // how strongly a node is pulled to its category sector

export class Graph {
  constructor(stage, swarm) {
    this.stage = stage;
    this.swarm = swarm;
    this.edgeLines = null;
    this.edges = [];
    this.center = null;            // the pinned centre orb
    this.categoryAnchors = {};     // tag -> unit direction on the sphere

    this._findCenter();
    this._buildCategoryAnchors();
    this.rebuildEdges();
    this.stage.onTick((dt) => this._tick(dt));
  }

  // The centre is the persona/subject node if there is one. Pin it at the origin.
  _findCenter() {
    this.center =
      this.swarm.orbs.find((o) => o.userData.memory.tag === "persona") ||
      this.swarm.orbs.find((o) => o.userData.memory.id === "subject") ||
      null;
    if (this.center) {
      this.center.position.set(0, 0, 0);
      this.center.userData.velocity.set(0, 0, 0);
    }
  }

  // Spread each category evenly over a sphere (fibonacci) so groups don't overlap.
  _buildCategoryAnchors() {
    const cats = [...new Set(this.swarm.orbs.map((o) => o.userData.memory.tag))]
      .filter((t) => t !== "persona"); // centre doesn't get a sector
    const n = Math.max(cats.length, 1);
    const anchors = {};
    cats.forEach((cat, i) => {
      const y = 1 - (i / Math.max(n - 1, 1)) * 2;          // 1 .. -1
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * Math.PI * (3 - Math.sqrt(5));          // golden angle
      anchors[cat] = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
    });
    this.categoryAnchors = anchors;
  }

  // Rebuild after add/remove/edit. Refreshes centre, sectors, and edge lines.
  rebuildEdges() {
    this._findCenter();
    this._buildCategoryAnchors();

    if (this.edgeLines) {
      this.stage.world.remove(this.edgeLines);
      this.edgeLines.geometry.dispose();
      this.edgeLines.material.dispose();
    }

    const byId = new Map();
    for (const orb of this.swarm.orbs) byId.set(orb.userData.memory.id, orb);

    const seen = new Set();
    this.edges = [];
    for (const orb of this.swarm.orbs) {
      const links = orb.userData.memory.links || [];
      for (const otherId of links) {
        const other = byId.get(otherId);
        if (!other) continue;
        const key = [orb.userData.memory.id, otherId].sort().join("::");
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push({ a: orb, b: other });
      }
    }

    const positions = new Float32Array(this.edges.length * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.28 });
    this.edgeLines = new THREE.LineSegments(geo, mat);
    this.edgeLines.frustumCulled = false;
    this.stage.world.add(this.edgeLines);
  }

  _tick(dt) {
    const orbs = this.swarm.orbs;
    if (orbs.length === 0) return;
    const step = Math.min(dt, 0.05);

    // keep the centre nailed to the origin
    if (this.center) {
      this.center.position.set(0, 0, 0);
      this.center.userData.velocity.set(0, 0, 0);
    }

    // forces
    for (const orb of orbs) {
      if (orb.userData.pinned || orb === this.center) continue;
      const force = new THREE.Vector3();

      // weak pull to centre (stops strays drifting off)
      force.add(orb.position.clone().multiplyScalar(-CENTERING));

      // pull toward this node's CATEGORY sector on the sphere → grouping
      const anchor = this.categoryAnchors[orb.userData.memory.tag];
      if (anchor) {
        const target = anchor.clone().multiplyScalar(GROUP_RADIUS);
        force.add(target.sub(orb.position).multiplyScalar(GROUP_K));
      }

      // repulsion from everyone else
      for (const other of orbs) {
        if (other === orb) continue;
        const away = orb.position.clone().sub(other.position);
        const distSq = Math.max(away.lengthSq(), 0.5);
        force.add(away.normalize().multiplyScalar(REPULSION / distSq));
      }

      orb.userData.velocity.add(force.multiplyScalar(step));
    }

    // springs along links
    for (const { a, b } of this.edges) {
      const delta = b.position.clone().sub(a.position);
      const dist = Math.max(delta.length(), 0.001);
      const pull = delta.normalize().multiplyScalar((dist - REST_LENGTH) * SPRING_K);
      if (!a.userData.pinned && a !== this.center) a.userData.velocity.add(pull);
      if (!b.userData.pinned && b !== this.center) b.userData.velocity.sub(pull);
    }

    // integrate
    for (const orb of orbs) {
      if (orb.userData.pinned || orb === this.center) continue;
      const v = orb.userData.velocity;
      v.multiplyScalar(DAMPING);
      if (v.length() > MAX_SPEED) v.setLength(MAX_SPEED);
      orb.position.add(v.clone().multiplyScalar(step * 60));
      if (orb.userData.label) {
        orb.userData.label.position.copy(orb.position).add(new THREE.Vector3(0, 1.6, 0));
      }
    }

    this._updateEdgeGeometry();
  }

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
