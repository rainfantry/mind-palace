// ---------------------------------------------------------------------------
// agent.js — the local model link (Ollama).
//
// Sends a message + the current memory as context to your local qwen-code model
// and hands back the reply. Optionally reads the reply in your cloned voice.
//
// This is the seam where SERVITOR proper plugs in later — swap the fetch for the
// real SERVITOR/Hermes endpoint and keep ask() the same, everything upstream
// still works.
// ---------------------------------------------------------------------------

import { AGENT_CONFIG } from "./agent.config.js";

export class Agent {
  constructor(narrator) {
    this.narrator = narrator;
    this.cfg = { ...AGENT_CONFIG };
    this._ready = this._loadOverride();
  }

  // Optional gitignored override (js/agent.local.js) for machine-specific bits.
  async _loadOverride() {
    try {
      const mod = await import("./agent.local.js");
      if (mod?.AGENT_CONFIG) Object.assign(this.cfg, mod.AGENT_CONFIG);
    } catch {
      // no override, fine
    }
  }

  get enabled() { return this.cfg.enabled; }
  get modelName() { return this.cfg.model; }

  // Ask the model something about a memory. Returns the reply string.
  async ask(userText, memory) {
    await this._ready;

    const context = memory
      ? `MEMORY [${memory.title}] (${memory.date}): ${memory.body}\n\n`
      : "";

    const messages = [
      { role: "system", content: this.cfg.system },
      { role: "user", content: context + userText },
    ];

    const res = await fetch(`${this.cfg.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        stream: false,
        options: { temperature: this.cfg.temperature },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama ${res.status} — is 'ollama serve' up (with OLLAMA_ORIGINS=*) and '${this.cfg.model}' pulled?`);
    }

    const data = await res.json();
    const reply = data?.message?.content?.trim() || "(no reply)";
    // force:true — a deliberate reply cuts in over any memory being read
    if (this.cfg.speakReplies && this.narrator) this.narrator.speak(reply, { force: true });
    return reply;
  }
}
