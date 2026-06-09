// ---------------------------------------------------------------------------
// voice.js — read a memory out loud.
//
// Two engines, picked automatically:
//   1. ElevenLabs (YOUR cloned voice) — used IF js/voice.local.js exists and has
//      an apiKey + voiceId. That file is GITIGNORED; your key never hits GitHub.
//   2. Browser speech — the fallback when there's no local config. Free, instant,
//      not your voice.
//
// >>> WHERE YOU CHANGE THE VOICE ID + API KEY <<<
//      js/voice.local.js   (copy it from js/voice.local.example.js)
// Nothing in the committed code holds a key. Keep it that way.
// ---------------------------------------------------------------------------

export class Narrator {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voice = null;       // chosen browser voice
    this.cfg = null;         // ElevenLabs config, once loaded
    this.audio = null;       // current EL audio element (so we can stop it)

    this._pickBrowserVoice();
    this._ready = this._loadConfig(); // kick the local config load off straight away
  }

  // Try to pull js/voice.local.js. Missing = totally normal, just means browser voice.
  async _loadConfig() {
    try {
      const mod = await import("./voice.local.js");
      if (mod?.VOICE_CONFIG?.apiKey && mod?.VOICE_CONFIG?.voiceId) {
        this.cfg = mod.VOICE_CONFIG;
        console.log("voice: ElevenLabs config found — using your cloned voice");
      }
    } catch {
      // no local config, no dramas — falls through to browser speech
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

  // Say something. Cuts off whatever's already talking first.
  async speak(text) {
    await this._ready;
    this.shutUp();

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

  // ElevenLabs — POST the text, get MP3 back, play it.
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
          stability,
          similarity_boost: similarity,
          style,
          use_speaker_boost: speakerBoost,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs ${res.status} — check key / voiceId / credits`);
    }

    const url = URL.createObjectURL(await res.blob());
    this.audio = new Audio(url);
    this.audio.onended = () => URL.revokeObjectURL(url);
    await this.audio.play();
  }

  _speakBrowser(text) {
    if (!this.synth) {
      console.warn("no speech synth in this browser — staying silent");
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) utter.voice = this.voice;
    utter.rate = 0.98;
    utter.pitch = 0.9;
    this.synth.speak(utter);
  }

  // Shut up immediately, whichever engine's talking.
  shutUp() {
    if (this.synth) this.synth.cancel();
    if (this.audio) { this.audio.pause(); this.audio = null; }
  }
}
