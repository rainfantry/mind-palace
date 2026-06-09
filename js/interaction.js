// ---------------------------------------------------------------------------
// interaction.js — where hands meet memories. Now multi-hand + gesture aware.
//
// Per hand, every frame:
//   - point             -> a crosshair tracks your fingertip
//   - touch an orb       -> grab on CONTACT, drag it, holds ~2s (the "drag on
//                           impact" behaviour). Move off and it lets go + drifts home.
//   - closed fist        -> LOCK the grab, no timeout, until you open the hand
//   - pinch              -> open the memory card (select / activate)
//   - open palm          -> drop whatever that hand is holding
//
// Two hands = two independent cursors, so you can grab two orbs at once. That's
// the multi-select.
//
// It also feeds the bottom-right readout (ui.setHud) with exactly what each hand
// is doing, so you can see what the tracker sees.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// Contact-grab sticks for this long after you stop touching the orb. "A couple secs."
const HOLD_MS = 2200;

export class Interaction {
  constructor(stage, swarm, narrator, ui) {
    this.stage = stage;
    this.swarm = swarm;
    this.narrator = narrator;
    this.ui = ui;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // One state bucket per hand index (0 and 1). Built lazily as hands appear.
    this.handStates = [];

    // Drift released orbs back home every frame.
    this.stage.onTick(() => this._driftHome());
  }

  // Make (or fetch) the state for hand index i, including its own crosshair div.
  _stateFor(i) {
    if (this.handStates[i]) return this.handStates[i];

    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    crosshair.style.opacity = "0";
    document.body.appendChild(crosshair);

    const state = {
      crosshair,
      grabbed: null,        // orb this hand is holding
      grabExpires: 0,       // when a contact-grab lets go
      locked: false,        // fist = no timeout
      hovered: null,
      wasPinching: false,
    };
    this.handStates[i] = state;
    return state;
  }

  // Called every frame by hands.js.
  update(frame) {
    const hands = frame.hands || [];

    // Process each visible hand.
    hands.forEach((hand, i) => this._processHand(this._stateFor(i), hand));

    // Hide crosshairs / drop grabs for hands that left the frame.
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

    // Open palm = let go, always.
    if (gesture === "Open_Palm") this._release(state);

    if (state.grabbed) {
      // ---- holding something ----
      this._dragOrb(state.grabbed);

      // Fist locks the hold; otherwise it's a timed contact-grab.
      state.locked = gesture === "Closed_Fist";
      const stillTouching = this._raycastOrb() === state.grabbed;
      if (stillTouching || state.locked || pinch) {
        state.grabExpires = now + HOLD_MS; // refresh the timer
      }
      if (!state.locked && now > state.grabExpires) {
        this._release(state); // couple secs up, drift home
      }

      // Pinch while holding = open that memory.
      if (justPinched) this._openMemory(state.grabbed.userData.memory);

    } else {
      // ---- empty hand ----
      const hit = this._raycastOrb();
      this._setHover(state, hit);

      // Grab on contact.
      if (hit) this._grab(state, hit, now);

      // Pinch on empty hand over an orb still opens it (in case grab didn't take).
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
    // Only dim the old one if no OTHER hand is holding/hovering it.
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

  // Is some other hand already hovering/holding this orb? Stops one hand dimming
  // an orb the other hand still cares about.
  _claimedElsewhere(self, orb) {
    return this.handStates.some((s) => s && s !== self && (s.grabbed === orb || s.hovered === orb));
  }

  _grab(state, orb, now) {
    // Don't steal an orb another hand is already holding.
    if (this.handStates.some((s) => s && s !== state && s.grabbed === orb)) return;
    state.grabbed = orb;
    state.grabExpires = now + HOLD_MS;
    orb.userData.baseScale = 1.4;
  }

  _release(state) {
    if (state.grabbed) state.grabbed.userData.baseScale = 1;
    state.grabbed = null;
    state.locked = false;
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

  _driftHome() {
    const held = new Set(this.handStates.filter(Boolean).map((s) => s.grabbed));
    for (const orb of this.swarm.orbs) {
      if (held.has(orb)) continue;
      orb.position.lerp(orb.userData.homePosition, 0.02);
      if (orb.userData.label) {
        orb.userData.label.position.lerp(
          orb.userData.homePosition.clone().add(new THREE.Vector3(0, 1.6, 0)),
          0.02
        );
      }
    }
  }

  _openMemory(memory) {
    if (!memory) return;
    this.ui.showCard(memory);
    this.narrator.speak(`${memory.title}. ${memory.body}`);
  }

  // Build the bottom-right detection readout.
  _renderHud(hands) {
    if (hands.length === 0) {
      this.ui.setHud("no hands detected\n(point at the camera)");
      return;
    }
    const lines = [`hands: ${hands.length}`];
    hands.forEach((h, i) => {
      const s = this.handStates[i];
      const doing = s?.grabbed
        ? (s.locked ? "LOCKED grab" : "dragging")
        : (s?.hovered ? "hovering" : "—");
      const grabbedTitle = s?.grabbed?.userData?.memory?.title ?? "";
      lines.push(
        `H${i} ${h.handedness.padEnd(5)} ${h.gesture}`,
        `   pinch ${h.pinchDist.toFixed(2)} ${h.pinch ? "●CLOSED" : "○open"}`,
        `   x ${h.cursor.x.toFixed(2)}  y ${h.cursor.y.toFixed(2)}`,
        `   → ${doing}${grabbedTitle ? ": " + grabbedTitle : ""}`
      );
    });
    this.ui.setHud(lines.join("\n"));
  }
}
