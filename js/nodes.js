// ---------------------------------------------------------------------------
// nodes.js — turn memory data into floating 3D objects.
//
// Takes the array of memories and builds a glowing orb for each one, laid out
// on a slow helix so it reads like a timeline spiralling up through the dark.
// Each orb remembers which memory it is (orb.userData.memory) so when you grab
// it, we know what to open.
//
// Want a different layout later? Rip out buildHelix and write your own. Nothing
// else cares HOW they're positioned, only that they end up in stage.world.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// Colour an orb by its tag so milestones and builds read differently at a glance.
const TAG_COLOURS = {
  milestone: 0xffd166, // gold — the big rocks
  build:     0x4fd1ff, // cyan — the things you made
  default:   0x9aa7b0,
};

export class MemorySwarm {
  constructor(stage) {
    this.stage = stage;
    this.orbs = []; // every clickable orb, for the raycaster
  }

  // Build the whole swarm from the memory list.
  build(memories) {
    const layout = this._buildHelix(memories.length);

    memories.forEach((memory, i) => {
      const colour = TAG_COLOURS[memory.tag] || TAG_COLOURS.default;
      const orb = this._makeOrb(colour);

      orb.position.copy(layout[i]);

      // Stash the data on the object. This is the bit that matters — the orb
      // carries its memory around with it.
      orb.userData.memory = memory;
      orb.userData.homePosition = layout[i].clone(); // so it can drift back after you let go
      orb.userData.baseScale = 1;

      this.stage.world.add(orb);
      this.orbs.push(orb);

      // Floating text label above each orb so you can read the title without
      // opening it.
      const label = this._makeLabel(memory.title);
      label.position.copy(layout[i]).add(new THREE.Vector3(0, 1.6, 0));
      this.stage.world.add(label);
      orb.userData.label = label;
    });

    // Slow auto-rotate of the whole swarm so it feels alive. Stops feeling like
    // a screensaver the moment you reach in and grab something.
    this.stage.onTick((dt) => {
      this.stage.world.rotation.y += dt * 0.04;
      // gently breathe the orbs so they're never totally static
      const t = performance.now() * 0.001;
      this.orbs.forEach((orb, i) => {
        const pulse = 1 + Math.sin(t * 1.5 + i) * 0.04;
        orb.scale.setScalar(orb.userData.baseScale * pulse);
      });
    });
  }

  // A single glowing memory orb.
  _makeOrb(colour) {
    const geo = new THREE.IcosahedronGeometry(0.9, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: colour,
      emissive: colour,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.1,
    });
    const orb = new THREE.Mesh(geo, mat);

    // A faint outer shell for the glow halo.
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.12 })
    );
    orb.add(halo);

    return orb;
  }

  // Build a canvas-texture label. Cheap, readable, good enough.
  _makeLabel(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(215, 227, 234, 0.95)";
    ctx.font = "bold 40px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 28), 256, 64); // clip long titles so they don't blow out

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(5, 1.25, 1);
    return sprite;
  }

  // Lay n points on a vertical helix. Reads bottom-to-top as oldest-to-newest.
  _buildHelix(n) {
    const points = [];
    const radius = 9;
    const turns = 2.2;            // how many times it wraps around
    const height = Math.max(n, 1) * 2.2;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const angle = t * turns * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        (t - 0.5) * height,   // centre the column on y=0
        Math.sin(angle) * radius
      ));
    }
    return points;
  }
}
