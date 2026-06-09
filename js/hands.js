// ---------------------------------------------------------------------------
// hands.js — the webcam hand tracker + gesture reader.
//
// Upgraded from plain landmarks to MediaPipe's GESTURE RECOGNIZER. Same 21
// points per hand, but now it also names the shape your hand is making —
// Closed_Fist, Open_Palm, Pointing_Up, Thumb_Up, Victory, etc. And it tracks
// TWO hands so you can grab with both.
//
// Every frame it calls back with { hands: [...] }, one entry per hand seen:
//   {
//     cursor:    { x, y }   index fingertip in NDC (-1..1), or where you point
//     pinch:     bool       thumb + index touching
//     pinchDist: number     raw distance (for the readout / tuning)
//     gesture:   string      "Open_Palm" | "Closed_Fist" | "None" | ...
//     handedness:string      "Left" | "Right" (or "Mouse" in fallback)
//   }
// Empty array = nothing in view.
//
// No camera? Falls back to the mouse, one "hand", same shape — so it all still
// runs without you waving your arms about.
// ---------------------------------------------------------------------------

import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// Fixed by the model — don't touch.
const INDEX_TIP = 8;
const THUMB_TIP = 4;

// Pinch sensitivity. Bigger = easier to trigger, smaller = needs a tighter pinch.
const PINCH_THRESHOLD = 0.06;

// How many hands to track. Two so you can multi-select.
const MAX_HANDS = 2;

export class HandTracker {
  constructor(videoEl, onFrame) {
    this.video = videoEl;
    this.onFrame = onFrame;
    this.recognizer = null;
    this.lastVideoTime = -1;
  }

  async start(setStatus) {
    try {
      setStatus("loading gesture model…");
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      this.recognizer = await GestureRecognizer.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: MAX_HANDS,
      });

      setStatus("asking for the camera…");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      this.video.srcObject = stream;
      await this.video.play();

      setStatus("tracking live — two hands, gestures on");
      this._loop();
    } catch (err) {
      console.warn("tracking didn't start, mouse fallback:", err);
      setStatus("no camera — mouse fallback (move = point, hold click = pinch)");
      this._startMouse();
    }
  }

  _loop() {
    const tick = () => {
      if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
        this.lastVideoTime = this.video.currentTime;
        const res = this.recognizer.recognizeForVideo(this.video, performance.now());
        this.onFrame({ hands: this._readHands(res) });
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // Turn the raw MediaPipe result into our tidy per-hand list.
  _readHands(res) {
    const out = [];
    const allLandmarks = res.landmarks || [];

    for (let i = 0; i < allLandmarks.length; i++) {
      const hand = allLandmarks[i];
      const tip = hand[INDEX_TIP];
      const thumb = hand[THUMB_TIP];

      // Mirror x (webcam shown like a mirror), flip y so up is up. NDC -1..1.
      const cursor = { x: 1 - 2 * tip.x, y: 1 - 2 * tip.y };

      const pinchDist = Math.hypot(tip.x - thumb.x, tip.y - thumb.y);
      const pinch = pinchDist < PINCH_THRESHOLD;

      // gestures/handednesses are arrays-of-arrays, top candidate is [0].
      const gesture = res.gestures?.[i]?.[0]?.categoryName ?? "None";
      const handedness = res.handednesses?.[i]?.[0]?.categoryName ?? "?";

      out.push({ cursor, pinch, pinchDist, gesture, handedness });
    }
    return out;
  }

  // Mouse stand-in so the thing's testable with no webcam.
  _startMouse() {
    let pinching = false;
    const emit = (e) => {
      const cursor = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
      this.onFrame({
        hands: [{
          cursor,
          pinch: pinching,
          pinchDist: pinching ? 0 : 1,
          gesture: pinching ? "Pinch(mouse)" : "None",
          handedness: "Mouse",
        }],
      });
    };
    window.addEventListener("mousemove", emit);
    window.addEventListener("mousedown", (e) => { pinching = true; emit(e); });
    window.addEventListener("mouseup", (e) => { pinching = false; emit(e); });
  }
}
