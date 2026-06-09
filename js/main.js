// ---------------------------------------------------------------------------
// main.js — the switchboard. START HERE.
//
// This file does the introductions and gets out of the way. It builds each
// piece, hands them to each other, and starts the loops. If you want to follow
// how the whole thing hangs together, read top to bottom — it's in order.
//
//   memories.js  -> loads the data
//   scene.js     -> the 3D world
//   nodes.js     -> turns memories into floating orbs
//   voice.js     -> reads them out loud
//   ui.js        -> the side card + status line
//   hands.js     -> the webcam → cursor + pinch
//   interaction  -> wires the hand to the orbs
// ---------------------------------------------------------------------------

import { loadMemories } from "./memories.js";
import { Stage } from "./scene.js";
import { MemorySwarm } from "./nodes.js";
import { Narrator } from "./voice.js";
import { UI } from "./ui.js";
import { HandTracker } from "./hands.js";
import { Interaction } from "./interaction.js";

async function boot() {
  const narrator = new Narrator();
  const ui = new UI(narrator);

  ui.setStatus("loading your memories…");

  // 1. Get the data. If this throws it's almost always the file:// problem.
  let memories;
  try {
    memories = await loadMemories();
  } catch (err) {
    ui.setStatus(err.message);
    console.error(err);
    return; // nothing to show without data, bail cleanly
  }

  // 2. Build the world and fill it with orbs.
  const canvas = document.getElementById("scene");
  const stage = new Stage(canvas);
  const swarm = new MemorySwarm(stage);
  swarm.build(memories);
  stage.start();

  // 3. Wire the hand to the orbs.
  const interaction = new Interaction(stage, swarm, narrator, ui);

  // 4. Fire up the webcam tracker. Every frame it feeds the interaction layer.
  //    Falls back to mouse on its own if there's no camera — see hands.js.
  const video = document.getElementById("webcam");
  const tracker = new HandTracker(video, (frame) => interaction.update(frame));
  tracker.start((msg) => ui.setStatus(msg));
}

// Go.
boot();
