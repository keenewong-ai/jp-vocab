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
    totalCount: document.getElementById("total-count"),
    flashProgress: document.getElementById("flash-progress"),
    progressFill: document.getElementById("progress-fill"),
    flashCard: document.getElementById("flash-card"),
    flashMain: document.getElementById("flash-main"),
    flashEmpty: document.getElementById("flash-empty"),
    flashEmptyIcon: document.getElementById("flash-empty-icon"),
    flashEmptyTitle: document.getElementById("flash-empty-title"),
    flashEmptyDesc: document.getElementById("flash-empty-desc"),
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
    syncStatus: document.getElementById("sync-status"),
    listSort: document.getElementById("list-sort"),
    flashSort: document.getElementById("flash-sort"),
    detailAdded: document.getElementById("detail-added"),
  };

  let vocab = [];
  let filtered = [];
  let deck = [];
  let deckIndex = 0;
  let flipped = false;
  let selectedId = null;
  let jpVoice = null;
  let deckFilter = "all"; // "all" | "focus" | "unfocus"
  let listSortMode = "id"; // "id" | "added_desc" | "added_asc"
  let flashSortMode = "id";
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
  const AUTOPLAY_FLIP_BACK_MS = 400;

  // Supabase cloud sync for 重點關注 (anon key is intentional for frontend)
  const SUPABASE_URL = "https://avfpoaipqkqxzuaqjutv.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2ZnBvYWlwcWtxeHp1YXFqdXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDMzNDIsImV4cCI6MjEwNzYxOTM0Mn0.zPmiuQPPA61QLdbJzkAAnUIkCEtKlFhdlEPiomVuJDY";
  const SYNC_CODE = "keene";
  const SYNC_POLL_MS = 45000;
  let syncTimer = null;
  let syncDebounce = null;
  let syncStatusKind = "syncing"; // syncing | synced | offline | error
  let lastRemoteUpdatedAt = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { focusIds: [], deckOrder: null, deckIndex: 0 };
      const parsed = JSON.parse(raw);
      return {
        focusIds: Array.isArray(parsed.focusIds) ? parsed.focusIds : [],
        deckOrder: Array.isArray(parsed.deckOrder) ? parsed.deckOrder : null,
        deckIndex: typeof parsed.deckIndex === "number" ? parsed.deckIndex : 0,
      };
    } catch {
      return { focusIds: [], deckOrder: null, deckIndex: 0 };
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        focusIds: state.focusIds,
        deckOrder: state.deckOrder,
        deckIndex: deckIndex,
      })
    );
  }

  function setSyncStatus(kind, label) {
    syncStatusKind = kind;
    if (!els.syncStatus) return;
    els.syncStatus.className = "sync-status " + kind;
    els.syncStatus.textContent = label;
  }

  function supabaseHeaders(extra = {}) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  function normalizeFocusIds(ids) {
    if (!Array.isArray(ids)) return [];
    const out = [];
    const seen = new Set();
    for (const x of ids) {
      const n = Number(x);
      if (!Number.isFinite(n) || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function unionFocusIds(a, b) {
    return normalizeFocusIds([...(a || []), ...(b || [])]);
  }

  function focusIdsEqual(a, b) {
    const x = normalizeFocusIds(a);
    const y = normalizeFocusIds(b);
    if (x.length !== y.length) return false;
    return x.every((v, i) => v === y[i]);
  }

  async function fetchRemoteFocus() {
    const url =
      SUPABASE_URL +
      "/rest/v1/jp_vocab_sync?sync_code=eq." +
      encodeURIComponent(SYNC_CODE) +
      "&select=focus_ids,updated_at";
    const res = await fetch(url, {
      method: "GET",
      headers: supabaseHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) {
      throw new Error("GET sync failed: " + res.status);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      return { focusIds: [], updatedAt: null };
    }
    return {
      focusIds: normalizeFocusIds(rows[0].focus_ids),
      updatedAt: rows[0].updated_at || null,
    };
  }

  async function upsertRemoteFocus(focusIds) {
    const ids = normalizeFocusIds(focusIds);
    const url =
      SUPABASE_URL +
      "/rest/v1/jp_vocab_sync?on_conflict=sync_code";
    const res = await fetch(url, {
      method: "POST",
      headers: supabaseHeaders({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({
        sync_code: SYNC_CODE,
        focus_ids: ids,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      // Fallback PATCH if upsert POST not allowed
      const patchUrl =
        SUPABASE_URL +
        "/rest/v1/jp_vocab_sync?sync_code=eq." +
        encodeURIComponent(SYNC_CODE);
      const patchRes = await fetch(patchUrl, {
        method: "PATCH",
        headers: supabaseHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify({
          focus_ids: ids,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!patchRes.ok) {
        throw new Error("upsert sync failed: " + res.status + "/" + patchRes.status);
      }
      const patched = await patchRes.json();
      if (Array.isArray(patched) && patched[0]) {
        lastRemoteUpdatedAt = patched[0].updated_at || lastRemoteUpdatedAt;
      }
      return ids;
    }
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]) {
      lastRemoteUpdatedAt = rows[0].updated_at || lastRemoteUpdatedAt;
    }
    return ids;
  }

  function schedulePushFocus() {
    if (syncDebounce) clearTimeout(syncDebounce);
    setSyncStatus("syncing", "同步中…");
    syncDebounce = setTimeout(() => {
      pushFocusNow().catch(() => {});
    }, 300);
  }

  async function pushFocusNow() {
    try {
      setSyncStatus("syncing", "同步中…");
      await upsertRemoteFocus(state.focusIds);
      setSyncStatus("synced", "已同步");
    } catch (err) {
      console.warn("[jp-vocab] push focus failed", err);
      setSyncStatus("offline", "離線（用本機）");
    }
  }

  async function pullAndMergeFocus({ fromPoll = false } = {}) {
    try {
      if (!fromPoll) setSyncStatus("syncing", "同步中…");
      const remote = await fetchRemoteFocus();
      lastRemoteUpdatedAt = remote.updatedAt;
      const local = normalizeFocusIds(state.focusIds);
      const merged = unionFocusIds(local, remote.focusIds);
      const changedLocal = !focusIdsEqual(merged, local);
      const changedRemote = !focusIdsEqual(merged, remote.focusIds);

      if (changedLocal) {
        state.focusIds = merged;
        saveState();
        updateFocusBtn();
        if (deckFilter === "focus" || deckFilter === "unfocus") {
          const preferId = currentCard()?.id ?? null;
          rebuildDeckFromFilter({ preferId });
        }
      }

      if (changedRemote) {
        await upsertRemoteFocus(merged);
      }

      setSyncStatus("synced", "已同步");
      return merged;
    } catch (err) {
      console.warn("[jp-vocab] pull focus failed", err);
      setSyncStatus("offline", "離線（用本機）");
      return state.focusIds;
    }
  }

  function startFocusSyncPolling() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      pullAndMergeFocus({ fromPoll: true }).catch(() => {});
    }, SYNC_POLL_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        pullAndMergeFocus({ fromPoll: true }).catch(() => {});
      }
    });
  }

  function isFocused(id) {
    return state.focusIds.includes(id);
  }

  function toggleFocus(id) {
    if (isFocused(id)) {
      state.focusIds = state.focusIds.filter((x) => x !== id);
    } else {
      state.focusIds = [...state.focusIds, id];
    }
    state.focusIds = normalizeFocusIds(state.focusIds);
    saveState();
    updateFocusBtn();
    schedulePushFocus();
    // Rebuild when focus/unfocus filter membership may change
    if (deckFilter === "focus" || deckFilter === "unfocus") {
      const currentId = id;
      const stillIn =
        deckFilter === "focus" ? isFocused(currentId) : !isFocused(currentId);
      rebuildDeckFromFilter({ preferId: stillIn ? currentId : null });
    }
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


  function addedTimestamp(w) {
    const s = w && w.added_at != null ? String(w.added_at) : "";
    // Accept YYYY-MM-DD or full ISO
    const t = Date.parse(s.length === 10 ? s + "T00:00:00Z" : s);
    return Number.isFinite(t) ? t : 0;
  }

  function formatAddedAt(w) {
    const s = w && w.added_at != null ? String(w.added_at) : "";
    if (!s) return "";
    return s.slice(0, 10);
  }

  function sortWords(list, mode) {
    const arr = Array.isArray(list) ? [...list] : [];
    if (mode === "added_desc") {
      arr.sort((a, b) => {
        const d = addedTimestamp(b) - addedTimestamp(a);
        return d !== 0 ? d : b.id - a.id;
      });
    } else if (mode === "added_asc") {
      arr.sort((a, b) => {
        const d = addedTimestamp(a) - addedTimestamp(b);
        return d !== 0 ? d : a.id - b.id;
      });
    } else {
      arr.sort((a, b) => a.id - b.id);
    }
    return arr;
  }

  function renderList() {
    const q = (els.search.value || "").trim().toLowerCase();
    const matched = !q
      ? vocab
      : vocab.filter(
          (w) =>
            w.jp.toLowerCase().includes(q) ||
            w.zh.toLowerCase().includes(q) ||
            String(w.id).includes(q)
        );
    filtered = sortWords(matched, listSortMode);

    els.searchCount.textContent = `顯示 ${filtered.length} / ${vocab.length} 個生字`;

    if (filtered.length === 0) {
      els.wordList.innerHTML = `<li class="empty-state">搵唔到相關生字</li>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const w of filtered) {
      const li = document.createElement("li");
      li.className = "word-item";
      li.dataset.id = String(w.id);
      li.innerHTML = `
        <span class="word-id">${w.id}</span>
        <div class="word-main">
          <div class="jp">${escapeHtml(w.jp)}</div>
          <div class="zh">${escapeHtml(w.zh)}</div>
          <div class="word-added">加入 ${escapeHtml(formatAddedAt(w) || "—")}</div>
        </div>
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
    if (els.detailAdded) {
      const d = formatAddedAt(word);
      els.detailAdded.textContent = d ? "加入日期：" + d : "";
    }
    els.detail.classList.add("visible");
  }

  function filterLabelFull() {
    if (deckFilter === "focus") return "重點關注";
    if (deckFilter === "unfocus") return "未關注";
    return "全部";
  }

  function filterLabelShort() {
    if (deckFilter === "focus") return " · 重點";
    if (deckFilter === "unfocus") return " · 未關注";
    return "";
  }

  function getFilteredPool() {
    let pool;
    if (deckFilter === "focus") {
      pool = vocab.filter((w) => isFocused(w.id));
    } else if (deckFilter === "unfocus") {
      pool = vocab.filter((w) => !isFocused(w.id));
    } else {
      pool = [...vocab];
    }
    return sortWords(pool, flashSortMode);
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
    if (!empty) return;
    if (deckFilter === "unfocus") {
      if (els.flashEmptyIcon) els.flashEmptyIcon.textContent = "☆";
      if (els.flashEmptyTitle) els.flashEmptyTitle.textContent = "未有「未關注」嘅生字";
      if (els.flashEmptyDesc) {
        els.flashEmptyDesc.textContent =
          "全部生字都已標記重點關注。取消部分關注，或者睇返全部。";
      }
    } else if (deckFilter === "focus") {
      if (els.flashEmptyIcon) els.flashEmptyIcon.textContent = "★";
      if (els.flashEmptyTitle) els.flashEmptyTitle.textContent = "未有重點關注嘅生字";
      if (els.flashEmptyDesc) {
        els.flashEmptyDesc.textContent =
          "喺「全部」或「未關注」模式撳「重點關注」標記生字，之後就可以喺呢度溫習。";
      }
    } else {
      if (els.flashEmptyIcon) els.flashEmptyIcon.textContent = "空";
      if (els.flashEmptyTitle) els.flashEmptyTitle.textContent = "未有生字";
      if (els.flashEmptyDesc) els.flashEmptyDesc.textContent = "資料庫暫時冇生字。";
    }
  }

  function updateFlashProgressEmpty() {
    const label = filterLabelFull();
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

  function setListSort(mode) {
    if (mode !== "id" && mode !== "added_desc" && mode !== "added_asc") return;
    listSortMode = mode;
    if (els.listSort) els.listSort.value = mode;
    renderList();
  }

  function setFlashSort(mode) {
    if (mode !== "id" && mode !== "added_desc" && mode !== "added_asc") return;
    if (autoplay) stopAutoplay();
    const currentId = currentCard()?.id ?? null;
    flashSortMode = mode;
    if (els.flashSort) els.flashSort.value = mode;
    // New sort: drop saved deck order so cards follow 加入日期 / id
    state.deckOrder = null;
    rebuildDeckFromFilter({ preferId: currentId });
  }

  function setFilter(filter) {
    if (filter !== "all" && filter !== "focus" && filter !== "unfocus") return;
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
    const filterLabel = filterLabelShort();
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
    const filterLabel = filterLabelFull();
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
    if (els.flashCard) els.flashCard.classList.remove("flipped");
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

      // After Cantonese + short pause: flip back to JP face first,
      // so the next word never briefly shows the previous ZH meaning.
      scheduleAutoplay(() => {
        if (!autoplay || token !== autoplayToken) return;
        flipped = false;
        els.flashCard.classList.toggle("flipped", false);
        scheduleAutoplay(() => {
          if (!autoplay || token !== autoplayToken) return;
          runAutoplayStep(token);
        }, AUTOPLAY_FLIP_BACK_MS);
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

  // Memo card gestures:
  // - Phone / touch: tap = speak Japanese (no flip); swipe L/R = flip
  // - Desktop mouse: click = flip (🔊 button still speaks)
  const SWIPE_THRESHOLD_PX = 40;
  const TAP_MAX_MOVE_PX = 14;
  const TAP_MAX_MS = 550;
  let touchTrack = null; // { x, y, t }
  let suppressCardClick = false;

  els.flashCard.addEventListener("click", (e) => {
    if (e.target.closest(".card-speak")) return;
    if (suppressCardClick) {
      suppressCardClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    flipCard();
  });

  els.flashCard.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest(".card-speak")) {
        touchTrack = null;
        return;
      }
      if (e.touches.length !== 1) {
        touchTrack = null;
        return;
      }
      const t = e.touches[0];
      touchTrack = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    { passive: true }
  );

  els.flashCard.addEventListener(
    "touchcancel",
    () => {
      touchTrack = null;
    },
    { passive: true }
  );

  els.flashCard.addEventListener(
    "touchend",
    (e) => {
      if (!touchTrack) return;
      const start = touchTrack;
      touchTrack = null;
      if (e.target.closest(".card-speak")) return;
      if (!deck.length) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const dt = Date.now() - start.t;

      // Horizontal swipe → flip (left or right)
      if (absX >= SWIPE_THRESHOLD_PX && absX > absY * 1.15) {
        suppressCardClick = true;
        flipCard();
        return;
      }

      // Tap → speak Japanese only (do not flip)
      if (absX <= TAP_MAX_MOVE_PX && absY <= TAP_MAX_MOVE_PX && dt <= TAP_MAX_MS) {
        suppressCardClick = true;
        const w = currentCard();
        if (w) speakJa(w.jp, { cancel: true });
      }
    },
    { passive: true }
  );

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

  if (els.listSort) {
    els.listSort.addEventListener("change", () => setListSort(els.listSort.value));
  }
  if (els.flashSort) {
    els.flashSort.addEventListener("change", () => setFlashSort(els.flashSort.value));
  }

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
    const rawVocab = await res.json();
    if (!Array.isArray(rawVocab)) throw new Error("vocab.json 格式錯誤");
    vocab = rawVocab.map((w) => ({
      id: Number(w.id),
      jp: String(w.jp || ""),
      zh: String(w.zh || ""),
      added_at: w.added_at ? String(w.added_at).slice(0, 10) : "2026-10-16",
    }));

    els.totalCount.textContent = String(vocab.length);
    if (els.listSort) els.listSort.value = listSortMode;
    if (els.flashSort) els.flashSort.value = flashSortMode;
    renderList();
    rebuildDeckFromFilter();

    setSyncStatus("syncing", "同步中…");
    await pullAndMergeFocus();
    startFocusSyncPolling();

    console.log(`[jp-vocab] loaded ${vocab.length} words`);
  }

  init().catch((err) => {
    console.error(err);
    els.wordList.innerHTML = `<li class="empty-state">載入失敗：${escapeHtml(err.message)}</li>`;
  });
})();
