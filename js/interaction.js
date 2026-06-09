// ---------------------------------------------------------------------------
// interaction.js — where hands meet memories. Multi-hand + gesture aware, and
// plugged into the force graph.
//
// GESTURE MODEL:
//   - point (open hand, index out)  -> a crosshair tracks your fingertip
//   - PINCH and hold over an orb     -> grab it; while pinched, drag it. The orb
//                                       is pinned, so its linked cluster gets
//                                       dragged along on elastic. Release = drop.
//   - OPEN your fingers wide (spread / open-palm) on an orb -> EXPAND it: open the
//                                       memory card and read it aloud.
//
// So: pinch = move it, open your hand = pop it open. Two hands work independently.
// Bottom-right readout shows what each hand is doing.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// Fingers counted "wide open" past this thumb-to-index distance. Pinch closed is
// well under PINCH_THRESHOLD (see hands.js, ~0.06), so this is a clear gap.
const SPREAD_THRESHOLD = 0.22;

// Only treat an open as "expand" if it happened shortly after a pinch, or it's a
// clean open-palm. And don't let it re-fire faster than this.
const PINCH_MEMORY_MS = 800;
const EXPAND_DEBOUNCE_MS = 700;

export class Interaction {
  constructor(stage, swarm, narrator, ui) {
    this.stage = stage;
    this.swarm = swarm;
    this.narrator = narrator;
    this.ui = ui;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.handStates = [];
  }

  _stateFor(i) {
    if (this.handStates[i]) return this.handStates[i];
    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    crosshair.style.opacity = "0";
    document.body.appendChild(crosshair);
    const state = {
      crosshair, grabbed: null, hovered: null,
      wasPinching: false, pinchedAt: 0, lastExpand: 0,
    };
    this.handStates[i] = state;
    return state;
  }

  update(frame) {
    const hands = frame.hands || [];
    hands.forEach((hand, i) => this._processHand(this._stateFor(i), hand));

    for (let i = hands.length; i < this.handStates.length; i++) {
      const s = this.handStates[i];
      if (!s) continue;
      s.crosshair.style.opacity = "0";
      this._release(s);
      this._setHover(s, null);
    }
    this._renderHud(hands);
  }

  _processHand(state, hand) {
    const now = performance.now();
    const { cursor, pinch, pinchDist, gesture } = hand;

    this._moveCrosshair(state, cursor, pinch);
    this.pointer.set(cursor.x, cursor.y);

    const hit = this._raycastOrb();
    const justPinched = pinch && !state.wasPinching;

    // ---- PINCH = grab + drag ----
    if (justPinched && hit) this._grab(state, hit);
    if (state.grabbed) {
      if (pinch) {
        this._dragOrb(state.grabbed);   // still pinched: drag it
      } else {
        this._release(state);           // let go: drop it
      }
    }
    if (pinch) state.pinchedAt = now;     // remember we were pinching (for the open-to-expand)

    // ---- OPEN FINGERS = expand + read ----
    const openedFromPinch = !pinch && pinchDist >= SPREAD_THRESHOLD &&
                            (now - state.pinchedAt < PINCH_MEMORY_MS);
    const openPalm = gesture === "Open_Palm";
    if ((openedFromPinch || openPalm) && (now - state.lastExpand > EXPAND_DEBOUNCE_MS)) {
      const target = state.grabbed || hit;
      if (target) {
        this._expand(state, target);
        state.lastExpand = now;
        state.pinchedAt = 0;
      }
    }

    // hover highlight
    this._setHover(state, state.grabbed || hit);
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

  _grab(state, orb) {
    if (this.handStates.some((s) => s && s !== state && s.grabbed === orb)) return;
    state.grabbed = orb;
    orb.userData.pinned = true;       // force sim leaves it where the finger puts it
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

  // Open the memory card + read it. Also a quick visual pop so the expand reads.
  _expand(state, orb) {
    if (state.grabbed) this._release(state); // opening your hand drops the grab
    orb.material.emissiveIntensity = 2.0;
    this._openMemory(orb.userData.memory);
  }

  _openMemory(memory) {
    if (!memory) return;
    this.ui.showCard(memory);
    this.narrator.speak(`${memory.title}. ${memory.body}`); // guarded: once per loop
  }

  _renderHud(hands) {
    if (hands.length === 0) {
      this.ui.setHud("no hands detected\n(point at the camera)");
      return;
    }
    const lines = [`hands: ${hands.length}`];
    hands.forEach((h, i) => {
      const s = this.handStates[i];
      const doing = s?.grabbed ? "dragging" : (s?.hovered ? "hovering" : "—");
      const title = s?.grabbed?.userData?.memory?.title ?? s?.hovered?.userData?.memory?.title ?? "";
      lines.push(
        `H${i} ${h.handedness.padEnd(5)} ${h.gesture}`,
        `   pinch ${h.pinchDist.toFixed(2)} ${h.pinch ? "●CLOSED→drag" : "○open"}`,
        `   x ${h.cursor.x.toFixed(2)}  y ${h.cursor.y.toFixed(2)}`,
        `   → ${doing}${title ? ": " + title : ""}`
      );
    });
    this.ui.setHud(lines.join("\n"));
  }
}
