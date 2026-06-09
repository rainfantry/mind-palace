# MIND PALACE — Agent Handoff

You're an AI agent (Hermes, Kimi, Qwen, Claude, whoever) picking this project up
with no memory of how it got here. This doc is everything you need to continue it
without breaking it. Read it fully before you touch a file.

## Who this is for / whose project this is

Owner: **George Wu** (GitHub `rainfantry`). Surveyor/programmer hybrid, Sydney.
This is his personal project. Treat all output as HIS work.

## The one rule that overrides everything

**BLACKOPS — no AI fingerprints, ever.** This is a public repo under George's name.
Do NOT add `Co-Authored-By`, "Generated with AI", "as an AI" comments, or any
LLM-tells in commits, code, comments, or docs. Commits are authored as George.
Everything reads as if he wrote it. No exceptions.

## Voice / style for code you write

- Comments in George's voice: blunt, Australian, a bit of mongrel, occasional
  swear — but **readable and professional** because it's a public repo
  (pub voice, not gutter voice). Look at the existing comments and match them.
- **Variable/function names stay clean and conventional.** Personality goes in
  comments, not identifiers. Keep the code maintainable.
- Direct, no corporate waffle. Show the reasoning in comments where it's non-obvious.

## What the project is

A gesture-driven 3D memory graph. Webcam → hands → grab floating memory orbs →
read them in George's cloned voice or talk to a local model about them. Full
design in `ARCHITECTURE.md`; build status + roadmap in `CODEPLAN.md`. The next
major piece is **Phase F: a 3D model of George's face that looks toward his
fingers** — deliberately saved for last because it's heavy.

## Stack / how to run

- Pure ES modules + CDN imports. **No build step, no npm.** Don't add one.
- three.js (`0.160.0`, pinned via importmap in `index.html`)
- MediaPipe Tasks Vision (gesture recognizer + wasm from CDN)
- ElevenLabs (cloned voice) and Ollama (local model) called over HTTP

Run it:
```bash
cd mind-palace
python -m http.server 8000   # or serve.bat on Windows
# open http://localhost:8000 in Chrome/Edge, allow camera
```
`file://` will NOT work (camera + module fetch need http).

## File layout

```
index.html                 entry + importmap + all the DOM
css/style.css              all styling
assets/demo.gif            the README animation
data/memories.json         public seed (safe — commit this)
data/memories.local.json   George's real archive (GITIGNORED — never commit)
js/main.js                 boot + wiring (START HERE)
js/memories.js             load/merge data (seed → local file → localStorage)
js/store.js                localStorage persistence
js/scene.js                three.js world + the wireframe force-sphere
js/nodes.js                orbs + labels, per-category colours
js/graph.js                edges + force sim (centre anchor + category grouping)
js/hands.js                webcam → cursor/pinch/spread/gesture (+ mouse fallback)
js/interaction.js          hands → orbs: grab/drag/brush/expand + nav
js/voice.js                TTS (EL clone / browser)
js/voice.local.js          EL key + voiceId (GITIGNORED)
js/voice.local.example.js  template for the above
js/agent.js                local-model chat (Ollama)
js/agent.config.js         local-model settings (no secret, committed)
js/agent.local.js          machine override: model + baseUrl (GITIGNORED)
js/editor.js               add/edit/delete memories
js/ui.js                   card/toolbar/chat/link-picker DOM controller
docs/                      these docs
```

## Secrets — do not leak

- `js/voice.local.js` holds George's ElevenLabs API key. It is gitignored. **Never
  commit it, never print its contents, never inline the key anywhere committed.**
- `data/memories.local.json` is his real personal history (built from his private
  neural map — trauma, the doctrine, etc). Gitignored. It NEVER goes to GitHub and
  its contents stay private. Do not echo it.
- `js/agent.local.js` holds his local-model override. Gitignored. Not a secret, but
  it stays local.
- Before any commit, run `git status` and confirm NO `*.local.*` file appears. The
  public seed (`data/memories.json`) is the only memory data that ships.

## Conventions you must keep

1. The swarm is the source of truth — each orb owns its memory in
   `orb.userData.memory`. Edit that, then `Store.save(...)`.
2. New secrets follow the `*.local.js` + dynamic-`import()` + gitignore pattern.
3. One job per module. Wiring goes in `main.js`.
4. Don't break the no-build-step constraint.

## Gesture model (current)

Set in `js/interaction.js`. If you change it, update this list.
- **point** (index out) → crosshair tracks the fingertip AND brushes/knocks orbs it
  passes (physics impulse from `_brush`, see `BRUSH_*` consts in interaction.js)
- **pinch + hold** (thumb + index) → grab + drag (pinned; cluster follows). A pinch
  shorter than `TAP_MS` with no drag = **select** (open + read)
- **two fingers** (index + middle V / `Victory`) on an orb → expand: card + read
- **open palm** + move → orbit the whole world group (`_orbit`)
- **two hands** → navigate: spread/close = zoom, move together = orbit, twist = roll
  (`_twoHandNav`). Single-hand node manipulation is suspended while two hands are up.
- thresholds in interaction.js: `TWO_FINGER_SPREAD` ~0.11, `TAP_MS` ~260,
  `BRUSH_RADIUS/PUSH/KNOCK`, `ORBIT_K` (single-hand), `ZOOM_K`, `NAV_ORBIT_K`
  (two-hand). Readout shows `pinch` / `spread` per hand for tuning.

## Layout model (graph.js)

Not a random cloud — it's structured:
- the **persona/subject node is pinned at the origin** (`Graph.center`) as the radial anchor
- **each category gets its own sector on the sphere** (`categoryAnchors`, fibonacci
  spread); nodes are pulled to their category zone, so like groups with like
- links (springs) + repulsion shape detail inside a group; grab/brush shoves a node,
  the sim re-settles it. Nodes live inside a faint wireframe **force sphere** (scene.js).
- tuning: `GROUP_RADIUS`, `GROUP_K`, `REPULSION`, `SPRING_K` in graph.js

## Current state (as of this handoff)

- Phases A–E complete and syntax-clean (`node --check --input-type=module` on each
  `js/*.js` passes).
- **Interaction:** pinch = grab/drag, quick pinch-tap = select, two-finger V = expand,
  fingertip **brushes/knocks** orbs it passes, open palm = orbit, **two hands = zoom +
  rotate + roll**.
- **Layout:** structured — persona pinned centre, categories grouped into sphere
  sectors, inside a wireframe force sphere. Per-category node colours.
- **Voice:** TTS locked to once-per-selection (`Narrator.speaking`); deliberate plays
  pass `{ force:true }`. Cloned voice via `voice.local.js` if present.
- **Editor:** add/edit/delete + searchable link picker (chips + dropdown) that draws edges.
- **Local model:** chat per memory via Ollama (`agent.js` / `agent.config.js`).
- **Data:** public seed ships safe milestones only; George's real graph (neural map,
  PALADIN excluded) lives in the gitignored `memories.local.json`.
- **Phase F (the watching face) NOT started** — that's the next job.
- Known rough edges are at the bottom of `CODEPLAN.md` (two-hand index swap, O(n²)
  repulsion, client-side EL key).

## If you're continuing the work

1. Read `ARCHITECTURE.md` + `CODEPLAN.md`.
2. Pick the next item (almost certainly Phase F1 — the billboard watching face).
3. Build it as its own module, wire it in `main.js`, keep comments in George's voice.
4. Syntax-check: `for f in js/*.js; do node --check --input-type=module < "$f"; done`
5. Commit as George, BLACKOPS, no AI attribution. Confirm no `*.local.*` staged.
6. Update `CODEPLAN.md` status when you finish a phase.

## How to reach the local model (so you can test the chat)

Ollama must allow the browser origin or it silently blocks:
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
ollama pull qwen2.5-coder
```
Model name + system prompt + temperature live in `js/agent.config.js`.
```
