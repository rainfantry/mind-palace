// ---------------------------------------------------------------------------
// scene.js — the three.js world.
//
// Sets up the camera, the lights, the starfield, the render loop. Knows nothing
// about hands or memories — it just paints whatever you put in it. Keep it that
// way; it's the bit you'll want to reuse.
// ---------------------------------------------------------------------------

import * as THREE from "three";

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;

    // Renderer. antialias on because the glowing nodes look like arse without it.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0e14, 0.012); // memories fade into the dark with distance

    // Camera. Sits back a bit, looking into the swarm.
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 26);

    this._addLights();
    this._addStars();

    // Everything you can interact with goes in here, so the raycaster has one
    // tidy place to look instead of the whole scene.
    this.world = new THREE.Group();
    this.scene.add(this.world);

    // Resize handling — keep it from stretching when the window changes.
    window.addEventListener("resize", () => this._onResize());

    // Per-frame hooks. Anything that wants to run every frame pushes a function
    // in here (the node swarm rotates this way, etc.).
    this._tickers = [];
  }

  _addLights() {
    this.scene.add(new THREE.AmbientLight(0x4488aa, 0.6));
    const key = new THREE.PointLight(0x4fd1ff, 1.2, 200);
    key.position.set(20, 20, 40);
    this.scene.add(key);
  }

  // A cheap starfield so the void isn't dead empty.
  _addStars() {
    const count = 800;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // scatter them in a big shell around the camera
      positions[i * 3 + 0] = (Math.random() - 0.5) * 300;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 300;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x335566, size: 0.4, transparent: true, opacity: 0.6 });
    this.scene.add(new THREE.Points(geo, mat));
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Register a function to run every frame. Returns nothing fancy — just push.
  onTick(fn) {
    this._tickers.push(fn);
  }

  // Kick off the render loop. Call once.
  start() {
    const clock = new THREE.Clock();
    const loop = () => {
      const dt = clock.getDelta();
      for (const tick of this._tickers) tick(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
