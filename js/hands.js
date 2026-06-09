// ---------------------------------------------------------------------------
// hands.js — the webcam hand tracker.
//
// This is the Jarvis bit. MediaPipe watches the webcam, finds your hand, gives
// us 21 points. We care about two of them: the index fingertip (where you're
// pointing) and the thumb tip (to measure a pinch).
//
// Every frame it calls back with { cursor, pinch }:
//   cursor = { x, y } in normalised device coords (-1..1), or null if no hand
//   pinch  = true when thumb and index are touching
//
// If the camera's blocked or there's no hand, it quietly falls back to the
// MOUSE so you can still test the 3D without waving your arms around like a
// lunatic. Move mouse = point, hold left button = pinch.
// ---------------------------------------------------------------------------

import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// MediaPipe landmark indices — these are fixed by the model, don't change them.
const INDEX_TIP = 8;
const THUMB_TIP = 4;

// How close thumb and index have to get (in normalised image space) to count as
// a pinch. Bump it up if pinches aren't registering, down if it's too twitchy.
const PINCH_THRESHOLD = 0.06;

export class HandTracker {
  constructor(videoEl, onFrame) {
    this.video = videoEl;
    this.onFrame = onFrame;        // we call this every frame with the cursor + pinch
    this.landmarker = null;
    this.usingMouse = false;
    this.lastVideoTime = -1;
  }

  // Try to get the camera + model going. If anything's cooked, fall back to mouse.
  async start(setStatus) {
    try {
      setStatus("loading hand model…");
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      setStatus("asking for the camera…");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      this.video.srcObject = stream;
      await this.video.play();

      setStatus("hand tracking live — wave at it");
      this._loopHands();
    } catch (err) {
      // No camera, blocked permission, served over file:// — whatever. Don't die.
      console.warn("hand tracking didn't start, falling back to mouse:", err);
      setStatus("no camera — mouse fallback (move = point, hold click = pinch)");
      this._startMouse();
    }
  }

  // The real loop: read the webcam frame, run the model, work out cursor + pinch.
  _loopHands() {
    const tick = () => {
      // Only run the model on fresh frames, no point chewing GPU on the same one.
      if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
        this.lastVideoTime = this.video.currentTime;
        const result = this.landmarker.detectForVideo(this.video, performance.now());

        if (result.landmarks && result.landmarks.length > 0) {
          const hand = result.landmarks[0];
          this.onFrame(this._readHand(hand));
        } else {
          // hand left the frame — tell the world there's no cursor
          this.onFrame({ cursor: null, pinch: false });
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // Convert one hand's landmarks into a cursor + pinch.
  _readHand(hand) {
    const tip = hand[INDEX_TIP];
    const thumb = hand[THUMB_TIP];

    // The webcam is shown mirrored (like a real mirror), so we mirror x to match.
    // lm.x and lm.y come in 0..1 with origin top-left. NDC wants -1..1 with y up.
    const cursor = {
      x: 1 - 2 * tip.x,   // mirrored
      y: 1 - 2 * tip.y,   // flipped so up is up
    };

    // Pinch = thumb tip and index tip basically touching. Straight 2D distance
    // in normalised space is plenty for this.
    const dx = tip.x - thumb.x;
    const dy = tip.y - thumb.y;
    const pinch = Math.hypot(dx, dy) < PINCH_THRESHOLD;

    return { cursor, pinch };
  }

  // Mouse fallback so the thing's testable without a webcam.
  _startMouse() {
    this.usingMouse = true;
    let pinching = false;

    window.addEventListener("mousemove", (e) => {
      const cursor = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
      this.onFrame({ cursor, pinch: pinching });
    });
    window.addEventListener("mousedown", () => { pinching = true; });
    window.addEventListener("mouseup", () => { pinching = false; });
  }
}
