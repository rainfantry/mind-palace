// ---------------------------------------------------------------------------
// ui.js — the memory card panel and the status line.
//
// Plain DOM, no framework. It just shows/hides the card and fills it in. Kept
// separate from interaction.js so the 3D logic doesn't get tangled up with
// button wiring.
// ---------------------------------------------------------------------------

export class UI {
  constructor(narrator) {
    this.narrator = narrator;

    this.card = document.getElementById("memory-card");
    this.cardDate = document.getElementById("card-date");
    this.cardTitle = document.getElementById("card-title");
    this.cardBody = document.getElementById("card-body");
    this.statusEl = document.getElementById("status");
    this.hudEl = document.getElementById("hud");

    this.current = null; // the memory currently shown

    // Wire the card buttons once.
    document.getElementById("card-close").addEventListener("click", () => this.hideCard());
    document.getElementById("card-speak").addEventListener("click", () => {
      if (this.current) this.narrator.speak(`${this.current.title}. ${this.current.body}`);
    });
  }

  // Bottom-left status text.
  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  // Bottom-right live detection readout (driven by interaction.js every frame).
  setHud(text) {
    if (this.hudEl) this.hudEl.textContent = text;
  }

  // Show a memory in the side card.
  showCard(memory) {
    this.current = memory;
    this.cardDate.textContent = memory.date || "";
    this.cardTitle.textContent = memory.title || "";
    this.cardBody.textContent = memory.body || "";
    this.card.classList.remove("hidden");
  }

  hideCard() {
    this.card.classList.add("hidden");
    this.narrator.shutUp();
    this.current = null;
  }
}
