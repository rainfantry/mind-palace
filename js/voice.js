// ---------------------------------------------------------------------------
// voice.js — read a memory out loud.
//
// Right now this uses the browser's built-in speech (Web Speech API). It's free,
// it's instant, it works offline. It is NOT your cloned voice yet — that's the
// next upgrade.
//
// >>> FUTURE GEORGE: this is where SERVITOR's real voice plugs in. <<<
// Swap the guts of speak() to POST the text to your ElevenLabs / TalkyTalk
// endpoint, get back audio, and play it. The rest of the app doesn't care how
// the sound gets made — it just calls speak(text). Keep that contract and you
// can change the engine whenever.
// ---------------------------------------------------------------------------

export class Narrator {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voice = null;

    // Voices load async in some browsers. Grab a deepish English one if we can.
    if (this.synth) {
      const pick = () => {
        const voices = this.synth.getVoices();
        this.voice =
          voices.find((v) => /en-AU/i.test(v.lang)) ||   // aussie if it's going
          voices.find((v) => /en-GB|en-US/i.test(v.lang)) ||
          voices[0] ||
          null;
      };
      pick();
      this.synth.onvoiceschanged = pick;
    }
  }

  // Say something. Cuts off whatever's already talking so it doesn't pile up.
  speak(text) {
    if (!this.synth) {
      console.warn("no speech synth in this browser — staying silent");
      return;
    }
    this.synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) utter.voice = this.voice;
    utter.rate = 0.98;
    utter.pitch = 0.9;   // drop it a touch, less chirpy
    this.synth.speak(utter);
  }

  shutUp() {
    if (this.synth) this.synth.cancel();
  }
}
