// ---------------------------------------------------------------------------
// voice.js — read a memory out loud.
//
// Two engines, picked automatically:
//   1. ElevenLabs (YOUR cloned voice) — used IF js/voice.local.js exists and has
//      an apiKey + voiceId. That file is GITIGNORED; your key never hits GitHub.
//   2. Browser speech — fallback when there's no local config.
//
// ONCE PER SELECTION: while a voice loop is playing, plain speak() calls are
// ignored — opening/grabbing a memory won't restart or stack the audio. Pass
// { force:true } for deliberate replays (the ▶ read button, chat replies) which
// cut in and start fresh.
//
// >>> WHERE YOU CHANGE THE VOICE ID + API KEY <<<  js/voice.local.js
// ---------------------------------------------------------------------------

export class Narrator {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.cfg = null;
    this.audio = null;
    this.speaking = false;   // true while a voice loop is running

    this._pickBrowserVoice();
    this._ready = this._loadConfig();
  }

  async _loadConfig() {
    try {
      const mod = await import("./voice.local.js");
      if (mod?.VOICE_CONFIG?.apiKey && mod?.VOICE_CONFIG?.voiceId) {
        this.cfg = mod.VOICE_CONFIG;
        console.log("voice: ElevenLabs config found — using your cloned voice");
      }
    } catch {
      // browser voice it is
    }
  }

  _pickBrowserVoice() {
    if (!this.synth) return;
    const pick = () => {
      const voices = this.synth.getVoices();
      this.voice =
        voices.find((v) => /en-AU/i.test(v.lang)) ||
        voices.find((v) => /en-GB|en-US/i.test(v.lang)) ||
        voices[0] || null;
    };
    pick();
    this.synth.onvoiceschanged = pick;
  }

  // Say something. Guarded: ignored if already speaking, unless force:true.
  async speak(text, { force = false } = {}) {
    await this._ready;

    // the "once per selection until the loop finishes" rule
    if (this.speaking && !force) return;

    this.shutUp();          // clears any current loop + resets the flag
    this.speaking = true;

    if (this.cfg) {
      try {
        await this._speakEleven(text);
        return;
      } catch (err) {
        console.warn("EL voice cooked it, falling back to browser:", err);
      }
    }
    this._speakBrowser(text);
  }

  async _speakEleven(text) {
    const {
      apiKey, voiceId,
      stability = 0.2, similarity = 0.75, style = 0.75,
      speakerBoost = true, modelId = "eleven_multilingual_v2",
    } = this.cfg;

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability, similarity_boost: similarity, style, use_speaker_boost: speakerBoost,
        },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs ${res.status} — check key / voiceId / credits`);

    const url = URL.createObjectURL(await res.blob());
    this.audio = new Audio(url);
    // loop's done -> clear the flag so the next selection can speak
    this.audio.onended = () => { URL.revokeObjectURL(url); this.speaking = false; };
    this.audio.onerror = () => { this.speaking = false; };
    await this.audio.play();
  }

  _speakBrowser(text) {
    if (!this.synth) { this.speaking = false; return; }
    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) utter.voice = this.voice;
    utter.rate = 0.98;
    utter.pitch = 0.9;
    utter.onend = () => { this.speaking = false; };
    utter.onerror = () => { this.speaking = false; };
    this.synth.speak(utter);
  }

  // Shut up immediately, whichever engine's talking, and free the lock.
  shutUp() {
    if (this.synth) this.synth.cancel();
    if (this.audio) { this.audio.pause(); this.audio = null; }
    this.speaking = false;
  }
}
