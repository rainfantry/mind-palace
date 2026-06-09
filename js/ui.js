// ---------------------------------------------------------------------------
// ui.js — the panel controller. Owns the memory card (view / edit / talk),
// the toolbar, the status line and the detection readout.
//
// It's the one file allowed to touch a lot of DOM. Logic lives elsewhere:
//   - reading aloud -> narrator (voice.js)
//   - add/edit/delete -> editor (editor.js)
//   - talk -> agent (agent.js)
// This just wires buttons to those.
//
// main.js builds the dependencies then calls ui.attach({ agent, editor, swarm }).
// ---------------------------------------------------------------------------

export class UI {
  constructor(narrator) {
    this.narrator = narrator;
    this.agent = null;
    this.editor = null;
    this.swarm = null;

    this.currentMemory = null;
    this.currentOrb = null;
    this._editLinks = [];   // ids currently selected in the link picker

    // static elements (exist from page load)
    this.statusEl = document.getElementById("status");
    this.hudEl = document.getElementById("hud");
    this.card = document.getElementById("memory-card");

    this.viewEl = document.getElementById("card-view");
    this.editEl = document.getElementById("card-edit-form");
    this.chatEl = document.getElementById("card-chat");

    this.cardDate = document.getElementById("card-date");
    this.cardTitle = document.getElementById("card-title");
    this.cardBody = document.getElementById("card-body");

    document.getElementById("card-close").addEventListener("click", () => this.hideCard());
    document.getElementById("card-speak").addEventListener("click", () => this._speakCurrent());
    document.getElementById("card-edit").addEventListener("click", () => this._showMode("edit"));
    document.getElementById("card-talk").addEventListener("click", () => this._showMode("chat"));
  }

  setStatus(text) { if (this.statusEl) this.statusEl.textContent = text; }
  setHud(text) { if (this.hudEl) this.hudEl.textContent = text; }

  // Called by main once the deps exist. Wires the buttons that need them.
  attach({ agent, editor, swarm }) {
    this.agent = agent;
    this.editor = editor;
    this.swarm = swarm;

    document.getElementById("tb-add").addEventListener("click", () => this._addMemory());
    document.getElementById("tb-export").addEventListener("click", () => this._export());

    document.getElementById("edit-save").addEventListener("click", () => this._saveEdit());
    document.getElementById("edit-delete").addEventListener("click", () => this._deleteCurrent());
    document.getElementById("edit-cancel").addEventListener("click", () => this._showMode("view"));

    document.getElementById("chat-send").addEventListener("click", () => this._sendChat());
    document.getElementById("chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._sendChat();
    });

    // link picker — search + show results
    const linkSearch = document.getElementById("link-search");
    linkSearch.addEventListener("input", () => this._filterLinkResults(linkSearch.value));
    linkSearch.addEventListener("focus", () => this._filterLinkResults(linkSearch.value));
    // click outside the picker closes the dropdown
    document.addEventListener("click", (e) => {
      const picker = document.getElementById("link-picker");
      if (picker && !picker.contains(e.target)) this._hideLinkResults();
    });

    const modelEl = document.getElementById("chat-model");
    if (modelEl) modelEl.textContent = this.agent?.enabled ? `model: ${this.agent.modelName}` : "local model off";
  }

  // ---- open / show ----------------------------------------------------------

  showCard(memory) {
    this.currentMemory = memory;
    this.currentOrb = this.swarm
      ? this.swarm.orbs.find((o) => o.userData.memory.id === memory.id)
      : null;

    this.cardDate.textContent = memory.date || "";
    this.cardTitle.textContent = memory.title || "";
    this.cardBody.textContent = memory.body || "";

    this.card.classList.remove("hidden");
    this._showMode("view");
  }

  hideCard() {
    this.card.classList.add("hidden");
    this.narrator.shutUp();
    this.currentMemory = null;
    this.currentOrb = null;
  }

  // Swap between view / edit / chat sections.
  _showMode(mode) {
    this.viewEl.classList.toggle("hidden", mode !== "view");
    this.editEl.classList.toggle("hidden", mode !== "edit");
    this.chatEl.classList.toggle("hidden", mode !== "chat");
    if (mode === "edit") this._populateEdit();
    if (mode === "chat") document.getElementById("chat-input")?.focus();
  }

  _speakCurrent() {
    if (this.currentMemory) {
      // deliberate button press — force it, interrupts any current read
      this.narrator.speak(`${this.currentMemory.title}. ${this.currentMemory.body}`, { force: true });
    }
  }

  // ---- edit -----------------------------------------------------------------

  _populateEdit() {
    const m = this.currentMemory;
    if (!m) return;
    document.getElementById("edit-title").value = m.title || "";
    document.getElementById("edit-date").value = m.date || "";
    document.getElementById("edit-tag").value = m.tag || "build";
    document.getElementById("edit-body").value = m.body || "";

    // load existing links into the picker
    this._editLinks = [...(m.links || [])];
    this._renderLinkChips();
    document.getElementById("link-search").value = "";
    this._hideLinkResults();
  }

  _saveEdit() {
    if (!this.currentOrb || !this.editor) return;
    const links = [...this._editLinks];
    const fields = {
      title: document.getElementById("edit-title").value.trim(),
      date: document.getElementById("edit-date").value.trim(),
      tag: document.getElementById("edit-tag").value,
      body: document.getElementById("edit-body").value.trim(),
      links,
    };
    this.editor.updateNode(this.currentOrb, fields);
    this.currentMemory = this.currentOrb.userData.memory;
    // refresh the view text and bounce back to view mode
    this.cardDate.textContent = fields.date;
    this.cardTitle.textContent = fields.title;
    this.cardBody.textContent = fields.body;
    this._showMode("view");
    this.setStatus("saved");
  }

  _deleteCurrent() {
    if (!this.currentMemory || !this.editor) return;
    this.editor.deleteNode(this.currentMemory.id);
    this.hideCard();
    this.setStatus("deleted");
  }

  // ---- link picker ----------------------------------------------------------

  // Show the selected links as removable chips.
  _renderLinkChips() {
    const wrap = document.getElementById("link-chips");
    wrap.innerHTML = "";
    for (const id of this._editLinks) {
      const mem = this._memoryById(id);
      const chip = document.createElement("span");
      chip.className = "link-chip";
      chip.textContent = mem ? mem.title : id;
      const x = document.createElement("button");
      x.className = "chip-x";
      x.textContent = "✕";
      x.addEventListener("click", () => this._removeLink(id));
      chip.appendChild(x);
      wrap.appendChild(chip);
    }
  }

  // Filter all other memories by the search text and show the dropdown.
  _filterLinkResults(query) {
    const box = document.getElementById("link-results");
    const q = query.trim().toLowerCase();
    const selfId = this.currentMemory?.id;

    const matches = (this.swarm?.orbs || [])
      .map((o) => o.userData.memory)
      .filter((m) => m.id !== selfId && !this._editLinks.includes(m.id))
      .filter((m) => !q || m.title.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 8);

    box.innerHTML = "";
    if (matches.length === 0) { this._hideLinkResults(); return; }

    for (const m of matches) {
      const item = document.createElement("div");
      item.className = "link-result";
      item.textContent = m.title;
      item.addEventListener("click", () => this._addLink(m.id));
      box.appendChild(item);
    }
    box.classList.remove("hidden");
  }

  _addLink(id) {
    if (!this._editLinks.includes(id)) this._editLinks.push(id);
    this._renderLinkChips();
    document.getElementById("link-search").value = "";
    this._hideLinkResults();
  }

  _removeLink(id) {
    this._editLinks = this._editLinks.filter((x) => x !== id);
    this._renderLinkChips();
  }

  _hideLinkResults() {
    document.getElementById("link-results")?.classList.add("hidden");
  }

  _memoryById(id) {
    return this.swarm?.orbs.find((o) => o.userData.memory.id === id)?.userData.memory || null;
  }

  _addMemory() {
    if (!this.editor) return;
    const orb = this.editor.addNode({ title: "new memory", body: "type something…" });
    this.showCard(orb.userData.memory);
    this._showMode("edit");
  }

  _export() {
    if (!this.editor) return;
    const json = this.editor.exportJson();
    navigator.clipboard?.writeText(json)
      .then(() => this.setStatus("all memories copied to clipboard — paste into memories.local.json"))
      .catch(() => {
        // clipboard blocked? drop it in the console as a fallback
        console.log(json);
        this.setStatus("clipboard blocked — full JSON dumped to console");
      });
  }

  // ---- talk -----------------------------------------------------------------

  async _sendChat() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text || !this.agent) return;
    input.value = "";

    this._appendChat("you", text);
    const thinking = this._appendChat("servitor", "…");

    try {
      const reply = await this.agent.ask(text, this.currentMemory);
      thinking.textContent = reply;
    } catch (err) {
      thinking.textContent = `[${err.message}]`;
      thinking.classList.add("chat-error");
    }
    const log = document.getElementById("chat-log");
    log.scrollTop = log.scrollHeight;
  }

  _appendChat(who, text) {
    const log = document.getElementById("chat-log");
    const line = document.createElement("div");
    line.className = `chat-line chat-${who}`;
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    return line;
  }
}
