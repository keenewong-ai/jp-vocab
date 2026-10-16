/**
 * Client-side daily sentence generator for jp-vocab.
 * Builds up to 20 short everyday JP sentences from 重點關注 words.
 */
(function (global) {
  "use strict";

  const SKIP = new Set([
    "は", "が", "を", "に", "で", "と", "も", "の", "から", "まで", "ね", "か", "な",
    "です", "じゃあ", "ええと", "〇", "さん", "と言います", "さんは", "はいますか",
    "はすきですか", "何ですか", "どうですか", "じゃない", "ができます", "があります",
    "にすんでいます", "がたのしみです", "よろしくおねがいします", "おねがいします",
    "ありがとうございます", "すみません", "はじめまして", "こんにちは", "こんばんは",
    "またあした", "いらっしゃい", "はい", "いいえ", "ください", "おなまえは",
    "どの", "その", "あの", "この", "これ", "それ", "あれ", "ここ", "そこ", "あそこ",
    "どこ", "いつ", "なに", "何", "どう", "どんな", "あまり", "もっと", "すこし",
    "とても", "よく", "ときどき", "いつも", "たぶん", "まだ", "ちゃんと", "ほんとうに",
    "いっしょに", "ひとりで", "とちゅうで", "このあと", "ぐらい", "ごろ", "はん",
    "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二",
    "百", "千", "六百", "〇", "いち", "に", "じ", "さい", "人", "日", "時", "分",
    "円", "えん", "もの", "ところ", "あと", "さいご", "なま", "WiFi", "ATM", "RPG",
  ]);

  const FOOD = new Set([
    "おさら", "ナイフ", "フォーク", "カップ", "フライドチキン", "ポテトチップス",
    "チャーハン", "フライドポテト", "ビール", "ぶたにく", "コーラ", "とんかつ",
    "しお", "ソース", "ぎゅうどん", "魚", "とうふ", "やさい", "しょうゆ", "卵",
    "にく", "ステーキ", "ワイン", "ホットドッグ", "ポップコーン", "おかし",
    "デザート", "パイ", "チョコレート", "いちご", "クッキー", "まっちゃ",
    "カップケーキ", "ドーナツ", "チーズケーキ", "アイスコーヒー", "アイスクリーム",
    "こうちゃ", "みそしる", "そば", "おにぎり", "水", "てんぷら", "うどん", "ココア",
    "カレー", "ばんごはん", "ひるごはん", "パスタ", "べんとう", "ジュース", "コーヒー",
    "あさごはん", "サンドイッチ", "パン", "ごはん", "おちゃ", "みず", "すし", "ケーキ",
    "ピザ", "サラダ", "ラーメン", "ていしょく", "フランスりょうり",
  ]);

  const DRINK = new Set([
    "ビール", "コーラ", "ワイン", "アイスコーヒー", "こうちゃ",
    "水", "ココア", "ジュース", "コーヒー", "おちゃ", "みず",
  ]);

  const PLACE = new Set([
    "でんきや", "百円ショップ", "家", "バー", "カラオケ", "しょくどう", "スーパー",
    "どうぶつえん", "ひろば", "びじゅつかん", "えいがかん", "じんじゃ", "おてら",
    "はらじゅく", "びょういん", "いえ", "アパート", "カフェ", "レストラン", "ケーキや",
    "ピザや", "ラーメンや", "本や", "こうえん", "うえのこうえん", "あさくさ", "あきはばら",
    "しぶや", "おんせん", "プール", "だいがく", "えき", "デパート", "バスてい",
    "コンビニ", "ホテル", "くうこう", "ちかてつ", "リビング", "キッチン", "おふろ",
    "ふじさん", "東京", "京都", "おおさか", "日本", "にほん", "フランス", "かんこく",
    "ちゅうごく", "イギリス", "たいわん", "ソウル", "トロント", "ニューヨーク",
    "アメリカ", "カナダ", "ブラジル", "ベトナム", "オーストラリア", "インドネシア",
  ]);

  const TIME = new Set([
    "ごご", "ごぜん", "ひる休み", "木曜日", "来月", "きょう", "こんしゅう", "九時",
    "四時", "七時", "まいあさ", "まいばん", "まいにち", "まいしゅう", "らいしゅう",
    "あした", "しゅうまつ", "日曜日", "土曜日", "ふゆ", "あき", "なつ", "はる",
    "九月", "七月", "いま", "休み",
  ]);

  const PERSON = new Set([
    "いとこ", "クライアント", "エンジニア", "はいゆう", "かんとく", "ごりょうしん",
    "ごかぞく", "おこさん", "こども", "おにいさん", "いもうと", "いもうとさん",
    "おとうと", "おとうとさん", "おねえさん", "きょうだい", "あね", "あに", "かぞく",
    "母", "父", "かのじょ", "かれし", "ともだち", "がくせい", "ひと", "べんごし",
    "せんせい", "いしゃ", "コーチ", "私",
  ]);

  const IADJ = new Set([
    "むずかしい", "しょっぱい", "高い", "あぶない", "せまい", "いい", "ひろい",
    "ちかい", "とおい", "あまい", "小さい", "大きい", "さむい", "あつい", "あたたかい",
    "ながい", "はやい", "たかい", "くろい", "やすい", "かわいい", "あおい", "新しい",
    "ほしい", "古い", "おもしろい", "あかるい", "しろい", "あかい", "おいしい",
    "ちいさい", "おおきい", "かっこいい", "やさしい",
  ]);

  const NAADJ = new Set([
    "げんき", "だいすき", "すてき", "おしゃれ", "ゆうめい", "ひま", "すき",
    "しずか", "きれい", "にぎやか", "だいじょうぶ",
  ]);

  function primaryZh(zh) {
    const s = String(zh || "");
    const part = s.split(/[，,、]/)[0].trim();
    return part || s;
  }

  function classify(w) {
    const jp = w.jp;
    if (SKIP.has(jp)) return "skip";
    if (/ます$/.test(jp) || /します$/.test(jp)) return "verb";
    if (DRINK.has(jp)) return "drink";
    if (FOOD.has(jp)) return "food";
    if (PLACE.has(jp)) return "place";
    if (TIME.has(jp)) return "time";
    if (PERSON.has(jp)) return "person";
    if (IADJ.has(jp)) return "iadj";
    if (NAADJ.has(jp)) return "naadj";
    return "noun";
  }

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Fallback fillers (romaji included) when a slot needs a non-focus word
  const FILL = {
    food: { jp: "ごはん", zh: "飯", romaji: "gohan" },
    drink: { jp: "コーヒー", zh: "咖啡", romaji: "koohii" },
    place: { jp: "えき", zh: "車站", romaji: "eki" },
    time: { jp: "あした", zh: "明天", romaji: "ashita" },
    person: { jp: "ともだち", zh: "朋友", romaji: "tomodachi" },
    noun: { jp: "ほん", zh: "書", romaji: "hon" },
    iadj: { jp: "おいしい", zh: "好吃", romaji: "oishii" },
    verb: { jp: "行きます", zh: "去", romaji: "ikimasu" },
  };

  function fillOf(type, pools, usedIds) {
    const pool = pools[type] || [];
    const fresh = pool.filter((w) => !usedIds.has(w.id));
    const w = pick(fresh.length ? fresh : pool) || FILL[type] || FILL.noun;
    if (w && w.id != null) usedIds.add(w.id);
    return w;
  }

  function makeSentence(jp, zh, romaji, focusWords) {
    return {
      jp,
      zh,
      romaji: romaji || "",
      focusIds: (focusWords || []).filter(Boolean).map((w) => w.id),
      focusLabels: (focusWords || []).filter(Boolean).map((w) => w.jp),
    };
  }

  function buildPools(focusWords) {
    const pools = {
      any: [],
      verb: [],
      food: [],
      drink: [],
      place: [],
      time: [],
      person: [],
      iadj: [],
      naadj: [],
      noun: [],
    };
    for (const w of focusWords) {
      const t = classify(w);
      if (t === "skip") continue;
      pools.any.push(w);
      if (!pools[t]) pools[t] = [];
      pools[t].push(w);
      if (t === "food" || t === "drink" || t === "place" || t === "person" || t === "noun") {
        if (t !== "noun") pools.noun.push(w);
      }
      if (t === "drink") pools.food.push(w); // drinks also usable in meal contexts carefully
    }
    return pools;
  }

  /**
   * Template builders: each returns a sentence or null.
   * Prefer using at least one focus word from `star` (the featured focus word).
   */
  function templatesFor(star, pools) {
    const t = classify(star);
    const used = new Set([star.id]);
    const zh0 = primaryZh(star.zh);
    const r0 = star.romaji || star.jp;
    const list = [];
    const isThing = t === "food" || t === "drink" || t === "place" || t === "person" || t === "noun" || t === "time";

    // —— Universal for "thing-like" words only (not verbs / adjectives) ——
    if (isThing && t !== "time") {
      list.push(() =>
        makeSentence(
          `これは${star.jp}です。`,
          `這是${zh0}。`,
          `kore wa ${r0} desu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}がすきです。`,
          `我喜歡${zh0}。`,
          `${r0} ga suki desu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}はどこですか。`,
          `${zh0}在哪裏？`,
          `${r0} wa doko desu ka.`,
          [star]
        )
      );
    }

    if (t === "verb") {
      list.push(() =>
        makeSentence(
          `私は${star.jp}。`,
          `我會${zh0}。`,
          `watashi wa ${r0}.`,
          [star]
        )
      );
      list.push(() => {
        const time = fillOf("time", pools, used) || FILL.time;
        return makeSentence(
          `${time.jp}${star.jp}。`,
          `${primaryZh(time.zh)}${zh0}。`,
          `${time.romaji || time.jp} ${r0}.`,
          [star, time.id != null ? time : null]
        );
      });
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${place.jp}で${star.jp}。`,
          `在${primaryZh(place.zh)}${zh0}。`,
          `${place.romaji || place.jp} de ${r0}.`,
          [star, place.id != null ? place : null]
        );
      });
      list.push(() =>
        makeSentence(
          `いっしょに${star.jp}か。`,
          `一齊${zh0}嗎？`,
          `isshoni ${r0} ka.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `よく${star.jp}。`,
          `我經常${zh0}。`,
          `yoku ${r0}.`,
          [star]
        )
      );
    }

    if (t === "food") {
      list.push(() =>
        makeSentence(
          `${star.jp}を食べます。`,
          `我喫${zh0}。`,
          `${r0} o tabemasu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}をください。`,
          `請給我${zh0}。`,
          `${r0} o kudasai.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}はおいしいです。`,
          `${zh0}很好喫。`,
          `${r0} wa oishii desu.`,
          [star]
        )
      );
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${place.jp}で${star.jp}を買います。`,
          `喺${primaryZh(place.zh)}買${zh0}。`,
          `${place.romaji || place.jp} de ${r0} o kaimasu.`,
          [star, place.id != null ? place : null]
        );
      });
      list.push(() =>
        makeSentence(
          `きょうのばんごはんは${star.jp}です。`,
          `今晚晚飯係${zh0}。`,
          `kyou no bangohan wa ${r0} desu.`,
          [star]
        )
      );
    }

    if (t === "drink") {
      list.push(() =>
        makeSentence(
          `${star.jp}を飲みます。`,
          `我飲${zh0}。`,
          `${r0} o nomimasu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}をください。`,
          `請給我${zh0}。`,
          `${r0} o kudasai.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `あつい${star.jp}がほしいです。`,
          `想要熱嘅${zh0}。`,
          `atsui ${r0} ga hoshii desu.`,
          [star]
        )
      );
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${place.jp}で${star.jp}を飲みます。`,
          `喺${primaryZh(place.zh)}飲${zh0}。`,
          `${place.romaji || place.jp} de ${r0} o nomimasu.`,
          [star, place.id != null ? place : null]
        );
      });
    }

    if (t === "place") {
      list.push(() =>
        makeSentence(
          `${star.jp}に行きます。`,
          `我去${zh0}。`,
          `${r0} ni ikimasu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}はちかいです。`,
          `${zh0}好近。`,
          `${r0} wa chikai desu.`,
          [star]
        )
      );
      list.push(() => {
        const time = fillOf("time", pools, used) || FILL.time;
        return makeSentence(
          `${time.jp}${star.jp}に行きます。`,
          `${primaryZh(time.zh)}去${zh0}。`,
          `${time.romaji || time.jp} ${r0} ni ikimasu.`,
          [star, time.id != null ? time : null]
        );
      });
      list.push(() =>
        makeSentence(
          `${star.jp}で会います。`,
          `喺${zh0}見面。`,
          `${r0} de aimasu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}はにぎやかです。`,
          `${zh0}好熱鬧。`,
          `${r0} wa nigiyaka desu.`,
          [star]
        )
      );
    }

    if (t === "time") {
      list.push(() =>
        makeSentence(
          `${star.jp}はひまです。`,
          `${zh0}我有空。`,
          `${r0} wa hima desu.`,
          [star]
        )
      );
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${star.jp}${place.jp}に行きます。`,
          `${zh0}去${primaryZh(place.zh)}。`,
          `${r0} ${place.romaji || place.jp} ni ikimasu.`,
          [star, place.id != null ? place : null]
        );
      });
      list.push(() => {
        const food = fillOf("food", pools, used) || FILL.food;
        return makeSentence(
          `${star.jp}${food.jp}を食べます。`,
          `${zh0}喫${primaryZh(food.zh)}。`,
          `${r0} ${food.romaji || food.jp} o tabemasu.`,
          [star, food.id != null ? food : null]
        );
      });
      list.push(() =>
        makeSentence(
          `${star.jp}なにをしますか。`,
          `${zh0}做咩？`,
          `${r0} nani o shimasu ka.`,
          [star]
        )
      );
    }

    if (t === "person") {
      list.push(() =>
        makeSentence(
          `${star.jp}と話します。`,
          `同${zh0}傾偈。`,
          `${r0} to hanashimasu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}はげんきです。`,
          `${zh0}精神好好。`,
          `${r0} wa genki desu.`,
          [star]
        )
      );
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${star.jp}と${place.jp}に行きます。`,
          `同${zh0}去${primaryZh(place.zh)}。`,
          `${r0} to ${place.romaji || place.jp} ni ikimasu.`,
          [star, place.id != null ? place : null]
        );
      });
      list.push(() =>
        makeSentence(
          `${star.jp}に会います。`,
          `同${zh0}見面。`,
          `${r0} ni aimasu.`,
          [star]
        )
      );
    }

    if (t === "iadj") {
      list.push(() =>
        makeSentence(
          `とても${star.jp}です。`,
          `非常${zh0}。`,
          `totemo ${r0} desu.`,
          [star]
        )
      );
      list.push(() => {
        // Prefer place/person for natural 「このXは形容詞」
        const prefer = [...(pools.place || []), ...(pools.person || [])];
        const fresh = prefer.filter((w) => !used.has(w.id));
        let noun = fresh.length
          ? fresh[Math.floor(Math.random() * fresh.length)]
          : prefer.length
            ? prefer[Math.floor(Math.random() * prefer.length)]
            : fillOf("place", pools, used) || FILL.place;
        if (noun && noun.id != null) used.add(noun.id);
        return makeSentence(
          `この${noun.jp}は${star.jp}です。`,
          `呢個${primaryZh(noun.zh)}好${zh0}。`,
          `kono ${noun.romaji || noun.jp} wa ${r0} desu.`,
          [star, noun.id != null ? noun : null]
        );
      });
      list.push(() =>
        makeSentence(
          `きょうは${star.jp}です。`,
          `今日好${zh0}。`,
          `kyou wa ${r0} desu.`,
          [star]
        )
      );
    }

    if (t === "naadj") {
      list.push(() =>
        makeSentence(
          `${star.jp}ですね。`,
          `${zh0}呀。`,
          `${r0} desu ne.`,
          [star]
        )
      );
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${place.jp}は${star.jp}です。`,
          `${primaryZh(place.zh)}好${zh0}。`,
          `${place.romaji || place.jp} wa ${r0} desu.`,
          [star, place.id != null ? place : null]
        );
      });
      list.push(() =>
        makeSentence(
          `私は${star.jp}です。`,
          `我好${zh0}。`,
          `watashi wa ${r0} desu.`,
          [star]
        )
      );
    }

    if (t === "noun") {
      list.push(() =>
        makeSentence(
          `${star.jp}を買います。`,
          `我會買${zh0}。`,
          `${r0} o kaimasu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `新しい${star.jp}がほしいです。`,
          `想要新嘅${zh0}。`,
          `atarashii ${r0} ga hoshii desu.`,
          [star]
        )
      );
      list.push(() =>
        makeSentence(
          `${star.jp}をつかいます。`,
          `我會用${zh0}。`,
          `${r0} o tsukaimasu.`,
          [star]
        )
      );
      list.push(() => {
        const place = fillOf("place", pools, used) || FILL.place;
        return makeSentence(
          `${place.jp}で${star.jp}を見ます。`,
          `喺${primaryZh(place.zh)}睇／搵${zh0}。`,
          `${place.romaji || place.jp} de ${r0} o mimasu.`,
          [star, place.id != null ? place : null]
        );
      });
      list.push(() =>
        makeSentence(
          `${star.jp}があります。`,
          `有${zh0}。`,
          `${r0} ga arimasu.`,
          [star]
        )
      );
    }

    return list;
  }

  function focusHash(ids) {
    return normalizeIds(ids).join(",");
  }

  function normalizeIds(ids) {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /**
   * @param {Array<{id:number,jp:string,zh:string,romaji:string}>} focusWords
   * @param {{count?:number}} opts
   */
  function generate(focusWords, opts = {}) {
    const count = opts.count || 20;
    const content = (focusWords || []).filter((w) => classify(w) !== "skip");
    const poolSource = content.length ? content : focusWords || [];
    if (!poolSource.length) return [];

    const pools = buildPools(poolSource);
    // Ensure any-pool has something
    if (!pools.any.length) {
      pools.any = [...poolSource];
    }

    const sentences = [];
    const seenJp = new Set();
    const stars = shuffle(pools.any.length ? pools.any : poolSource);

    // Round-robin featured focus words so each gets used
    let starIdx = 0;
    let guard = 0;
    while (sentences.length < count && guard < count * 40) {
      guard++;
      const star = stars[starIdx % stars.length];
      starIdx++;
      const builders = shuffle(templatesFor(star, pools));
      let added = false;
      for (const build of builders) {
        try {
          const s = build();
          if (!s || !s.jp || seenJp.has(s.jp)) continue;
          seenJp.add(s.jp);
          sentences.push(s);
          added = true;
          break;
        } catch {
          /* skip bad template */
        }
      }
      if (!added) {
        // ultimate fallback
        const zh0 = primaryZh(star.zh);
        const jp = `「${star.jp}」を覚えます。`;
        if (!seenJp.has(jp)) {
          seenJp.add(jp);
          sentences.push(
            makeSentence(
              jp,
              `我會記住「${zh0}」。`,
              `"${star.romaji || star.jp}" o oboemasu.`,
              [star]
            )
          );
        }
      }
    }

    return sentences.slice(0, count);
  }

  global.JpVocabSentenceGen = {
    generate,
    focusHash,
    todayKey,
    classify,
    MIN_FOCUS: 5,
  };
})(typeof window !== "undefined" ? window : globalThis);
