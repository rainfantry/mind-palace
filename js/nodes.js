// ---------------------------------------------------------------------------
// nodes.js — turn memory data into floating orbs.
//
// Builds a glowing orb + floating label per memory. Positions are just a STARTING
// spread (a helix) — once it's running, graph.js's force sim takes over and moves
// them around based on their links. So this file only cares about MAKING orbs,
// not where they end up.
//
// Exposes addNode / removeNode so the editor can grow and prune the graph live.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const TAG_COLOURS = {
  milestone: 0xffd166, // gold
  build:     0x4fd1ff, // cyan
  default:   0x9aa7b0,
};

export class MemorySwarm {
  constructor(stage) {
    this.stage = stage;
    this.orbs = [];

    // Subtle breathing so nothing's ever totally dead. Scale only — positions
    // belong to the force sim now.
    this.stage.onTick(() => {
      const t = performance.now() * 0.001;
      this.orbs.forEach((orb, i) => {
        const pulse = 1 + Math.sin(t * 1.5 + i) * 0.04;
        orb.scale.setScalar(orb.userData.baseScale * pulse);
      });
    });
  }

  build(memories) {
    const layout = this._buildHelix(memories.length);
    memories.forEach((memory, i) => this._spawn(memory, layout[i]));
  }

  // Make one orb from a memory and drop it in the world.
  _spawn(memory, startPos) {
    const colour = TAG_COLOURS[memory.tag] || TAG_COLOURS.default;
    const orb = this._makeOrb(colour);
    orb.position.copy(startPos || new THREE.Vector3(
      (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6
    ));

    orb.userData.memory = memory;
    orb.userData.baseScale = 1;
    orb.userData.velocity = new THREE.Vector3();  // for the force sim
    orb.userData.pinned = false;                  // true while a finger holds it

    const label = this._makeLabel(memory.title);
    label.position.copy(orb.position).add(new THREE.Vector3(0, 1.6, 0));
    orb.userData.label = label;

    this.stage.world.add(orb);
    this.stage.world.add(label);
    this.orbs.push(orb);
    return orb;
  }

  // EDITOR HOOK: add a brand-new node at runtime.
  addNode(memory) {
    return this._spawn(memory, null);
  }

  // EDITOR HOOK: remove a node by id, tidy up its three.js objects.
  removeNode(id) {
    const idx = this.orbs.findIndex((o) => o.userData.memory.id === id);
    if (idx === -1) return false;
    const orb = this.orbs[idx];
    this.stage.world.remove(orb);
    if (orb.userData.label) this.stage.world.remove(orb.userData.label);
    this.orbs.splice(idx, 1);
    return true;
  }

  // EDITOR HOOK: a node's text changed — redraw its label.
  refreshLabel(orb) {
    if (!orb.userData.label) return;
    this.stage.world.remove(orb.userData.label);
    const label = this._makeLabel(orb.userData.memory.title);
    label.position.copy(orb.position).add(new THREE.Vector3(0, 1.6, 0));
    orb.userData.label = label;
    this.stage.world.add(label);
  }

  _makeOrb(colour) {
    const geo = new THREE.IcosahedronGeometry(0.9, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: colour, emissive: colour, emissiveIntensity: 0.6,
      roughness: 0.35, metalness: 0.1,
    });
    const orb = new THREE.Mesh(geo, mat);
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.12 })
    );
    orb.add(halo);
    return orb;
  }

  _makeLabel(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(215, 227, 234, 0.95)";
    ctx.font = "bold 40px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text || "").slice(0, 28), 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(5, 1.25, 1);
    return sprite;
  }

  _buildHelix(n) {
    const points = [];
    const radius = 9;
    const turns = 2.2;
    const height = Math.max(n, 1) * 2.2;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const angle = t * turns * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        (t - 0.5) * height,
        Math.sin(angle) * radius
      ));
    }
    return points;
  }
}
