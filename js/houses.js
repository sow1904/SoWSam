// Houses (가문): three families that held a corner of the land for a
// generation, and what let them. A force has a house's strength while one of
// the family rules it, and only on the family's home ground; away from it
// the same force pays for being what it is.
//
// why: 장로 kept 한중 for some twenty-five years, 사섭 kept 교주 for forty and
// the 공손 family 요동 for fifty. Hard roads did part of it (js/march.js); the
// rest was the people who ruled there. When 장로 yielded, 조조 moved the people
// of 한중 away: the strength had been the sect's, not the land's.
(function (S) {
  const inProv = (prov) => (p) => p.prov === prov;
  S.HOUSES = {
    wudou: {
      name: "오두미도", rulers: ["장로", "장위"], land: "한중",
      home: (p) => p.id === "hanzhong" || p.home === "hanzhong",
      help: "장로 가문이 다스리는 동안의 힘입니다.\n" +
        "한중에서: 치안이 매달 1 오르고 전쟁 피로로 떨어지지 않으며, 유민이 들어와 인구가 매달 0.3% 늘고, 호족 협력 목표가 15 높습니다. 성과 관문(양평관)을 지킬 때 전력이 15% 높습니다.\n" +
        "한중 밖에서: 교단이 낯선 땅이라 치안이 매달 1 떨어지고(40까지), 호족 협력 목표가 10 낮습니다.",
    },
    nanhai: {
      name: "남해 교역", rulers: ["사섭", "사휘", "사일", "사유", "사무", "사광"], land: "교주",
      home: inProv("jiao"),
      help: "사씨 가문이 다스리는 동안의 힘입니다.\n" +
        "교주에서: 금 수입이 25% 많고 상인과의 거래량이 두 배이며, 쳐들어온 적은 풍토병으로 사기가 10 낮은 채 싸움을 시작합니다.\n" +
        "교주 밖으로: 고향을 떠나 싸우는 군대는 사기가 10 낮은 채 싸움을 시작합니다.",
    },
    haidong: {
      name: "해동 자립", rulers: ["공손도", "공손강", "공손공", "공손연", "공손황"], land: "요동",
      home: inProv("liaodong"),
      help: "공손씨 가문이 다스리는 동안의 힘입니다.\n" +
        "요동에서: 성을 지킬 때 전력이 15% 높고, 난리를 피해 온 재야 인재가 저절로 드러나곤 합니다.\n" +
        "요동 밖에서: 변방의 정권을 따르지 않아 치안이 매달 1 떨어집니다(40까지).",
    },
  };
  const BY_RULER = {};
  for (const [k, h] of Object.entries(S.HOUSES)) for (const n of h.rulers) BY_RULER[n] = k;

  // The house of a force: its ruler's family, if it is one of the three.
  S.houseOf = function (state, fid) {
    const f = state && fid && state.forces[fid];
    const ruler = f && f.alive !== false && state.officers[f.ruler];
    return (ruler && BY_RULER[ruler.name]) || null;
  };
  // A place under a house: { key, home }. The game in play is S.GAME, so
  // rules that only know a city (income, say) can ask.
  S.houseAt = function (place, state) {
    state = state || S.GAME;
    const key = place && place.owner ? S.houseOf(state, place.owner) : null;
    return key ? { key, home: !!S.HOUSES[key].home(place) } : null;
  };
  const at = (place, key, home, state) => {
    const h = S.houseAt(place, state);
    return !!h && h.key === key && h.home === home;
  };

  // Multipliers and additions the other rules ask for.
  S.houseGold = (c) => (at(c, "nanhai", true) ? 1.25 : 1);
  S.houseTrade = (c) => (at(c, "nanhai", true) ? 2 : 1);
  S.houseConsent = (c) => (at(c, "wudou", true) ? 15 : at(c, "wudou", false) ? -10 : 0);
  S.houseCalm = (c) => at(c, "wudou", true); // weariness does not shake order
  S.houseDefense = (place, state) => (at(place, "haidong", true, state) || at(place, "wudou", true, state) ? 1.15 : 1);
  // Morale an attacker starts with, marching on a place.
  S.houseMorale = function (state, fid, targetId) {
    const t = S.place(state, targetId);
    let m = 0;
    if (t && at(t, "nanhai", true, state)) m -= 10; // the fevers of the south
    if (S.houseOf(state, fid) === "nanhai" && t && !S.HOUSES.nanhai.home(t)) m -= 10; // far from home
    return m;
  };
  // Each month, in a city under a house.
  S.houseMonth = function (state, c) {
    const h = S.houseAt(c, state);
    if (!h) return;
    if (h.key === "wudou" && h.home) {
      c.order = Math.min(100, c.order + 1);
      c.pop = Math.round(c.pop * 1.003);
    } else if ((h.key === "wudou" || h.key === "haidong") && !h.home) {
      if (c.order > 40) c.order -= 1;
    } else if (h.key === "haidong" && h.home && S.chance(state, 8)) {
      const hidden = S.officersIn(state, c.id, (o) => o.status === "free" && o.hidden);
      if (hidden.length) {
        const o = hidden[Math.floor(S.rand(state) * hidden.length)];
        o.hidden = false;
        if (c.owner === state.playerForce) S.addLog(state, `난리를 피해 ${c.name}에 와 있던 ${S.josa(o.name, "이", "가")} 이름을 드러냈습니다.`, "sys");
      }
    }
  };
  // A line for the panel: what the house means here.
  S.houseLabel = function (place, state) {
    const h = S.houseAt(place, state);
    if (!h) return "";
    return `${S.HOUSES[h.key].name} (${h.home ? "본거지" : "본거지 밖"})`;
  };
})(globalThis.SAM = globalThis.SAM || {});
