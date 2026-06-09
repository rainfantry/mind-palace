// ---------------------------------------------------------------------------
// interaction.js — where hands meet memories. Multi-hand, gesture aware, with a
// physics brush and a navigation mode.
//
// GESTURE MODEL (per hand):
//   - point (index out)            -> crosshair tracks your fingertip; moving it
//                                     through orbs BRUSHES them — knocks them like
//                                     a physics object as the finger passes.
//   - PINCH (thumb+index)          -> grab + drag an orb. A quick pinch-tap (no
//                                     drag) SELECTS it: opens the card + reads it.
//   - TWO FINGERS (index+middle V) -> also expand/read (the deliberate open).
//   - OPEN PALM (all fingers)      -> NAVIGATE: move the open hand to orbit the
//                                     whole force-sphere of nodes.
//   - TWO HANDS                    -> spread/close them to ZOOM the view.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const TWO_FINGER_SPREAD = 0.11;   // index↔middle gap that counts as "open"
const EXPAND_DEBOUNCE_MS = 700;
const TAP_MS = 260;               // pinch shorter than this = a select-tap, not a drag

// brush / knock physics
const BRUSH_RADIUS = 3.0;
const BRUSH_PUSH = 0.5;           // radial shove away from the fingertip
const BRUSH_KNOCK = 6.0;          // how much of the finger's motion transfers

// navigation
const ORBIT_K = 1.6;              // open-palm orbit sensitivity
const ZOOM_K = 34;                // two-hand zoom sensitivity
const ZOOM_MIN = 8, ZOOM_MAX = 70;

export class Interaction {
  constructor(stage, swarm, narrator, ui) {
    this.stage = stage;
    this.swarm = swarm;
    this.narrator = narrator;
    this.ui = ui;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.handStates = [];
    this.lastZoomSpan = null;   // distance between two hands last frame
  }

  _stateFor(i) {
    if (this.handStates[i]) return this.handStates[i];
    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    crosshair.style.opacity = "0";
    document.body.appendChild(crosshair);
    const state = {
      crosshair, grabbed: null, hovered: null, wasPinching: false,
      grabStart: 0, lastExpand: 0, navLast: null, brushPrev: null, mode: "—",
    };
    this.handStates[i] = state;
    return state;
  }

  update(frame) {
    const hands = frame.hands || [];

    this._handleZoom(hands);
    hands.forEach((hand, i) => this._processHand(this._stateFor(i), hand));

    for (let i = hands.length; i < this.handStates.length; i++) {
      const s = this.handStates[i];
      if (!s) continue;
      s.crosshair.style.opacity = "0";
      this._release(s);
      this._setHover(s, null);
      s.navLast = null; s.brushPrev = null;
    }
    this._renderHud(hands);
  }

  // Two hands present → use the gap between them as a zoom dial.
  _handleZoom(hands) {
    if (hands.length === 2) {
      const a = hands[0].cursor, b = hands[1].cursor;
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.lastZoomSpan != null) {
        const delta = span - this.lastZoomSpan;       // spread apart = zoom in
        const cam = this.stage.camera;
        cam.position.z = THREE.MathUtils.clamp(cam.position.z - delta * ZOOM_K, ZOOM_MIN, ZOOM_MAX);
      }
      this.lastZoomSpan = span;
    } else {
      this.lastZoomSpan = null;
    }
  }

  _processHand(state, hand) {
    const now = performance.now();
    const { cursor, pinch, spreadDist = 0, gesture } = hand;

    this._moveCrosshair(state, cursor, pinch);
    this.pointer.set(cursor.x, cursor.y);

    // ---- OPEN PALM = navigate (orbit the sphere) ----
    if (gesture === "Open_Palm") {
      this._release(state);
      this._orbit(state, cursor);
      this._setHover(state, null);
      state.brushPrev = null;
      state.mode = "navigate";
      state.wasPinching = pinch;
      return;
    }
    state.navLast = null;

    const hit = this._raycastOrb();
    const justPinched = pinch && !state.wasPinching;
    const justReleased = !pinch && state.wasPinching;

    // ---- PINCH = grab + drag, quick tap = select ----
    if (justPinched && hit) this._grab(state, hit, now);
    if (state.grabbed && pinch) this._dragOrb(state.grabbed);
    if (justReleased && state.grabbed) {
      const held = now - state.grabStart;
      const orb = state.grabbed;
      this._release(state);
      if (held < TAP_MS) this._open(orb);   // pinch-to-select fallback
    }

    // ---- TWO FINGERS (V) = expand/read ----
    const twoFingerOpen = gesture === "Victory" || spreadDist >= TWO_FINGER_SPREAD;
    if (twoFingerOpen && (now - state.lastExpand > EXPAND_DEBOUNCE_MS)) {
      const target = state.grabbed || hit;
      if (target) { this._open(target); state.lastExpand = now; }
    }

    // ---- BRUSH: finger pushes nodes it passes through ----
    if (!state.grabbed && !pinch) this._brush(state);
    else state.brushPrev = null;

    this._setHover(state, state.grabbed || hit);
    state.mode = state.grabbed ? "drag" : (hit ? "hover" : "point");
    state.wasPinching = pinch;
  }

  _moveCrosshair(state, cursor, pinch) {
    const x = (cursor.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-cursor.y * 0.5 + 0.5) * window.innerHeight;
    state.crosshair.style.opacity = "1";
    state.crosshair.style.transform = `translate(${x}px, ${y}px)`;
    state.crosshair.classList.toggle("pinch", pinch);
  }

  _raycastOrb() {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const hits = this.raycaster.intersectObjects(this.swarm.orbs, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  // A point in the node field under the cursor (on the plane through the origin).
  _cursorWorldPoint() {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const dist = this.stage.camera.position.length(); // camera looks at origin
    const p = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, dist);
    this.stage.world.worldToLocal(p);
    return p;
  }

  // Knock nearby orbs as the fingertip moves past them.
  _brush(state) {
    const p = this._cursorWorldPoint();
    const vel = state.brushPrev ? p.clone().sub(state.brushPrev) : new THREE.Vector3();
    state.brushPrev = p.clone();

    for (const orb of this.swarm.orbs) {
      if (orb.userData.pinned) continue;
      const d = orb.position.distanceTo(p);
      if (d >= BRUSH_RADIUS) continue;
      const strength = 1 - d / BRUSH_RADIUS;
      const push = orb.position.clone().sub(p).normalize();
      orb.userData.velocity.addScaledVector(push, strength * BRUSH_PUSH);   // shove out of the way
      orb.userData.velocity.addScaledVector(vel, strength * BRUSH_KNOCK);   // carry the finger's motion
    }
  }

  // Open palm drag = orbit the whole world group.
  _orbit(state, cursor) {
    if (state.navLast) {
      const dx = cursor.x - state.navLast.x;
      const dy = cursor.y - state.navLast.y;
      this.stage.world.rotation.y += dx * ORBIT_K;
      this.stage.world.rotation.x = THREE.MathUtils.clamp(
        this.stage.world.rotation.x - dy * ORBIT_K, -1.2, 1.2
      );
    }
    state.navLast = { ...cursor };
  }

  _setHover(state, orb) {
    if (state.hovered === orb) return;
    if (state.hovered && !this._claimedElsewhere(state, state.hovered)) {
      state.hovered.material.emissiveIntensity = 0.6;
      state.hovered.userData.baseScale = 1;
    }
    state.hovered = orb;
    if (orb) {
      orb.material.emissiveIntensity = 1.4;
      orb.userData.baseScale = 1.25;
    }
  }

  _claimedElsewhere(self, orb) {
    return this.handStates.some((s) => s && s !== self && (s.grabbed === orb || s.hovered === orb));
  }

  _grab(state, orb, now) {
    if (this.handStates.some((s) => s && s !== state && s.grabbed === orb)) return;
    state.grabbed = orb;
    state.grabStart = now;
    orb.userData.pinned = true;
    orb.userData.baseScale = 1.4;
  }

  _release(state) {
    if (state.grabbed) {
      state.grabbed.userData.pinned = false;
      state.grabbed.userData.baseScale = 1;
    }
    state.grabbed = null;
  }

  _dragOrb(orb) {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const camDir = new THREE.Vector3();
    this.stage.camera.getWorldDirection(camDir);
    const orbWorld = new THREE.Vector3();
    orb.getWorldPosition(orbWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, orbWorld);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hit)) {
      this.stage.world.worldToLocal(hit);
      orb.position.copy(hit);
    }
  }

  // Open a memory: card + read aloud + a brightness pop.
  _open(orb) {
    if (!orb) return;
    orb.material.emissiveIntensity = 2.0;
    const memory = orb.userData.memory;
    this.ui.showCard(memory);
    this.narrator.speak(`${memory.title}. ${memory.body}`); // guarded: once per loop
  }

  _renderHud(hands) {
    if (hands.length === 0) {
      this.ui.setHud("no hands detected\n(point at the camera)");
      return;
    }
    const zoom = hands.length === 2 ? "  [ZOOM]" : "";
    const lines = [`hands: ${hands.length}${zoom}`];
    hands.forEach((h, i) => {
      const s = this.handStates[i];
      const title = s?.grabbed?.userData?.memory?.title ?? s?.hovered?.userData?.memory?.title ?? "";
      lines.push(
        `H${i} ${h.handedness.padEnd(5)} ${h.gesture}`,
        `   pinch ${h.pinchDist.toFixed(2)} ${h.pinch ? "●drag" : "○"}  spread ${(h.spreadDist ?? 0).toFixed(2)}`,
        `   x ${h.cursor.x.toFixed(2)}  y ${h.cursor.y.toFixed(2)}`,
        `   → ${s?.mode ?? "—"}${title ? ": " + title : ""}`
      );
    });
    this.ui.setHud(lines.join("\n"));
  }
}
