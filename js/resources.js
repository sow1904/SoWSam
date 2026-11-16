// Resources (자원) and regional traits (지역 특성).
// Every city stores wood (목재), iron (철) and horses (말) in c.res. Wood and
// iron come from every city, more where the province is known for them;
// horses come mostly from the northern and western horse country. Provinces
// also lean the gold, food and population economy their way.
// Drafting troops will spend these by unit type.
(function (S) {
  S.RESOURCES = { wood: "목재", iron: "철", horse: "말" };
  S.RES_KEYS = Object.keys(S.RESOURCES);

  // Multipliers by province. Missing keys are 1, except horses: see HORSES.
  // why: horse country is 량주 (서량 기병, Qiang and Di herds), 병주 (Lü Bu's
  // cavalry, the Xiongnu border) and 유주 (Gongsun Zan's white horses, the
  // Wuhuan). 기주 and 익주 are granaries, 사례 and 교주 trade hubs, 청주 and 서주
  // home to many Han iron offices, 형주 and 양주 the Yangzi forests (남양 완현
  // was also a famed ironworks). 옹주 (관중 and 롱우) and 요동 raise horses
  // too, and 남중 is forest.
  // Horses are bred everywhere, but few away from the herds: the north China
  // plain raises a third of what 유주 does, and 촉 and 오 (the rest) half of that.
  S.REGION = {
    liang: { horse: 2, label: "말(많음)" },
    bing: { horse: 1, label: "말" },
    you: { horse: 1, label: "말" },
    ji: { food: 1.25, pop: 1.5, label: "군량, 인구" },
    yi: { food: 1.25, gold: 1.2, label: "군량, 금" },
    sili: { gold: 1.2, label: "금" },
    jiao: { gold: 1.2, label: "금" },
    qing: { iron: 1.5, gold: 1.2, label: "철, 금" },
    xu: { iron: 1.5, label: "철" },
    yan: { pop: 1.5, label: "인구" },
    yu: { pop: 1.5, label: "인구" },
    jingbei: { wood: 1.5, iron: 1.25, label: "목재, 철" },
    jingnan: { wood: 1.5, iron: 1.25, label: "목재, 철" },
    yong: { horse: 1, label: "말" },
    liaodong: { horse: 1, label: "말" },
    nanzhong: { wood: 1.5, label: "목재" },
    yang: { wood: 1.5, label: "목재" },
  };
  S.regionMul = (c, key) => {
    const r = S.REGION[c.prov] || {};
    if (r[key] != null) return r[key];
    return key === "horse" ? (PLAIN.includes(c.prov) ? 0.3 : 0.15) : 1;
  };
  const PLAIN = ["sili", "ji", "yan", "yu", "qing", "xu", "jingbei"]; // 하북과 중원
  // Horse country proper: where cavalry is the custom and horses are cheap.
  S.horseCountry = (c) => S.regionMul(c, "horse") >= 1;
  S.regionLabel = (prov) => (S.REGION[prov] || {}).label || "";

  // Monthly yield before order: by city size, scaled by the province.
  // One unit equips one soldier (a spear, a bow, a horse).
  const BASE = { wood: (c) => 200 + c.size * 100, iron: (c) => 160 + c.size * 80, horse: (c) => 150 + c.size * 75 };
  const FIELD = { wood: "logging", iron: "smelting", horse: "stud" }; // js/tech.js
  S.resYield = (c, k) => Math.round(BASE[k](c) * S.regionMul(c, k) * (0.5 + c.order / 200) * (S.techMul ? S.techMul(c, FIELD[k]) : 1));

  // Kinds of land a domestic technology needs (js/tech.js): a force must hold
  // one such city to study the field and to profit by it.
  // why: pasture is the horse country above. Salt is where the Han kept salt
  // offices (염관), as this game reads the list: the salt lake of 하동 안읍,
  // the shores of 발해, 청주 and 요동, 광릉 where the kings of 오 boiled sea
  // water, 오군 해염, the brine wells of 촉 and 파, 농서, and 남해 번우.
  S.LAND = {
    pasture: { name: "목장", label: "말의 땅(량주, 병주, 유주, 옹주, 요동)", has: (c) => S.horseCountry(c) },
    salt: { name: "소금", label: "소금이 나는 도시(하동, 발해, 북해, 동래, 광릉, 오군, 성도, 파군, 농서, 요동, 남해)",
      cities: ["hedong", "bohai", "beihai", "donglai", "guangling", "wujun", "shujun", "bajun", "longxi", "liaodong", "nanhai"] },
  };
  S.landHas = (kind, c) => { const l = S.LAND[kind]; return !!l && !!c && (l.cities ? l.cities.includes(c.id) : l.has(c)); };
  S.holdsLand = (state, fid, kind) => !!fid && S.citiesOf(state, fid).some((c) => S.landHas(kind, c));
  S.landsHere = (c) => Object.keys(S.LAND).filter((k) => S.landHas(k, c));
  // Storehouses hold about two years of output, at least a modest stock.
  S.resCap = (c, k) => Math.max(10000, Math.round(BASE[k](c) * Math.max(1, S.regionMul(c, k)) * 24));

  S.emptyRes = () => ({ wood: 0, iron: 0, horse: 0 });
  // Opening stock: half a year of output, and a few horses traded south.
  S.initRes = function (c) {
    c.res = S.emptyRes();
    for (const k of S.RES_KEYS) c.res[k] = Math.round(BASE[k](c) * Math.max(S.regionMul(c, k), k === "horse" ? 0.3 : 1) * 6);
  };
  S.produceRes = function (c) {
    for (const k of S.RES_KEYS) c.res[k] = Math.min(S.resCap(c, k), c.res[k] + S.resYield(c, k));
  };
  // A cargo object with only the listed resources, clamped to what c holds.
  S.takeRes = function (c, want) {
    const out = S.emptyRes();
    for (const k of S.RES_KEYS) {
      out[k] = Math.max(0, Math.min(c.res[k], Math.floor((want && want[k]) || 0)));
      c.res[k] -= out[k];
    }
    return out;
  };
  S.addRes = function (c, res) {
    if (!res || !c.res) return;
    for (const k of S.RES_KEYS) c.res[k] += res[k] || 0;
  };
  S.resText = (res) => S.RES_KEYS.filter((k) => res && res[k]).map((k) => `${S.RESOURCES[k]} ${res[k]}`).join(", ");
})(globalThis.SAM = globalThis.SAM || {});
