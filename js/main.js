// ---------------------------------------------------------------------------
// main.js — the switchboard. START HERE.
//
// Builds each piece, introduces them, starts the loops. Read top to bottom and
// you've got the whole wiring diagram.
//
//   memories.js  -> load data (seed + local file + your saved edits)
//   scene.js     -> the 3D world
//   nodes.js     -> memories become orbs
//   graph.js     -> edges + the force sim (drag one, the web follows)
//   voice.js     -> reads memories aloud (your cloned voice if configured)
//   agent.js     -> talk to your local model about a memory
//   editor.js    -> add / edit / delete memories with the mouse
//   ui.js        -> the card, toolbar, status, readout
//   hands.js     -> webcam -> cursor + pinch + gestures (mouse fallback)
//   interaction  -> wires the hand to the orbs
// ---------------------------------------------------------------------------

import { loadMemories } from "./memories.js";
import { Stage } from "./scene.js";
import { MemorySwarm } from "./nodes.js";
import { Graph } from "./graph.js";
import { Narrator } from "./voice.js";
import { Agent } from "./agent.js";
import { Editor } from "./editor.js";
import { UI } from "./ui.js";
import { HandTracker } from "./hands.js";
import { Interaction } from "./interaction.js";

async function boot() {
  const narrator = new Narrator();
  const ui = new UI(narrator);
  ui.setStatus("loading your memories…");

  // 1. data
  let memories;
  try {
    memories = await loadMemories();
  } catch (err) {
    ui.setStatus(err.message);
    console.error(err);
    return;
  }

  // 2. world + orbs + the network
  const stage = new Stage(document.getElementById("scene"));
  const swarm = new MemorySwarm(stage);
  swarm.build(memories);
  const graph = new Graph(stage, swarm);
  stage.start();

  // 3. the brains: local model + the mouse editor, handed to the UI
  const agent = new Agent(narrator);
  const editor = new Editor(swarm, graph);
  ui.attach({ agent, editor, swarm });

  // 4. hands -> orbs
  const interaction = new Interaction(stage, swarm, narrator, ui);
  const tracker = new HandTracker(document.getElementById("webcam"), (frame) => interaction.update(frame));
  tracker.start((msg) => ui.setStatus(msg));
}

boot();
