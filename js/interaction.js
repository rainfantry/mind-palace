// ---------------------------------------------------------------------------
// interaction.js — where hands meet memories. Multi-hand + gesture aware, and
// now plugged into the force graph: a grabbed orb gets PINNED to your finger and
// the sim drags its linked neighbours along on elastic.
//
// Per hand, every frame:
//   - point             -> a crosshair tracks your fingertip
//   - touch an orb       -> grab on CONTACT (pins it), drag it, holds ~2s
//   - closed fist        -> LOCK the grab, no timeout
//   - pinch              -> open the memory card (select / activate)
//   - open palm          -> drop whatever that hand's holding
//
// Two hands = two cursors = grab two clusters at once.
// Bottom-right readout shows exactly what each hand's doing.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const HOLD_MS = 2200; // contact-grab stickiness — "a couple secs"

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
      crosshair, grabbed: null, grabExpires: 0, locked: false,
      hovered: null, wasPinching: false,
    };
    this.handStates[i] = state;
    return state;
  }

  update(frame) {
    const hands = frame.hands || [];
    hands.forEach((hand, i) => this._processHand(this._stateFor(i), hand));

    // hands that left the frame: hide crosshair, drop their grab
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
    const { cursor, pinch, gesture } = hand;

    this._moveCrosshair(state, cursor, pinch);
    this.pointer.set(cursor.x, cursor.y);
    const justPinched = pinch && !state.wasPinching;

    if (gesture === "Open_Palm") this._release(state);

    if (state.grabbed) {
      this._dragOrb(state.grabbed);
      state.locked = gesture === "Closed_Fist";
      const stillTouching = this._raycastOrb() === state.grabbed;
      if (stillTouching || state.locked || pinch) state.grabExpires = now + HOLD_MS;
      if (!state.locked && now > state.grabExpires) this._release(state);
      if (justPinched) this._openMemory(state.grabbed.userData.memory);
    } else {
      const hit = this._raycastOrb();
      this._setHover(state, hit);
      if (hit) this._grab(state, hit, now);
      if (justPinched && hit) this._openMemory(hit.userData.memory);
    }
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

  _grab(state, orb, now) {
    if (this.handStates.some((s) => s && s !== state && s.grabbed === orb)) return;
    state.grabbed = orb;
    state.grabExpires = now + HOLD_MS;
    orb.userData.pinned = true;     // tell the force sim to leave it alone
    orb.userData.baseScale = 1.4;
  }

  _release(state) {
    if (state.grabbed) {
      state.grabbed.userData.pinned = false; // hand it back to the sim
      state.grabbed.userData.baseScale = 1;
    }
    state.grabbed = null;
    state.locked = false;
  }

  // Move the grabbed orb so it sits under the cursor at its own depth.
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

  _openMemory(memory) {
    if (!memory) return;
    this.ui.showCard(memory);
    this.narrator.speak(`${memory.title}. ${memory.body}`);
  }

  _renderHud(hands) {
    if (hands.length === 0) {
      this.ui.setHud("no hands detected\n(point at the camera)");
      return;
    }
    const lines = [`hands: ${hands.length}`];
    hands.forEach((h, i) => {
      const s = this.handStates[i];
      const doing = s?.grabbed ? (s.locked ? "LOCKED grab" : "dragging") : (s?.hovered ? "hovering" : "—");
      const title = s?.grabbed?.userData?.memory?.title ?? "";
      lines.push(
        `H${i} ${h.handedness.padEnd(5)} ${h.gesture}`,
        `   pinch ${h.pinchDist.toFixed(2)} ${h.pinch ? "●CLOSED" : "○open"}`,
        `   x ${h.cursor.x.toFixed(2)}  y ${h.cursor.y.toFixed(2)}`,
        `   → ${doing}${title ? ": " + title : ""}`
      );
    });
    this.ui.setHud(lines.join("\n"));
  }
}
