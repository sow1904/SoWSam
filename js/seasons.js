// Seasons (계절) and the calamities and harvests they bring.
//
//   봄 1-3월 · 여름 4-6월 · 가을 7-9월 · 겨울 10-12월
//
// On the first day of each season everything the season holds is settled at
// once, province (주) by province, and shown to the player on the small map
// (js/ui/seasons.js). A calamity lasts the season's three months and does
// its harm a third at a time, on the first day of each of them; only the
// harvest (9월) is reckoned once.
//
//   역병 (겨울): a province by chance, likelier where the cities are large;
//     some winters are plague years. People and men of fighting age die.
//     의술 spares a city now and then and lessens the toll.
//   가뭄 (여름): a province by chance, likelier in the dry north. That
//     autumn's harvest fails in part; no rich harvest, no flood.
//   홍수 (여름): city by city in 사례 (하남), 연주 and 예주 (중원). Men of
//     fighting age are lost through the summer and none return.
//   태풍 (여름): a province by chance, most on the southern and eastern
//     coasts, but inland too (one reached 낙양 in 190); not the horse
//     country, 익주 or 남중 behind their mountains. Timber yields fall.
//   작황 (가을): each province throws once a year: 흉작, 평작 or 풍작.
//   황충 (가을): 옹주, 사례, 형북, 연주, 예주, 청주, 서주, 기주. After a
//     swarm a province is clear; the chance then climbs back over five
//     years. It eats what is stored and most of the harvest.
// The harvest (9월) is multiplied by the crop, drought and locusts.
// why: the user's design.
(function (S) {
  const clamp = S.clamp;
  const SE = S.SEASON = {
    names: ["봄", "여름", "가을", "겨울"],
    plague: { prov: 0.08, size: 0.1, year: 10, yearMul: 3, toll: [0.1, 0.16], medicine: { spare: 0.25, toll: 0.2 } },
    drought: { prov: { liang: 0.15, bing: 0.12, yong: 0.12, sili: 0.1, ji: 0.1, you: 0.1, yan: 0.08, yu: 0.08, qing: 0.08, xu: 0.06 }, other: 0.04, harvest: 0.6 },
    flood: { provs: ["sili", "yan", "yu"], blocs: ["사례", "연주", "여영", "초패"], city: 0.13, manpower: 0.25 }, // 하남 (not 관중) and 중원
    typhoon: { prov: { jiao: 0.3, yang: 0.3, jingnan: 0.15, xu: 0.15, qing: 0.15, ji: 0.1, jingbei: 0.08, yu: 0.06, yan: 0.06, sili: 0.05 }, wood: 0.5 },
    crop: { odds: [0.25, 0.5, 0.25], mul: [0.65, 1, 1.35], names: ["흉작", "평작", "풍작"] },
    locust: { provs: ["yong", "sili", "jingbei", "yan", "yu", "qing", "xu", "ji"], years: 5, season: 0.3, harvest: 0.4, store: 0.3 },
  };
  SE.KINDS = { plague: "역병", drought: "가뭄", flood: "홍수", typhoon: "태풍", locust: "황충", crop: "작황" };
  // The season of a month: 0 봄 .. 3 겨울.
  S.seasonOf = (month) => Math.floor((month - 1) / 3);
  S.seasonName = (state) => SE.names[S.seasonOf(state.month)];
  const provCities = (state, prov) => Object.values(state.cities).filter((c) => c.prov === prov);
  const provName = (p) => S.PROVINCES[p] || p;
  const cal = (state) => (state.cal = state.cal || { locust: {}, crop: null, drought: null });
  const woe = (c) => (c.woe = c.woe || {});
  const fmtN = (n) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만` : String(n));
  // The month index at which the present season is over.
  const seasonEnd = (state) => S.monthsElapsed(state) + 3 - ((state.month - 1) % 3);

  // ---------- the season's roll ----------
  // Settle the season that begins today. Returns the news {key, year, season, items}.
  S.rollSeason = function (state) {
    const C = cal(state);
    const season = S.seasonOf(state.month);
    const until = seasonEnd(state);
    const items = [];
    const mine = (cs) => cs.some((c) => !!state.playerForce && c.owner === state.playerForce);
    let plagueYear = false;
    if (season === 3) {
      // 역병, province by province.
      const P = SE.plague;
      plagueYear = S.chance(state, P.year);
      for (const p of Object.keys(S.PROVINCES)) {
        const cs = provCities(state, p);
        if (!cs.length) continue;
        const size = cs.reduce((s, c) => s + c.size, 0) / cs.length;
        if (S.rand(state) >= P.prov * (0.7 + size * P.size) * (plagueYear ? P.yearMul : 1)) continue;
        const hit = [];
        for (const c of cs) {
          const med = c.owner ? S.techBonus(state, c.owner, "medicine") : 0;
          if (med && S.rand(state) < P.medicine.spare * med) continue; // physicians kept it out
          const toll = (P.toll[0] + S.rand(state) * (P.toll[1] - P.toll[0])) * (1 - P.medicine.toll * med);
          woe(c).plague = { until, toll };
          hit.push(c.id);
        }
        if (hit.length) items.push({ kind: "plague", prov: p, cities: hit });
      }
      const names = items.map((it) => provName(it.prov));
      if (names.length) S.addLog(state, `${plagueYear ? "역병이 크게 도는 해입니다. " : ""}${names.join(", ")}에 역병이 돕니다. 겨울 내내 백성이 죽어 갑니다.`,
        mine(items.flatMap((it) => it.cities.map((id) => state.cities[id]))) ? "warn" : "sys");
    } else if (season === 1) {
      // 가뭄 for the year's harvest, then 홍수 and 태풍.
      C.drought = { year: state.year, provs: [] };
      for (const p of Object.keys(S.PROVINCES)) {
        if (S.rand(state) >= (SE.drought.prov[p] != null ? SE.drought.prov[p] : SE.drought.other)) continue;
        C.drought.provs.push(p);
        items.push({ kind: "drought", prov: p });
      }
      const flooded = [];
      for (const p of SE.flood.provs) {
        if (C.drought.provs.includes(p)) continue; // a dry year floods no river
        for (const c of provCities(state, p)) {
          if (!SE.flood.blocs.includes(S.blocOf(c.id)) || S.rand(state) >= SE.flood.city) continue;
          woe(c).flood = { until };
          flooded.push(c);
          items.push({ kind: "flood", city: c.id });
        }
      }
      const stormed = [];
      for (const [p, pr] of Object.entries(SE.typhoon.prov)) {
        if (S.rand(state) >= pr) continue;
        for (const c of provCities(state, p)) woe(c).typhoon = { until };
        stormed.push(p);
        items.push({ kind: "typhoon", prov: p });
      }
      const parts = [C.drought.provs.length && `가뭄: ${C.drought.provs.map(provName).join(", ")}`, flooded.length && `홍수: ${flooded.map((c) => c.name).join(", ")}`,
        stormed.length && `태풍: ${stormed.map(provName).join(", ")}`].filter(Boolean);
      if (parts.length) S.addLog(state, `올여름 — ${parts.join(" / ")}.`, mine(flooded.concat(stormed.flatMap((p) => provCities(state, p)), C.drought.provs.flatMap((p) => provCities(state, p)))) ? "warn" : "sys");
    } else if (season === 2) {
      // 황충: the longer since the last swarm, the likelier.
      const L = SE.locust;
      const swarm = [];
      for (const p of L.provs) {
        if (C.locust[p] == null) C.locust[p] = state.year - Math.floor(S.rand(state) * (L.years + 1)); // the land as the game finds it
        const ripe = clamp((state.year - C.locust[p]) / L.years, 0, 1);
        if (!(ripe > 0 && S.rand(state) < L.season * ripe)) continue;
        C.locust[p] = state.year;
        swarm.push(p);
        for (const c of provCities(state, p)) woe(c).locust = { until, year: state.year };
        items.push({ kind: "locust", prov: p });
      }
      // 작황, by province; no rich harvest where it is dry or the locusts come.
      C.crop = { year: state.year, prov: {} };
      const dry = C.drought && C.drought.year === state.year ? C.drought.provs : [];
      const by = [[], [], []];
      for (const p of Object.keys(S.PROVINCES)) {
        const r = S.rand(state);
        let k = r < SE.crop.odds[0] ? 0 : r < SE.crop.odds[0] + SE.crop.odds[1] ? 1 : 2;
        if (k === 2 && (dry.includes(p) || swarm.includes(p))) k = 1;
        C.crop.prov[p] = k;
        by[k].push(p);
        if (k !== 1) items.push({ kind: "crop", prov: p, crop: k });
      }
      if (swarm.length) S.addLog(state, `${swarm.map(provName).join(", ")}에 메뚜기 떼(황충)가 일었습니다. 가을 내내 쌓아 둔 군량을 갉아먹고 올해 수확을 망칩니다.`,
        mine(swarm.flatMap((p) => provCities(state, p))) ? "warn" : "sys");
      S.addLog(state, `올해 작황 — 풍작: ${by[2].map(provName).join(", ") || "없음"} / 흉작: ${by[0].map(provName).join(", ") || "없음"}. 나머지는 평작입니다.`, "sys");
    }
    const news = { key: `${state.year}-${season}`, year: state.year, season, items, plagueYear };
    state.seasonNews = news;
    return news;
  };
  S.locustRipe = (state, p) => {
    const C = cal(state);
    return C.locust[p] == null ? null : clamp((state.year - C.locust[p]) / SE.locust.years, 0, 1);
  };

  // ---------- each month of the season: a third of the harm ----------
  function monthHarm(state) {
    const M = S.monthsElapsed(state);
    const notes = [];
    for (const c of Object.values(state.cities)) {
      const w = c.woe;
      if (!w) continue;
      if (w.plague && w.plague.until > M) {
        const k = w.plague.toll / 3;
        const dead = Math.round(c.pop * k);
        c.pop -= dead;
        c.manpower = Math.max(0, Math.round(c.manpower * (1 - k)));
        if (state.playerForce && c.owner === state.playerForce) notes.push(`${c.name} ${fmtN(dead)}명`);
      }
      if (w.flood && w.flood.until > M) c.manpower = Math.max(0, Math.round(c.manpower * (1 - SE.flood.manpower / 3)));
      if (w.locust && w.locust.until > M) c.food = Math.max(0, Math.round(c.food * (1 - SE.locust.store / 3)));
    }
    if (notes.length) S.addLog(state, `역병으로 이번 달 백성이 죽었습니다: ${notes.join(", ")}.`, "warn");
  }

  // Each day: a new season is settled on its first day; the harm falls on the 1st of each month.
  S.runSeasons = function (state) {
    if ((state.day || 1) !== 1) return;
    const C = cal(state);
    const M = S.monthsElapsed(state);
    if ((state.month - 1) % 3 === 0) {
      const key = `${state.year}-${S.seasonOf(state.month)}`;
      if (!state.seasonNews || state.seasonNews.key !== key) S.rollSeason(state);
    }
    if (C.harmed === M) return;
    C.harmed = M;
    monthHarm(state);
  };

  // ---------- what it does to a city ----------
  const live = (state, x) => !!x && typeof x === "object" && x.until > S.monthsElapsed(state);
  // The harvest this year: crop, drought, locusts.
  S.harvestMul = function (state, c) {
    const C = cal(state);
    let m = 1;
    if (C.crop && C.crop.year === state.year && C.crop.prov[c.prov] != null) m *= SE.crop.mul[C.crop.prov[c.prov]];
    if (C.drought && C.drought.year === state.year && C.drought.provs.includes(c.prov)) m *= SE.drought.harvest;
    if (c.woe && c.woe.locust && c.woe.locust.year === state.year) m *= SE.locust.harvest;
    return m;
  };
  // What weighs on a city now: [{kind, label}].
  S.woesOf = function (state, c) {
    const out = [];
    const w = c.woe || {}, C = cal(state);
    const autumn = state.month <= 9;
    if (live(state, w.plague)) out.push({ kind: "plague", label: `역병 (석 달에 걸쳐 인구 -${Math.round(w.plague.toll * 100)}%)` });
    if (live(state, w.flood)) out.push({ kind: "flood", label: `홍수 (병역 인구 -${Math.round(SE.flood.manpower * 100)}%, 회복 없음)` });
    if (live(state, w.typhoon)) out.push({ kind: "typhoon", label: `태풍 (목재 생산 ${Math.round(SE.typhoon.wood * 100)}%)` });
    if (live(state, w.locust)) out.push({ kind: "locust", label: `황충 (비축 군량 -${Math.round(SE.locust.store * 100)}%, 수확 ${Math.round(SE.locust.harvest * 100)}%)` });
    if (autumn && C.drought && C.drought.year === state.year && C.drought.provs.includes(c.prov)) out.push({ kind: "drought", label: `가뭄 (수확 ${Math.round(SE.drought.harvest * 100)}%)` });
    if (autumn && C.crop && C.crop.year === state.year && C.crop.prov[c.prov] != null && C.crop.prov[c.prov] !== 1) {
      const k = C.crop.prov[c.prov];
      out.push({ kind: k ? "rich" : "crop", label: `${SE.crop.names[k]} (수확 ${Math.round(SE.crop.mul[k] * 100)}%)` });
    }
    return out;
  };
  // A flooded city's men do not come back; a storm-felled forest yields less.
  const regen = S.manpowerRegen;
  S.manpowerRegen = function (c) {
    const st = S.GAME;
    if (st && c.woe && live(st, c.woe.flood)) return 0;
    return regen.apply(this, arguments);
  };
  const resYield = S.resYield;
  S.resYield = function (c, k) {
    const v = resYield.apply(this, arguments);
    const st = S.GAME;
    if (k === "wood" && st && c.woe && live(st, c.woe.typhoon)) return Math.round(v * SE.typhoon.wood);
    return v;
  };
})(globalThis.SAM = globalThis.SAM || {});
