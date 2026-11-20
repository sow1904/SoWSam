// Factions (파벌) inside a force.
//
// Every officer of a force belongs to at most one faction, decided in this
// order:
//   종친 - the ruler's own clan.
//   원종 - those bound to the ruler by an old, close tie (70 or more):
//          sworn brothers, trusted lieutenants, old friends.
//   한조파 - in the force that keeps 헌제, those who hold the Han dear
//          (한조중시); see js/hanplot.js.
//   구신 - those who came over together from one other force (by capture,
//          surrender, or the fall of their lord): three or more of them make
//          "<that force> 구신".
//   지역 - otherwise by home district (본관), grouped into the regions the
//          histories speak of (여영, 초패, 회사, 강동, 형주, 익주, 동주 aside).
// A group of one is no faction (무파벌).
// Factions decide nothing yet; succession, rebellion and court strife build
// on them.
// why: the user's design: factions by origin and by the road they joined.
(function (S) {
  const F = S.FACTION = { old: 70, turned: 3 };
  // Regions by home city. Mostly the provinces, with the splits the histories
  // make: 여영 (여남·영천, the scholars), 초패 (조씨 and 하후씨 country), 회사
  // (the 회수 and 사수 lands that sent men to 손씨), 강동 south of the river.
  const BLOC = {
    henan: "사례", henei: "사례", hedong: "사례", hongnong: "사례",
    yingchuan: "여영", runan: "여영", peiguo: "초패", qiao: "초패",
    chenliu: "연주", dongjun: "연주", shanyang: "연주", taishan: "연주",
    weijun: "기주", julu: "기주", changshan: "기주", hejian: "기주", bohai: "기주", pingyuan: "기주",
    zhuo: "유주", guangyang: "유주", daijun: "유주", liaoxi: "유주",
    liaodong: "요동", xuantu: "요동", lelang: "요동", daifang: "요동",
    shangdang: "병주", taiyuan: "병주", yanmen: "병주", xihe: "병주",
    xiapi: "회사", pengcheng: "회사", guangling: "회사", donghai: "서주", jiujiang: "회사", lujiang: "회사",
    qiguo: "청주", beihai: "청주", jinan: "청주", donglai: "청주",
    jingzhao: "관중", zuopingyi: "관중", youfufeng: "관중",
    hanyang: "량주", longxi: "량주", wuwei: "량주", jincheng: "량주", jiuquan: "량주", zhangye: "량주",
    shujun: "익주", hanzhong: "익주", bajun: "익주", guanghan: "익주", badong: "익주",
    zangke: "남중", yuexi: "남중", yizhoujun: "남중", yongchang: "남중",
    nanyang: "형주", xinye: "형주", xiangyang: "형주", xincheng: "형주", jiangxia: "형주", nanjun: "형주",
    wuling: "형주", lingling: "형주", changsha: "형주", guiyang: "형주", wuchang: "형주",
    wujun: "강동", kuaiji: "강동", danyang: "강동", yuzhang: "강동",
    nanhai: "교주", cangwu: "교주", jiaozhi: "교주", rinan: "교주",
  };
  S.blocOf = (cid) => BLOC[cid] || null;
  S.homeBloc = (o) => S.blocOf(S.homeOf(o.name));

  // Remember the force an officer last served, so those who come over
  // together can be told apart.
  const joinBond = S.joinBond;
  S.joinBond = function (state, o, base) {
    const last = o.lastForce;
    joinBond(state, o, base);
    if (last && last !== o.force && state.forces[last]) o.prev = { fid: last, name: state.forces[last].name };
    o.lastForce = o.force;
  };
  const initBonds = S.initBonds;
  S.initBonds = function (state) {
    initBonds(state);
    for (const o of Object.values(state.officers)) if (o.force && o.lastForce === undefined) o.lastForce = o.force;
  };

  // A former force: by id, or by name for one a scenario names (o.prev.fid null).
  const prevKey = (o) => o.prev.fid || o.prev.name;
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const sameClan = (a, b) => !!(S.CLAN[a.name] && S.CLAN[b.name] && S.CLAN[a.name].clan === S.CLAN[b.name].clan);

  // The faction an officer would belong to by himself, before groups of one
  // are dropped: {key, name, kind}.
  function claim(state, o, ruler, turned) {
    if (sameClan(o, ruler)) return { key: "kin", name: "종친", kind: "kin" };
    if (S.tieOf(o, ruler) >= F.old) return { key: "old", name: "원종", kind: "old" };
    const han = state.han;
    if (o.han === "H" && han && !han.ended && han.holder && han.holder === ruler.force) return { key: "han", name: "한조파", kind: "han" };
    if (o.prev && turned[prevKey(o)] >= F.turned) return { key: "t:" + prevKey(o), name: `${o.prev.name} 구신`, kind: "turned" };
    const bloc = S.homeBloc(o);
    return bloc ? { key: "r:" + bloc, name: `${bloc}파`, kind: "region" } : null;
  }

  // The officer at the head of a city: the ruler if he is there, else the
  // ablest in command and government.
  S.cityHead = function (state, c) {
    const staff = S.serving(state, c.id).filter((o) => o.force === c.owner);
    if (!staff.length) return null;
    // The player's character heads any city he is in, after the ruler (js/persona.js).
    return staff.find((o) => S.isRuler(state, o)) || staff.find((o) => o.id === state.player) || staff.reduce((a, b) => (b.cmd + b.pol > a.cmd + a.pol ? b : a));
  };
  // Standing within a faction: who leads it.
  const standing = (o) => Math.max(o.cmd, o.pol) + o.speech / 2 + (o.bond || 0) / 4;

  // A force's factions, strongest first: {key, name, kind, members, leader,
  // cities (headed by a member), troops (in those cities), power, share}.
  // Officers in no faction are left out.
  S.factions = function (state, fid) {
    const ruler = rulerOf(state, fid);
    if (!ruler) return [];
    const staff = S.officersOf(state, fid).filter((o) => o.id !== ruler.id);
    const turned = {};
    for (const o of staff) if (o.prev) turned[prevKey(o)] = (turned[prevKey(o)] || 0) + 1;
    const groups = new Map();
    for (const o of staff) {
      const f = claim(state, o, ruler, turned);
      if (!f) continue;
      if (!groups.has(f.key)) groups.set(f.key, Object.assign(f, { members: [] }));
      groups.get(f.key).members.push(o);
    }
    const heads = new Map();
    for (const c of S.citiesOf(state, fid)) {
      const h = S.cityHead(state, c);
      if (h && h.id !== ruler.id) heads.set(h.id, c);
    }
    const list = [...groups.values()].filter((g) => g.members.length >= 2 || g.kind === "kin" || g.kind === "old" || g.kind === "han");
    for (const g of list) {
      g.leader = g.members.reduce((a, b) => (standing(b) > standing(a) ? b : a));
      g.cities = g.members.filter((o) => heads.has(o.id)).map((o) => heads.get(o.id));
      g.troops = g.cities.reduce((s, c) => s + c.troops, 0);
      g.power = g.members.length + g.cities.length * 3 + g.troops / 5000;
    }
    const total = list.reduce((s, g) => s + g.power, 0) || 1;
    for (const g of list) g.share = g.power / total;
    return list.sort((a, b) => b.power - a.power);
  };
  // The faction of one officer (null for the ruler and for those in none).
  S.factionOf = function (state, o, list) {
    list = list || S.factions(state, o.force);
    return list.find((g) => g.members.includes(o)) || null;
  };
})(globalThis.SAM = globalThis.SAM || {});
