(() => {
  "use strict";

  const STORAGE_KEY = "jp-vocab-keene-v1";
  const els = {
    tabs: document.querySelectorAll(".tab"),
    panels: document.querySelectorAll(".panel"),
    search: document.getElementById("search"),
    searchCount: document.getElementById("search-count"),
    wordList: document.getElementById("word-list"),
    detail: document.getElementById("detail"),
    detailJp: document.getElementById("detail-jp"),
    detailZh: document.getElementById("detail-zh"),
    detailSpeak: document.getElementById("detail-speak"),
    detailKnown: document.getElementById("detail-known"),
    knownCount: document.getElementById("known-count"),
    totalCount: document.getElementById("total-count"),
    flashProgress: document.getElementById("flash-progress"),
    progressFill: document.getElementById("progress-fill"),
    flashCard: document.getElementById("flash-card"),
    cardJp: document.getElementById("card-jp"),
    cardZh: document.getElementById("card-zh"),
    cardSpeak: document.getElementById("card-speak"),
    btnKnown: document.getElementById("btn-known"),
    btnAgain: document.getElementById("btn-again"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    btnShuffle: document.getElementById("btn-shuffle"),
    btnRestart: document.getElementById("btn-restart"),
    ttsNote: document.getElementById("tts-note"),
  };

  let vocab = [];
  let filtered = [];
  let deck = [];
  let deckIndex = 0;
  let flipped = false;
  let selectedId = null;
  let jpVoice = null;
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { knownIds: [], deckOrder: null, deckIndex: 0 };
      const parsed = JSON.parse(raw);
      return {
        knownIds: Array.isArray(parsed.knownIds) ? parsed.knownIds : [],
        deckOrder: Array.isArray(parsed.deckOrder) ? parsed.deckOrder : null,
        deckIndex: typeof parsed.deckIndex === "number" ? parsed.deckIndex : 0,
      };
    } catch {
      return { knownIds: [], deckOrder: null, deckIndex: 0 };
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        knownIds: state.knownIds,
        deckOrder: state.deckOrder,
        deckIndex: deckIndex,
      })
    );
  }

  function isKnown(id) {
    return state.knownIds.includes(id);
  }

  function toggleKnown(id) {
    if (isKnown(id)) {
      state.knownIds = state.knownIds.filter((x) => x !== id);
    } else {
      state.knownIds = [...state.knownIds, id];
    }
    saveState();
    updateKnownStats();
    renderList();
    updateDetailKnownBtn();
  }

  function markKnown(id, known) {
    const has = isKnown(id);
    if (known && !has) state.knownIds = [...state.knownIds, id];
    if (!known && has) state.knownIds = state.knownIds.filter((x) => x !== id);
    saveState();
    updateKnownStats();
  }

  function updateKnownStats() {
    els.knownCount.textContent = String(state.knownIds.length);
  }

  function pickJapaneseVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang === "ja-JP") ||
      voices.find((v) => v.lang.startsWith("ja")) ||
      null;
    jpVoice = preferred;
    return preferred;
  }

  function speak(text) {
    if (!window.speechSynthesis) {
      els.ttsNote.classList.add("visible");
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    if (!jpVoice) pickJapaneseVoice();
    if (jpVoice) u.voice = jpVoice;
    u.onstart = () => {
      document.querySelectorAll(".icon-btn.speaking").forEach((b) => b.classList.remove("speaking"));
      const active = document.activeElement;
      if (active && active.classList.contains("icon-btn")) active.classList.add("speaking");
      els.cardSpeak.classList.add("speaking");
      els.detailSpeak.classList.add("speaking");
    };
    u.onend = u.onerror = () => {
      document.querySelectorAll(".icon-btn.speaking").forEach((b) => b.classList.remove("speaking"));
    };
    speechSynthesis.speak(u);
  }

  function renderList() {
    const q = (els.search.value || "").trim().toLowerCase();
    filtered = !q
      ? vocab
      : vocab.filter(
          (w) =>
            w.jp.toLowerCase().includes(q) ||
            w.zh.toLowerCase().includes(q) ||
            String(w.id).includes(q)
        );

    els.searchCount.textContent = `顯示 ${filtered.length} / ${vocab.length} 個生字`;

    if (filtered.length === 0) {
      els.wordList.innerHTML = `<li class="empty-state">搵唔到相關生字</li>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const w of filtered) {
      const li = document.createElement("li");
      li.className = "word-item" + (isKnown(w.id) ? " known" : "");
      li.dataset.id = String(w.id);
      li.innerHTML = `
        <span class="word-id">${w.id}</span>
        <div class="word-main">
          <div class="jp">${escapeHtml(w.jp)}</div>
          <div class="zh">${escapeHtml(w.zh)}</div>
        </div>
        ${isKnown(w.id) ? '<span class="badge-known">識</span>' : "<span></span>"}
        <button type="button" class="icon-btn speak-btn" title="讀出日文" aria-label="讀出 ${escapeHtml(w.jp)}">🔊</button>
      `;
      frag.appendChild(li);
    }
    els.wordList.innerHTML = "";
    els.wordList.appendChild(frag);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showDetail(word) {
    selectedId = word.id;
    els.detailJp.textContent = word.jp;
    els.detailZh.textContent = word.zh;
    els.detail.classList.add("visible");
    updateDetailKnownBtn();
  }

  function updateDetailKnownBtn() {
    if (selectedId == null) return;
    const known = isKnown(selectedId);
    els.detailKnown.textContent = known ? "取消「已識」" : "標記為已識";
    els.detailKnown.className = "btn " + (known ? "btn-ghost" : "btn-success");
  }

  function buildDeck(order) {
    if (order && order.length === vocab.length) {
      const byId = new Map(vocab.map((w) => [w.id, w]));
      deck = order.map((id) => byId.get(id)).filter(Boolean);
      if (deck.length !== vocab.length) deck = [...vocab];
    } else {
      deck = [...vocab];
    }
    state.deckOrder = deck.map((w) => w.id);
    deckIndex = Math.min(Math.max(0, state.deckIndex || 0), deck.length - 1);
    flipped = false;
    renderCard();
    saveState();
  }

  function shuffleDeck() {
    deck = [...vocab];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.deckOrder = deck.map((w) => w.id);
    deckIndex = 0;
    flipped = false;
    renderCard();
    saveState();
  }

  function restartDeck() {
    deckIndex = 0;
    flipped = false;
    renderCard();
    saveState();
  }

  function renderCard() {
    if (!deck.length) return;
    const w = deck[deckIndex];
    els.cardJp.textContent = w.jp;
    els.cardZh.textContent = w.zh;
    els.flashCard.classList.toggle("flipped", flipped);
    els.flashProgress.innerHTML = `<strong>${deckIndex + 1}</strong> / ${deck.length}`;
    const pct = ((deckIndex + 1) / deck.length) * 100;
    els.progressFill.style.width = pct + "%";
  }

  function flipCard() {
    flipped = !flipped;
    els.flashCard.classList.toggle("flipped", flipped);
  }

  function goNext() {
    if (deckIndex < deck.length - 1) {
      deckIndex++;
      flipped = false;
      renderCard();
      saveState();
    }
  }

  function goPrev() {
    if (deckIndex > 0) {
      deckIndex--;
      flipped = false;
      renderCard();
      saveState();
    }
  }

  function currentCard() {
    return deck[deckIndex];
  }

  // Events
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.tabs.forEach((t) => t.classList.remove("active"));
      els.panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.panel).classList.add("active");
    });
  });

  els.search.addEventListener("input", () => renderList());

  els.wordList.addEventListener("click", (e) => {
    const speakBtn = e.target.closest(".speak-btn");
    const item = e.target.closest(".word-item");
    if (!item) return;
    const id = Number(item.dataset.id);
    const word = vocab.find((w) => w.id === id);
    if (!word) return;

    if (speakBtn) {
      e.stopPropagation();
      speak(word.jp);
      showDetail(word);
      return;
    }
    showDetail(word);
    speak(word.jp);
  });

  els.detailSpeak.addEventListener("click", () => {
    if (selectedId == null) return;
    const w = vocab.find((x) => x.id === selectedId);
    if (w) speak(w.jp);
  });

  els.detailKnown.addEventListener("click", () => {
    if (selectedId != null) toggleKnown(selectedId);
  });

  els.flashCard.addEventListener("click", (e) => {
    if (e.target.closest(".card-speak")) return;
    flipCard();
  });

  els.cardSpeak.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = currentCard();
    if (w) speak(w.jp);
  });

  els.btnKnown.addEventListener("click", () => {
    const w = currentCard();
    if (!w) return;
    markKnown(w.id, true);
    updateKnownStats();
    renderList();
    goNext();
  });

  els.btnAgain.addEventListener("click", () => {
    const w = currentCard();
    if (!w) return;
    markKnown(w.id, false);
    updateKnownStats();
    renderList();
    goNext();
  });

  els.btnNext.addEventListener("click", goNext);
  els.btnPrev.addEventListener("click", goPrev);
  els.btnShuffle.addEventListener("click", shuffleDeck);
  els.btnRestart.addEventListener("click", restartDeck);

  const flipHint = document.getElementById("btn-flip-hint");
  if (flipHint) {
    flipHint.disabled = false;
    flipHint.style.opacity = "";
    flipHint.style.cursor = "";
    flipHint.addEventListener("click", flipCard);
  }

  document.addEventListener("keydown", (e) => {
    const flashActive = document.getElementById("panel-flash").classList.contains("active");
    if (!flashActive) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flipCard();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    }
  });

  async function init() {
    if (!window.speechSynthesis) {
      els.ttsNote.classList.add("visible");
      els.ttsNote.textContent =
        "呢個瀏覽器唔支援語音朗讀（Web Speech API）。請用 Chrome / Edge / Safari 試吓。";
    } else {
      pickJapaneseVoice();
      speechSynthesis.onvoiceschanged = () => pickJapaneseVoice();
      // Some browsers need a delayed voice load
      setTimeout(pickJapaneseVoice, 300);
    }

    const res = await fetch("vocab.json");
    if (!res.ok) throw new Error("無法載入 vocab.json");
    vocab = await res.json();
    if (!Array.isArray(vocab)) throw new Error("vocab.json 格式錯誤");

    els.totalCount.textContent = String(vocab.length);
    updateKnownStats();
    renderList();
    buildDeck(state.deckOrder);

    console.log(`[jp-vocab] loaded ${vocab.length} words`);
  }

  init().catch((err) => {
    console.error(err);
    els.wordList.innerHTML = `<li class="empty-state">載入失敗：${escapeHtml(err.message)}</li>`;
  });
})();
