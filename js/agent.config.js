// ---------------------------------------------------------------------------
// agent.config.js — talk-to-your-local-model settings.
//
// This drives the "💬 talk" box on a memory. It hits your LOCAL Ollama — no API
// key, nothing leaves your machine, so this file is safe to commit. Edit it to
// point at whatever local model you're running.
//
// >>> CORS GOTCHA (read this or it'll just silently fail) <<<
// Ollama blocks browser requests from other origins by default. Before you start
// it, allow this page:
//     Windows (PowerShell):  $env:OLLAMA_ORIGINS="*"; ollama serve
// then pull the model once:  ollama pull qwen2.5-coder
//
// Want machine-specific overrides without touching this file? Make
// js/agent.local.js exporting AGENT_CONFIG — it's gitignored and wins.
// ---------------------------------------------------------------------------

export const AGENT_CONFIG = {
  enabled: true,

  baseUrl: "http://localhost:11434",   // default Ollama port
  model:   "qwen2.5-coder",            // your qwen-code local model — change to taste

  // How the palace talks back. This is SERVITOR's head.
  system: "You are SERVITOR, George's machine spirit. Blunt, Australian, profane when it fits, always useful. You're handed one of his memories as context — riff on it, answer his question about it, no corporate waffle. Keep it tight.",

  temperature: 0.6,
  speakReplies: true,   // read the model's answer back in your cloned voice too
};
