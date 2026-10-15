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
    flashMain: document.getElementById("flash-main"),
    flashEmpty: document.getElementById("flash-empty"),
    cardJp: document.getElementById("card-jp"),
    cardZh: document.getElementById("card-zh"),
    cardSpeak: document.getElementById("card-speak"),
    btnFocus: document.getElementById("btn-focus"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    btnShuffle: document.getElementById("btn-shuffle"),
    btnRestart: document.getElementById("btn-restart"),
    btnShowAll: document.getElementById("btn-show-all"),
    filterChips: document.querySelectorAll(".filter-chip"),
    ttsNote: document.getElementById("tts-note"),
    btnAutoplay: document.getElementById("btn-autoplay"),
    autoplayStatus: document.getElementById("autoplay-status"),
    autoplayStatusText: document.getElementById("autoplay-status-text"),
  };

  let vocab = [];
  let filtered = [];
  let deck = [];
  let deckIndex = 0;
  let flipped = false;
  let selectedId = null;
  let jpVoice = null;
  let deckFilter = "all"; // "all" | "focus"
  let state = loadState();
  let zhVoice = null;
  let zhVoiceLabel = "";
  let zhHasCantonese = false;
  let zhHasAnyChinese = false;
  let autoplay = false;
  let autoplayTimers = [];
  let autoplayToken = 0;
  const AUTOPLAY_ZH_DELAY_MS = 3000;
  const AUTOPLAY_NEXT_PAUSE_MS = 1500;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { knownIds: [], focusIds: [], deckOrder: null, deckIndex: 0 };
      const parsed = JSON.parse(raw);
      return {
        knownIds: Array.isArray(parsed.knownIds) ? parsed.knownIds : [],
        focusIds: Array.isArray(parsed.focusIds) ? parsed.focusIds : [],
        deckOrder: Array.isArray(parsed.deckOrder) ? parsed.deckOrder : null,
        deckIndex: typeof parsed.deckIndex === "number" ? parsed.deckIndex : 0,
      };
    } catch {
      return { knownIds: [], focusIds: [], deckOrder: null, deckIndex: 0 };
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        knownIds: state.knownIds,
        focusIds: state.focusIds,
        deckOrder: state.deckOrder,
        deckIndex: deckIndex,
      })
    );
  }

  function isKnown(id) {
    return state.knownIds.includes(id);
  }

  function isFocused(id) {
    return state.focusIds.includes(id);
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

  function toggleFocus(id) {
    if (isFocused(id)) {
      state.focusIds = state.focusIds.filter((x) => x !== id);
    } else {
      state.focusIds = [...state.focusIds, id];
    }
    saveState();
    updateFocusBtn();
    // If filtering to focus only and we just unfocused the last card, rebuild
    if (deckFilter === "focus") {
      const currentId = id;
      rebuildDeckFromFilter({ preferId: isFocused(currentId) ? currentId : null });
    }
  }

  function updateKnownStats() {
    els.knownCount.textContent = String(state.knownIds.length);
  }

  function updateFocusBtn() {
    const w = currentCard();
    if (!w || !els.btnFocus) return;
    const focused = isFocused(w.id);
    els.btnFocus.textContent = focused ? "★ 已關注" : "☆ 重點關注";
    els.btnFocus.classList.toggle("active", focused);
    els.btnFocus.setAttribute("aria-pressed", focused ? "true" : "false");
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

  function isCantoneseVoice(v) {
    if (!v) return false;
    const lang = (v.lang || "").toLowerCase().replace(/_/g, "-");
    const name = (v.name || "").toLowerCase();
    return (
      lang === "zh-hk" ||
      lang.startsWith("zh-hk") ||
      lang === "yue" ||
      lang.startsWith("yue-") ||
      lang === "zh-yue" ||
      lang.includes("yue") ||
      name.includes("yue") ||
      name.includes("cantonese") ||
      name.includes("粵語") ||
      name.includes("粤语") ||
      name.includes("香港") ||
      name.includes("hong kong")
    );
  }

  function isMandarinVoice(v) {
    if (!v) return false;
    if (isCantoneseVoice(v)) return false;
    const lang = (v.lang || "").toLowerCase().replace(/_/g, "-");
    const name = (v.name || "").toLowerCase();
    return (
      lang.startsWith("zh-cn") ||
      lang === "zh" ||
      lang.startsWith("cmn") ||
      name.includes("mandarin") ||
      name.includes("putonghua") ||
      name.includes("普通话") ||
      name.includes("普通話") ||
      name.includes("国语") ||
      name.includes("國語")
    );
  }

  function pickChineseVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices();
    // Prefer Cantonese / Hong Kong only — never lock onto Mandarin (zh-CN).
    const preferred =
      voices.find((v) => (v.lang || "").replace(/_/g, "-") === "zh-HK") ||
      voices.find((v) => (v.lang || "").toLowerCase().replace(/_/g, "-") === "yue-hk") ||
      voices.find((v) => /^yue\b/i.test((v.lang || "").replace(/_/g, "-"))) ||
      voices.find((v) => isCantoneseVoice(v)) ||
      null;
    zhVoice = preferred;
    zhVoiceLabel = preferred ? preferred.lang || preferred.name || "" : "";
    zhHasCantonese = !!preferred;
    zhHasAnyChinese = voices.some(
      (v) =>
        isCantoneseVoice(v) ||
        isMandarinVoice(v) ||
        /^(zh|yue|cmn)\b/i.test((v.lang || "").replace(/_/g, "-"))
    );
    return preferred;
  }

  function refreshVoices() {
    pickJapaneseVoice();
    pickChineseVoice();
  }

  function speakJa(text, { cancel = true } = {}) {
    if (!window.speechSynthesis) {
      els.ttsNote.classList.add("visible");
      return null;
    }
    if (cancel) speechSynthesis.cancel();
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
    return u;
  }

  function speakZh(text, { cancel = false } = {}) {
    if (!window.speechSynthesis) {
      els.ttsNote.classList.add("visible");
      return null;
    }
    if (cancel) speechSynthesis.cancel();
    // Refresh in case voices arrived late (common on mobile).
    pickChineseVoice();
    const u = new SpeechSynthesisUtterance(text);
    // Always request Cantonese / Hong Kong — do not set zh-CN.
    u.lang = "zh-HK";
    // Only assign an explicit voice when it is Cantonese; never Mandarin.
    if (zhVoice && isCantoneseVoice(zhVoice)) {
      u.voice = zhVoice;
      // Keep lang as zh-HK even if the voice reports a variant tag.
      u.lang = "zh-HK";
    }
    u.rate = 0.95;
    speechSynthesis.speak(u);
    return u;
  }

  // Back-compat alias used by list / detail / card speak buttons
  function speak(text) {
    speakJa(text, { cancel: true });
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

  function getFilteredPool() {
    if (deckFilter === "focus") {
      return vocab.filter((w) => isFocused(w.id));
    }
    return [...vocab];
  }

  function rebuildDeckFromFilter({ preferId = null, shuffle = false } = {}) {
    const pool = getFilteredPool();

    if (pool.length === 0) {
      if (autoplay) stopAutoplay();
      deck = [];
      deckIndex = 0;
      flipped = false;
      showEmptyState(true);
      updateFlashProgressEmpty();
      return;
    }

    showEmptyState(false);

    let next;
    if (shuffle) {
      next = [...pool];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    } else if (state.deckOrder && state.deckOrder.length) {
      const byId = new Map(pool.map((w) => [w.id, w]));
      const ordered = [];
      for (const id of state.deckOrder) {
        const w = byId.get(id);
        if (w) {
          ordered.push(w);
          byId.delete(id);
        }
      }
      // append any pool items not in saved order (e.g. newly focused)
      for (const w of byId.values()) ordered.push(w);
      next = ordered.length ? ordered : [...pool];
    } else {
      next = [...pool];
    }

    deck = next;
    state.deckOrder = deck.map((w) => w.id);

    if (preferId != null) {
      const idx = deck.findIndex((w) => w.id === preferId);
      deckIndex = idx >= 0 ? idx : 0;
    } else {
      deckIndex = Math.min(Math.max(0, state.deckIndex || 0), deck.length - 1);
    }

    flipped = false;
    renderCard();
    saveState();
  }

  function showEmptyState(empty) {
    if (els.flashEmpty) els.flashEmpty.hidden = !empty;
    if (els.flashMain) els.flashMain.hidden = empty;
  }

  function updateFlashProgressEmpty() {
    const label = deckFilter === "focus" ? "重點關注" : "全部";
    els.flashProgress.innerHTML = `<strong>0</strong> / 0 · ${label}`;
    els.progressFill.style.width = "0%";
  }

  function shuffleDeck() {
    if (autoplay) stopAutoplay();
    rebuildDeckFromFilter({ shuffle: true });
  }

  function restartDeck() {
    if (autoplay) stopAutoplay();
    if (!deck.length) return;
    deckIndex = 0;
    flipped = false;
    renderCard();
    saveState();
  }

  function setFilter(filter) {
    if (filter !== "all" && filter !== "focus") return;
    if (autoplay) stopAutoplay();
    const currentId = currentCard()?.id ?? null;
    deckFilter = filter;
    els.filterChips.forEach((chip) => {
      const on = chip.dataset.filter === filter;
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
    rebuildDeckFromFilter({ preferId: currentId });
  }

  function renderCard() {
    if (!deck.length) {
      showEmptyState(true);
      updateFlashProgressEmpty();
      return;
    }
    showEmptyState(false);
    const w = deck[deckIndex];
    els.cardJp.textContent = w.jp;
    els.cardZh.textContent = w.zh;
    els.flashCard.classList.toggle("flipped", flipped);
    const filterLabel = deckFilter === "focus" ? " · 重點" : "";
    els.flashProgress.innerHTML = `<strong>${deckIndex + 1}</strong> / ${deck.length}${filterLabel}`;
    const pct = ((deckIndex + 1) / deck.length) * 100;
    els.progressFill.style.width = pct + "%";
    updateFocusBtn();
  }

  function flipCard() {
    if (!deck.length) return;
    flipped = !flipped;
    els.flashCard.classList.toggle("flipped", flipped);
  }

  function goNext() {
    if (autoplay) stopAutoplay();
    if (deckIndex < deck.length - 1) {
      deckIndex++;
      flipped = false;
      renderCard();
      saveState();
    }
  }

  function goPrev() {
    if (autoplay) stopAutoplay();
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


  function clearAutoplayTimers() {
    for (const t of autoplayTimers) clearTimeout(t);
    autoplayTimers = [];
  }

  function scheduleAutoplay(fn, ms) {
    const id = setTimeout(fn, ms);
    autoplayTimers.push(id);
    return id;
  }

  function updateAutoplayUi() {
    if (!els.btnAutoplay) return;
    els.btnAutoplay.classList.toggle("active", autoplay);
    els.btnAutoplay.setAttribute("aria-pressed", autoplay ? "true" : "false");
    els.btnAutoplay.textContent = autoplay ? "⏹ 停止播放" : "▶ 自動播放";
    document.body.classList.toggle("autoplaying", autoplay);

    if (!els.autoplayStatus) return;
    if (!autoplay) {
      els.autoplayStatus.hidden = true;
      els.autoplayStatus.classList.remove("fallback");
      return;
    }
    els.autoplayStatus.hidden = false;
    const filterLabel = deckFilter === "focus" ? "重點關注" : "全部";
    let voiceNote = "";
    let isFallback = false;
    if (!window.speechSynthesis) {
      voiceNote = " · 唔支援語音";
      isFallback = true;
    } else if (zhHasCantonese && zhVoice) {
      voiceNote = ` · 粵語 ${zhVoice.lang || zhVoice.name || "zh-HK"}`;
    } else {
      // No Cantonese voice listed: still speak with lang=zh-HK (OS may map it).
      voiceNote =
        " · 未偵測到粵語／香港語音，已用 zh-HK 請系統讀；若仍係普通話，請喺系統設定加入「粵語／香港」語音";
      isFallback = true;
    }
    els.autoplayStatus.classList.toggle("fallback", isFallback);
    els.autoplayStatusText.textContent = `自動播放中（${filterLabel} · 隨機）${voiceNote}`;
  }

  function stopAutoplay({ silent = false } = {}) {
    if (!autoplay && !autoplayTimers.length) {
      updateAutoplayUi();
      return;
    }
    autoplay = false;
    autoplayToken += 1;
    clearAutoplayTimers();
    if (window.speechSynthesis) speechSynthesis.cancel();
    updateAutoplayUi();
    if (!silent) {
      // leave card as-is
    }
  }

  function pickRandomDeckIndex(excludeIndex = -1) {
    if (!deck.length) return -1;
    if (deck.length === 1) return 0;
    let idx = Math.floor(Math.random() * deck.length);
    // avoid immediate repeat when possible
    let guard = 0;
    while (idx === excludeIndex && guard < 8) {
      idx = Math.floor(Math.random() * deck.length);
      guard++;
    }
    return idx;
  }

  function goToAutoplayIndex(idx) {
    if (idx < 0 || idx >= deck.length) return;
    deckIndex = idx;
    flipped = false;
    renderCard();
    saveState();
  }

  function runAutoplayStep(token) {
    if (!autoplay || token !== autoplayToken) return;
    if (!deck.length) {
      stopAutoplay();
      return;
    }

    const prev = deckIndex;
    const idx = pickRandomDeckIndex(prev);
    goToAutoplayIndex(idx);
    const w = deck[deckIndex];
    if (!w) {
      stopAutoplay();
      return;
    }

    // Show JP face, speak Japanese
    flipped = false;
    els.flashCard.classList.toggle("flipped", false);
    speakJa(w.jp, { cancel: true });

    // After 3s: flip to ZH and speak Cantonese
    scheduleAutoplay(() => {
      if (!autoplay || token !== autoplayToken) return;
      flipped = true;
      els.flashCard.classList.toggle("flipped", true);
      speakZh(w.zh, { cancel: false });

      // After Cantonese starts + short pause, go next.
      // We wait fixed pause after the ZH delay rather than utterance end,
      // so timing stays predictable even if TTS is slow/missing.
      scheduleAutoplay(() => {
        if (!autoplay || token !== autoplayToken) return;
        runAutoplayStep(token);
      }, AUTOPLAY_NEXT_PAUSE_MS + 1200);
    }, AUTOPLAY_ZH_DELAY_MS);
  }

  function startAutoplay() {
    if (!deck.length) return;
    if (!window.speechSynthesis) {
      els.ttsNote.classList.add("visible");
      els.ttsNote.textContent =
        "呢個瀏覽器唔支援語音朗讀（Web Speech API）。請用 Chrome / Edge / Safari 試吓。";
    }
    // Force voice list refresh before starting (mobile often loads voices late).
    if (window.speechSynthesis) {
      speechSynthesis.getVoices();
      refreshVoices();
    }
    autoplay = true;
    autoplayToken += 1;
    const token = autoplayToken;
    clearAutoplayTimers();
    updateAutoplayUi();
    runAutoplayStep(token);
  }

  function toggleAutoplay() {
    if (autoplay) stopAutoplay();
    else startAutoplay();
  }

  // Events
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.panel !== "panel-flash" && autoplay) stopAutoplay();
      els.tabs.forEach((t) => t.classList.remove("active"));
      els.panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.panel).classList.add("active");
      tab.setAttribute("aria-selected", "true");
      els.tabs.forEach((t) => {
        if (t !== tab) t.setAttribute("aria-selected", "false");
      });
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

  els.btnFocus.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = currentCard();
    if (!w) return;
    // Keep autoplay running while toggling focus
    toggleFocus(w.id);
  });

  els.btnNext.addEventListener("click", goNext);
  els.btnPrev.addEventListener("click", goPrev);
  els.btnShuffle.addEventListener("click", shuffleDeck);
  els.btnRestart.addEventListener("click", restartDeck);
  if (els.btnAutoplay) {
    els.btnAutoplay.addEventListener("click", toggleAutoplay);
  }

  els.filterChips.forEach((chip) => {
    chip.addEventListener("click", () => setFilter(chip.dataset.filter));
  });

  if (els.btnShowAll) {
    els.btnShowAll.addEventListener("click", () => setFilter("all"));
  }

  document.addEventListener("keydown", (e) => {
    const flashActive = document.getElementById("panel-flash").classList.contains("active");
    if (!flashActive) return;
    if (!deck.length) return;
    if (e.key === "Escape" && autoplay) {
      e.preventDefault();
      stopAutoplay();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (autoplay) stopAutoplay();
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
      refreshVoices();
      speechSynthesis.onvoiceschanged = () => refreshVoices();
      setTimeout(refreshVoices, 300);
    }

    const res = await fetch("vocab.json");
    if (!res.ok) throw new Error("無法載入 vocab.json");
    vocab = await res.json();
    if (!Array.isArray(vocab)) throw new Error("vocab.json 格式錯誤");

    els.totalCount.textContent = String(vocab.length);
    updateKnownStats();
    renderList();
    rebuildDeckFromFilter();

    console.log(`[jp-vocab] loaded ${vocab.length} words`);
  }

  init().catch((err) => {
    console.error(err);
    els.wordList.innerHTML = `<li class="empty-state">載入失敗：${escapeHtml(err.message)}</li>`;
  });
})();
