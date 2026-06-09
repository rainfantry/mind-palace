// ---------------------------------------------------------------------------
// hands.js — the webcam hand tracker + gesture reader.
//
// MediaPipe Gesture Recognizer. Per hand we read THREE things off the landmarks:
//   - cursor    : where the index fingertip points (NDC -1..1)
//   - pinch     : thumb tip ↔ index tip close together  (drives DRAG)
//   - spread    : index tip ↔ MIDDLE tip apart          (drives EXPAND/read)
// plus the named gesture (Victory, Open_Palm, …).
//
// Pinch and spread live on different finger pairs on purpose, so they never get
// confused: thumb+index = grab, two-finger V = open. Tracks two hands.
//
// No camera? Falls back to the mouse: move = point, hold left = pinch/drag,
// right-click = the open/expand.
// ---------------------------------------------------------------------------

import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// Landmark indices — fixed by the model.
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;

const PINCH_THRESHOLD = 0.06; // thumb↔index under this = pinching
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

      setStatus("tracking live — pinch to drag, two-finger V to open");
      this._loop();
    } catch (err) {
      console.warn("tracking didn't start, mouse fallback:", err);
      setStatus("no camera — mouse fallback (move=point, hold-left=drag, right-click=open)");
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

  _readHands(res) {
    const out = [];
    const allLandmarks = res.landmarks || [];

    for (let i = 0; i < allLandmarks.length; i++) {
      const hand = allLandmarks[i];
      const indexTip = hand[INDEX_TIP];
      const thumbTip = hand[THUMB_TIP];
      const middleTip = hand[MIDDLE_TIP];

      // Mirror x (webcam shown like a mirror), flip y so up is up. NDC -1..1.
      const cursor = { x: 1 - 2 * indexTip.x, y: 1 - 2 * indexTip.y };

      // thumb ↔ index = pinch (drag)
      const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
      const pinch = pinchDist < PINCH_THRESHOLD;

      // index ↔ middle = the two-finger spread (open / expand)
      const spreadDist = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);

      const gesture = res.gestures?.[i]?.[0]?.categoryName ?? "None";
      const handedness = res.handednesses?.[i]?.[0]?.categoryName ?? "?";

      out.push({ cursor, pinch, pinchDist, spreadDist, gesture, handedness });
    }
    return out;
  }

  // Mouse stand-in. Left-drag = pinch, right-click = the open gesture.
  _startMouse() {
    let pinching = false;
    let last = { x: 0, y: 0 };
    const ndc = (e) => ({
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -((e.clientY / window.innerHeight) * 2 - 1),
    });
    const emit = (gesture = "None") => {
      this.onFrame({
        hands: [{
          cursor: last,
          pinch: pinching,
          pinchDist: pinching ? 0 : 1,
          spreadDist: 0,
          gesture,
          handedness: "Mouse",
        }],
      });
    };
    window.addEventListener("mousemove", (e) => { last = ndc(e); emit(); });
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) { pinching = true; emit(); }
      else if (e.button === 2) { emit("Victory"); } // right-click = open/expand
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) { pinching = false; emit(); } });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}
