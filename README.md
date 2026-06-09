# MIND PALACE

A gesture-driven memory twin. You wave your hand at the webcam, reach into a
constellation of your own memories floating in 3D, grab one out of the air, and
it gets read back to you. No mouse, no keyboard — just your hand and the ghost.

Built as the body for a pile of fragments I'd made one at a time: a face (SDXL
LoRA), a voice (ElevenLabs clone), an agent (SERVITOR), a memory (a stack of
files). On their own they're organs. This is the thing that puts them in one room
and gives them hands you can reach into.

## What it actually does right now

Tracks **two hands** off a plain webcam and reads **gestures** (MediaPipe Gesture
Recognizer — fist, open palm, point, etc). Controls:

| Do this | Get this |
|---------|----------|
| **Point** (index finger) | crosshair tracks your fingertip |
| **Touch an orb** | grabs on contact, drags with your finger, holds ~2s |
| **Closed fist** | locks the grab — drag as long as you like, no timeout |
| **Pinch** (thumb + index) | opens the memory — card slides in, read aloud |
| **Open palm** | drops whatever that hand's holding |
| **Two hands** | two cursors = grab two orbs at once (multi-select) |

Bottom-right is a live **detection readout** — per hand it shows handedness,
gesture, pinch distance, fingertip coords, and what it's currently doing. That's
your window into what the tracker actually sees.

**No camera? No dramas.** Falls back to the mouse automatically: move to point,
hold left-click to pinch. So you can work on the 3D without waving your arms about.

## Run it

The webcam needs a real server — opening the file straight off disk (`file://`)
won't let the browser touch the camera. So serve it:

```bash
# from the mind-palace folder
python -m http.server 8000
```

Then open **http://localhost:8000** in Chrome or Edge. Allow the camera. Wave.

(On Windows you can just double-click `serve.bat`.)

## Add your own memories

Memories live in `data/memories.json`. Each one is dead simple:

```json
{
  "id": "some-unique-id",
  "date": "2026-06",
  "title": "Short title",
  "body": "The longer story that gets read out when you open it.",
  "tag": "milestone"
}
```

`tag` is just colour-coding — `milestone` (gold) or `build` (cyan) for now.

### The private archive

`data/memories.json` is the **public** seed — safe stuff, the wins, the builds.
The real history — the heavy years — goes in `data/memories.local.json`, which is
**gitignored and never leaves your machine**. Same format. If a node in there
shares an `id` with the public one, the local version wins. Make that file, fill
it with whatever's actually yours, and it loads over the top automatically.

## How it's wired (for when I come back to this)

Start at `js/main.js` — it's the switchboard, reads top to bottom in order.
Everything else does exactly one job and says what it does at the top:

| File | Job |
|------|-----|
| `js/main.js` | boots everything, introduces the pieces |
| `js/memories.js` | loads the data (public seed + local override) |
| `js/scene.js` | the three.js world — camera, lights, render loop |
| `js/nodes.js` | turns memories into floating orbs on a helix |
| `js/hands.js` | webcam → cursor + pinch (with mouse fallback) |
| `js/interaction.js` | the glue — hand meets orbs, grab/drag/open |
| `js/voice.js` | reads a memory out loud |
| `js/ui.js` | the side card + status line |

## The network, the editor, the talk

- **It's a graph now.** Memories have `links` and float as a connected web —
  edges drawn as glowing lines, laid out by a force sim. Grab one orb and its
  linked cluster gets dragged along on elastic.
- **Edit with the mouse.** `＋ memory` (top-left) adds a node; open any memory and
  hit `✎ edit` to change its title/body/tag/links; `⤓ export` copies the whole lot
  as JSON for `data/memories.local.json`. Edits save to your browser automatically.
- **Talk to it.** Open a memory, hit `💬 talk`, and chat to your **local model**
  (Ollama, qwen-code) about it — replies come back in your cloned voice. Settings
  in `js/agent.config.js`. Heads-up: start Ollama with `OLLAMA_ORIGINS=*` or the
  browser gets blocked.

## Docs

- `docs/ARCHITECTURE.md` — how it's built and why
- `docs/CODEPLAN.md` — build phases + what's next (the 3D face is Phase F)
- `docs/HANDOFF.md` — pick-up guide for an AI agent / a different model

## Where it's going

- [x] **Cloned voice** — `js/voice.local.js` (gitignored).
- [x] **The network** — links, edges, force-directed drag.
- [x] **Mouse editor** — add/edit/delete/export memories.
- [x] **Local model chat** — talk to qwen-code about a memory.
- [ ] **The watching face (Phase F)** — a 3D model of my face that looks toward my
  fingers. The hefty one, saved for last. See `docs/CODEPLAN.md`.
- [ ] Lay orbs out by **meaning** (embeddings) instead of date.
- [ ] Point it at **survey data** — same interface, real 3D site model. The one that pays.

## Stack

three.js · MediaPipe Tasks Vision (hand landmarker) · Web Speech API · vanilla JS,
no build step. Just files. The way it should be.
