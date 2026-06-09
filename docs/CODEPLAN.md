# MIND PALACE — Code Plan

Build order and status. Phases A–E are done; F (the face) is the big one, saved
for last on purpose.

## Done

### Phase A — the spine ✅
- three.js scene, webcam, MediaPipe hand landmarks
- memories as floating orbs on a helix
- point / pinch / contact-grab / open, with a mouse fallback
- read memories aloud (browser voice)

### Phase B — two hands + gestures ✅
- swapped HandLandmarker → GestureRecognizer (fist, open palm, point, …)
- two-hand tracking = multi-select
- contact-grab with a ~2s hold; fist locks; open palm drops
- bottom-right live detection readout

### Phase C — the cloned voice ✅
- ElevenLabs playback in `voice.js`, keyed from gitignored `voice.local.js`
- graceful fallback to browser speech when no key

### Phase D — the network ✅
- memories gained `links`; edges render as glowing lines
- `graph.js` force sim: springs + repulsion + centering
- grabbing pins an orb; dragging stretches its linked cluster on elastic

### Phase E — editor + local model ✅
- mouse editor: add / edit / delete memories, edit links, export JSON
- edits persist to localStorage and merge on top of seed + local file
- `agent.js`: talk to a local Ollama model (qwen-code) about a memory,
  config in `agent.config.js`, reply optionally read in the cloned voice

## Next

### Phase F — the watching face (HEFTY, do last)
Goal: a 3D model of George's face that looks toward the active fingertip(s).

Tiered so we get the *feeling* before the *fidelity*:

- **F1 — billboard (cheap, ~1 session).** Put a LoRA-rendered face on a plane in
  the scene; tilt/parallax it toward the active hand's cursor. Reads as "watching"
  without true 3D. Good enough to feel it.
- **F2 — rigged 3D head.** Load a GLTF head; `head.lookAt(fingertipWorldPos)` so
  eyes/head track the hand in real 3D. Use a stock head or a generated one.
- **F3 — the real twin.** Image-to-3D from LoRA renders (TripoSR / Hunyuan3D /
  Luma on RunPod) → textured 3D head of George → rig eyes → track hands. Later,
  MediaPipe Face Landmarker can drive its expression off his real face.

Recommended: ship F1, live with it, only climb to F2/F3 when it earns the RunPod
time.

### Later
- Lay orbs out by *meaning* (embed memories, cluster) instead of just date.
- Two-handed zoom/rotate of the whole graph.
- The RADON "work wing" — same gesture+3D UI driving a real survey model.
- Swap `agent.js`'s Ollama call for the real SERVITOR/Hermes endpoint.

## Known rough edges
- MediaPipe can swap hand 0/1 ordering frame-to-frame when both hands are up →
  two-hand grabs can flicker. Fix: key hand state by handedness (Left/Right),
  not array index.
- Force sim is O(n²) repulsion — fine for tens of nodes, not hundreds. Swap for a
  spatial grid if the graph ever gets big.
- ElevenLabs key sits in client JS — local-only safe; move behind a proxy if ever
  hosted.
