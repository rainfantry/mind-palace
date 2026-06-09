// ---------------------------------------------------------------------------
// interaction.js — where the hand meets the memories.
//
// Takes the cursor + pinch coming out of hands.js and turns it into actual
// behaviour:
//   - point at an orb        -> it lights up (hover)
//   - pinch on an orb        -> grab it, drag it around
//   - quick pinch + release   -> open the memory card
//   - pinch and hold + move   -> just moving it about
//
// It also drives the on-screen crosshair and the memory card panel. This is the
// glue file — it's allowed to know about a few things at once. Everything else
// stays in its lane; this is the lane-changer.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// If a pinch lasts longer than this (ms) we treat it as a DRAG, not a CLICK.
// Short tap = open the memory. Hold = move it.
const CLICK_MAX_MS = 280;

export class Interaction {
  constructor(stage, swarm, narrator, ui) {
    this.stage = stage;
    this.swarm = swarm;
    this.narrator = narrator;
    this.ui = ui;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();   // current cursor in NDC
    this.hasCursor = false;

    this.hovered = null;   // orb under the cursor right now
    this.grabbed = null;   // orb we're currently holding
    this.wasPinching = false;
    this.pinchStart = 0;

    this.cursorEl = document.getElementById("cursor");

    // Drift released orbs back toward home so the swarm doesn't end up a mess.
    this.stage.onTick(() => this._driftHome());
  }

  // Called every frame by hands.js with the latest cursor + pinch state.
  update({ cursor, pinch }) {
    if (!cursor) {
      this.hasCursor = false;
      this.cursorEl.style.opacity = "0";
      this._setHover(null);
      return;
    }

    this.hasCursor = true;
    this.pointer.set(cursor.x, cursor.y);
    this._moveCrosshair(cursor, pinch);

    // Pinch edge detection — did we just start or just release a pinch?
    const justPinched = pinch && !this.wasPinching;
    const justReleased = !pinch && this.wasPinching;

    if (justPinched) this._onPinchStart();
    if (justReleased) this._onPinchRelease();

    // If we're holding something, drag it. Otherwise just update the hover.
    if (this.grabbed) {
      this._dragGrabbed();
    } else {
      this._updateHover();
    }

    this.wasPinching = pinch;
  }

  // Move the DOM crosshair to follow the fingertip. cursor is in NDC (-1..1).
  _moveCrosshair(cursor, pinch) {
    const x = (cursor.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-cursor.y * 0.5 + 0.5) * window.innerHeight;
    this.cursorEl.style.opacity = "1";
    this.cursorEl.style.transform = `translate(${x}px, ${y}px)`;
    this.cursorEl.classList.toggle("pinch", pinch);
  }

  // Fire a ray from the camera through the cursor and see what orb it hits.
  _raycastOrb() {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    const hits = this.raycaster.intersectObjects(this.swarm.orbs, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  _updateHover() {
    this._setHover(this._raycastOrb());
  }

  // Light up the hovered orb, dim the last one.
  _setHover(orb) {
    if (this.hovered === orb) return;

    if (this.hovered) {
      this.hovered.material.emissiveIntensity = 0.6;
      this.hovered.userData.baseScale = 1;
    }
    this.hovered = orb;
    if (orb) {
      orb.material.emissiveIntensity = 1.4;
      orb.userData.baseScale = 1.25;
    }
  }

  _onPinchStart() {
    this.pinchStart = performance.now();
    // Grab whatever we're hovering (if anything).
    const orb = this._raycastOrb();
    if (orb) {
      this.grabbed = orb;
      orb.userData.baseScale = 1.4;
    }
  }

  _onPinchRelease() {
    const held = performance.now() - this.pinchStart;
    const orb = this.grabbed;
    this.grabbed = null;

    if (!orb) return;
    orb.userData.baseScale = 1;

    // Short pinch on an orb = a click = open the memory. Long pinch = you were
    // just dragging it, leave it be.
    if (held < CLICK_MAX_MS) {
      this._openMemory(orb.userData.memory);
    }
  }

  // Drag the grabbed orb so it sits under the cursor, on a plane at its own depth.
  _dragGrabbed() {
    // Build a plane facing the camera, passing through the orb's current depth,
    // then find where the ray hits it. That's the new home for the orb.
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);

    const camDir = new THREE.Vector3();
    this.stage.camera.getWorldDirection(camDir);

    // world-space position of the orb (it lives inside the rotating world group)
    const orbWorld = new THREE.Vector3();
    this.grabbed.getWorldPosition(orbWorld);

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, orbWorld);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hit)) {
      // convert the world-space hit back into the rotating group's local space
      this.stage.world.worldToLocal(hit);
      this.grabbed.position.copy(hit);
    }
  }

  // Ease released orbs back toward where they belong. Gentle, not snappy.
  _driftHome() {
    for (const orb of this.swarm.orbs) {
      if (orb === this.grabbed) continue;
      const home = orb.userData.homePosition;
      orb.position.lerp(home, 0.02);
      if (orb.userData.label) {
        orb.userData.label.position.lerp(
          home.clone().add(new THREE.Vector3(0, 1.6, 0)),
          0.02
        );
      }
    }
  }

  // Pop the memory card and read it out.
  _openMemory(memory) {
    if (!memory) return;
    this.ui.showCard(memory);
    this.narrator.speak(`${memory.title}. ${memory.body}`);
  }
}
