// ---------------------------------------------------------------------------
// voice.local.example.js — the template.
//
// COPY this file to `voice.local.js` (same folder) and put your real values in.
// `voice.local.js` is GITIGNORED — it never gets committed, your key stays on
// your machine.
//
// >>> THIS is where you change the voice ID and API key. <<<
//
// WARNING: ElevenLabs called straight from the browser exposes the key to anyone
// who can open the running page. That's FINE for local-only use (just you, on
// localhost). If you ever HOST this thing, move the key behind a tiny backend
// proxy instead — never ship a key in client JS on the open web.
// ---------------------------------------------------------------------------

export const VOICE_CONFIG = {
  apiKey:  "sk_your_elevenlabs_key_here",
  voiceId: "your_voice_id_here",      // your cloned-voice ID (the GEORGE one)

  // tuning — same dials as your mrrobot EL setup
  stability:    0.20,
  similarity:   0.75,
  style:        0.75,
  speakerBoost: true,
  modelId:      "eleven_multilingual_v2",
};
