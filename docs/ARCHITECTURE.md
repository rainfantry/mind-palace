# MIND PALACE — Architecture

The big picture of how the thing's built and why. For the build order and what's
next, see `CODEPLAN.md`. For picking the project up cold (e.g. a different model
or agent), see `HANDOFF.md`.

## What it is

A gesture-driven 3D interface to a personal memory graph. Webcam tracks your
hands, memories float as a connected network of orbs, you reach in and grab them,
and they read back in your cloned voice — or you talk to a local model about
them. The long game: the single body that all the separate "twin" pieces (face
clone, voice clone, agent, memory) plug into.

## Design rules

1. **No build step.** Plain ES modules + CDN imports. You serve the folder and it
   runs. No npm, no bundler, no transpile. Keep it that way unless there's a very
   good reason.
2. **One job per file.** Every module does one thing and says so at the top. The
   glue lives in `main.js` (boot) and `interaction.js` (hand↔orbs).
3. **The swarm is the source of truth.** Each orb carries its memory in
   `orb.userData.memory`. Persisting = dump every orb's memory. No parallel list
   to drift out of sync.
4. **Secrets never get committed.** Keys live in gitignored `*.local.js` files,
   loaded by dynamic `import()` with a graceful fallback when absent.
5. **Layered data.** Public seed → local archive → browser edits, each overriding
   the last by id.

## Module map

```
main.js          boot + wiring. START HERE.
memories.js      load data (3 layers: seed / local file / localStorage)
store.js         localStorage read/write/export for edits
scene.js         three.js world: camera, lights, stars, render loop
nodes.js         memories -> glowing orbs + labels (+ add/remove/refresh hooks)
graph.js         edges + force simulation (springs/repulsion/centering)
hands.js         webcam -> {cursor, pinch, gesture} per hand (mouse fallback)
interaction.js   hand state -> hover / contact-grab / drag / open
voice.js         read memories aloud (ElevenLabs clone if configured, else browser)
agent.js         talk to local model (Ollama) about a memory
agent.config.js  local-model settings (no secret, committed)
editor.js        add/edit/delete memories (verbs only)
ui.js            the card (view/edit/talk), toolbar, status, readout (DOM controller)
```

## Data model

A memory node:

```json
{
  "id": "servitor",
  "date": "2026-05",
  "title": "SERVITOR woke up",
  "body": "…read aloud when opened…",
  "tag": "milestone | build",
  "links": ["voice-clone", "node-twin"]
}
```

`links` are undirected edges — list a pair once, it still draws. `tag` drives
colour. `date` drives sort order and the initial helix spread.

## Runtime flow

1. `boot()` loads + merges memories.
2. `Stage` makes the 3D world; `MemorySwarm` spawns an orb per memory.
3. `Graph` reads each orb's `links`, builds edge lines, and runs a force sim every
   frame: springs pull linked orbs together, repulsion spreads them, a weak centre
   pull keeps it bounded.
4. `HandTracker` feeds `{hands:[…]}` every frame to `Interaction`.
5. **Pinching** an orb sets `orb.userData.pinned = true`; the sim leaves pinned orbs
   where the finger puts them, so dragging one stretches its linked cluster on
   elastic. Release the pinch to drop it.
6. **Opening your fingers** on an orb expands it → `UI.showCard` → read aloud
   (`Narrator`, locked to once per selection) and/or `Agent.ask`.
7. Edits go through `Editor` → mutate the orb's memory → `Store.save`.

## The combination (where the rest of George's work plugs in)

| Asset | Role | State |
|-------|------|-------|
| memory graph | nervous system / substrate | **built** |
| EL voice clone | the mouth | **wired** (voice.js) |
| local model / SERVITOR | the mind | **wired** (agent.js, Ollama) |
| LoRA / 3D face | the watching presence | **planned** (CODEPLAN phase F) |
| neural-net-of-self | temperament driving the face/agent | future |
| RADON tools | the "work wing" — survey data in the same UI | future |

The point: stop building organs in separate repos. This is the body they attach
to. One data model, one interface (gesture + voice + face), every asset a module.
```
