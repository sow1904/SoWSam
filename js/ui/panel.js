// The top bar, the summary panel on the left and the command window of the
// selected city or stronghold.
(function (S) {
  const UI = S.UI, $ = UI.$;
  const { fmt, stat, signed, helpTip } = UI;
  let state = null;
  UI.bind((s) => { state = s; });

  const H = UI.HELP; // the words behind each "?" (js/ui/help.js)

  // ---------- top bar ----------
  const chip = (label, value, extra) => `<span class="chip"><i>${label}</i><b>${value}</b>${extra || ""}</span>`;
  UI.renderStatus = function () {
    const date = `<span class="date"><b>${state.year}</b>년 <b>${state.month}</b>월 <b>${state.day || 1}</b>일</span>`;
    const me = S.playerChar(state);
    const meChip = me ? `<span class="chip me"><i>나</i><b>${me.name}</b><button data-action="persona" title="내 인물 (P)">${UI.roleLabel()}</button></span>` : "";
    if (!state.playerForce && me) {
      // A wanderer or a captive with no force: where he is, and the land.
      const fs = Object.values(state.forces).filter((x) => x.alive).map((x) => ({ x, n: S.citiesOf(state, x.id).length })).sort((a, b) => b.n - a.n);
      UI.setHTML($("#status"), date + `<span class="banner" style="--force:#6b5b3a"><b>${UI.roleLabel()}</b><i>${UI.personaLine()}</i></span>` + meChip +
        chip("명성", me.fame || 0) + fs.slice(0, 5).map((r) => chip(`<span class="swatch" style="--force:${r.x.color}"></span>${r.x.name}`, `${r.n}성`)).join(""));
      return;
    }
    if (!state.playerForce) {
      // Only watching: the state of the land.
      const fs = Object.values(state.forces).filter((x) => x.alive).map((x) => ({ x, n: S.citiesOf(state, x.id).length })).sort((a, b) => b.n - a.n);
      const vacant = S.cityList(state).filter((c) => !c.owner).length;
      UI.setHTML($("#status"), date + `<span class="banner" style="--force:#6b5b3a"><b>관전</b><i>모든 세력을 컴퓨터가</i></span>` +
        chip("세력", fs.length) + fs.slice(0, 5).map((r) => chip(`<span class="swatch" style="--force:${r.x.color}"></span>${r.x.name}`, `${r.n}성`)).join("") +
        (vacant ? chip("공백지", vacant) : ""));
      return;
    }
    const f = state.forces[state.playerForce];
    const t = S.totals(state, state.playerForce);
    const ruler = state.officers[f.ruler];
    const cap = state.cities[S.capitalOf(state, state.playerForce)];
    UI.setHTML($("#status"), date +
      `<span class="banner" style="--force:${f.color}"><b>${f.name}군</b><i>군주 ${ruler.name}</i></span>` +
      (me && me !== ruler ? meChip + chip("공적", me.merit || 0) + chip("주군의 의견", UI.signed(S.opinion(state, ruler, me))) : "") +
      (state.auto ? `<span class="chip auto"><b>세력 위임 중</b><button data-action="auto" title="다시 직접 다스립니다">해제</button></span>`
        : S.spectating(state) && S.playerRules(state) ? chip("통치", "모든 도시 완전 위임") : "") +
      (cap ? chip(S.capitalLabel(state, state.playerForce), cap.name, helpTip(H.capital)) : "") +
      (S.houseOf(state, state.playerForce) ? chip("가문", S.HOUSES[S.houseOf(state, state.playerForce)].name, helpTip(S.HOUSES[S.houseOf(state, state.playerForce)].help)) : "") +
      chip("체제", S.regime(state, state.playerForce).label) +
      chip("도시", t.cities) + chip("무장", t.officers) +
      chip("병력", fmt(t.troops)) + chip("병역 인구", fmt(t.manpower)) +
      chip("전쟁 피로", `<span class="${f.weariness >= 40 ? "bad" : ""}">${Math.round(f.weariness)} ${S.wearinessLabel(f.weariness)}</span>`, helpTip(H.weariness)) +
      chip("금", fmt(t.gold)) + chip("군량", fmt(t.food)));
  };

  // ---------- officers ----------
  // Abilities stand out by how good they are.
  const grade = (v) => (v >= 90 ? "ab-s" : v >= 80 ? "ab-a" : v >= 70 ? "ab-b" : v < 40 ? "ab-d" : "");
  const abilityCells = (o) => S.ABILITY_KEYS.map((k) => `<td class="${grade(o[k])}">${o[k]}</td>`).join("");
  const traitTags = (o) => S.traitsOf(o).map((t) => `<span class="trait" title="${S.TRAIT_HELP[t]}">${t}</span>`).join(" ");
  const skillTags = (o) => S.skillsOf(o).map((t) => `<span class="trait skill" title="${S.SKILL_HELP[t]}">${t}</span>`).join(" ");
  // Small marks after a name: a figure of the novel, a woman.
  UI.personMarks = function (o) {
    const p = S.PEOPLE[o.name] || {};
    return (state && state.player === o.id ? `<sup class="mark me" title="플레이어 인물">나</sup>` : "") + (p.fiction ? `<sup class="mark" title="연의의 인물">演</sup>` : "") + (p.female ? `<sup class="mark f" title="여성">女</sup>` : "");
  };
  UI.abilityHead = () => S.ABILITY_KEYS.map((k) => `<th>${S.ABILITY_NAMES[k]}</th>`).join("");
  Object.assign(UI, { abilityCells, traitTags, skillTags });

  // opts: pick (the action a row runs), loyalty, extra/extraHead (one more
  // column), status (a last column), showDone (grey those who have acted).
  UI.officerTable = function (list, opts) {
    if (!list.length) return `<p class="hint">없음</p>`;
    const rows = list.map((o) => {
      const status = opts.status ? opts.status(o) : "";
      const cls = [o.done && opts.showDone ? "done" : "", opts.pick ? "pick" : ""].join(" ");
      const attrs = opts.pick ? ` data-action="${opts.pick}" data-oid="${o.id}"` : "";
      const crown = S.isRuler(state, o) && o.status === "serving" ? `<span class="crown" title="군주">主</span>` : "";
      return `<tr class="${cls}"${attrs}><td class="oname">${crown}${o.name}${UI.personMarks(o)}</td><td>${S.age(state, o)}</td>${abilityCells(o)}` +
        `<td class="han-${o.han}">${S.HAN_NAMES[o.han].slice(2)}</td>` +
        `<td class="traits">${traitTags(o)}</td><td class="traits">${skillTags(o)}</td>` +
        (opts.loyalty ? `<td title="유대 ${o.bond || 0}">${S.isRuler(state, o) ? "-" : o.loyalty}</td>` : "") +
        (opts.extra ? `<td>${opts.extra(o)}</td>` : "") +
        (opts.status ? `<td>${status}</td>` : "") + `</tr>`;
    }).join("");
    return `<div class="otable"><table><tr><th>이름</th><th>나이</th>${UI.abilityHead()}<th>한조</th><th>성격</th><th>특기</th>` +
      (opts.loyalty ? `<th>충성</th>` : "") + (opts.extraHead != null && opts.extra ? `<th>${opts.extraHead}</th>` : "") +
      (opts.status ? `<th>상태</th>` : "") + `</tr>${rows}</table></div>`;
  };

  // ---------- pieces of the command window ----------
  // What is on the road to or from a place.
  function roadRows(c) {
    const me = state.playerForce;
    return (state.marches || []).filter((m) => (m.target === c.id || m.origin === c.id) && (m.force === me || m.target === c.id))
      .sort((a, b) => a.arrive - b.arrive).map((m) => {
        const names = m.officers.map((id) => state.officers[id]).filter((o) => o && o.transit === m.id).map((o) => o.name);
        const cargo = [m.troops && `병사 ${m.troops}`, m.gold && `금 ${m.gold}`, m.food && `군량 ${m.food}`].filter(Boolean).join(", ");
        const enemy = m.force !== me;
        const what = m.kind === "sortie" ? "요격" : m.kind === "army" ? (enemy ? `<span class="bad">${S.forceName(state, m.force)} 군단</span>` : "출진")
          : m.kind === "return" ? "귀환" : enemy ? S.forceName(state, m.force) : m.target === c.id ? "도착 예정" : "출발";
        if (m.kind === "build") return `<div>축성 · ${S.placeName(state, m.fort)} · ${names.join(", ")} · <b>${S.daysLeft(state, m)}일</b></div>`;
        const dir = m.target === c.id ? `${S.placeName(state, m.origin)} →` : `→ ${S.placeName(state, m.target)}`;
        return `<div>${what} ${dir} · ${names.join(", ") || "-"}${cargo ? " · " + cargo : ""} · <b>${S.daysLeft(state, m)}일</b></div>`;
      });
  }
  const battleRows = (id) => S.battlesAt(state, id).map((b) =>
    `<div class="pick" data-action="battleLive" data-b="${b.id}">⚔ ${UI.battleTitle(b)} · ${b.day}일째 · ${b.last}</div>`);

  function delegateRow(c) {
    const cur = S.delegateOf(state, c) || "";
    const opts = [["", "직접 다스림"]].concat(Object.entries(S.DELEGATE).map(([k, v]) => [k, `위임: ${v}`]));
    const tip = helpTip(H.delegate);
    return `<div class="row"><label>통치${tip}</label><select id="delegate" data-place="${c.id}">` +
      opts.map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("") +
      `</select></div>`;
  }
  // What the commander does under siege: sortie against the camp (출격) as
  // he sees fit or freely, or hold the walls (농성).
  function policyRow(id) {
    const cur = S.defensePolicy(state, id);
    const tip = helpTip(H.policy);
    return `<div class="row"><label>방어 방침${tip}</label><select id="defPolicy" data-place="${id}">` +
      Object.entries(S.DEFENSE_POLICY).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("") +
      `</select></div>`;
  }
  function garrisonRow(id) {
    const p = S.place(state, id);
    const tip = helpTip(H.garrison);
    const pools = Object.entries(p.wounded || {}).filter(([, w]) => w && w.n > 0);
    return `<div class="row"><label>수비 병력${tip}</label><span>${S.mixText(S.garrisonUnit(p), p.troops)}</span></div>` +
      (pools.length ? `<div class="row"><label>부상병${helpTip(H.wounded)}</label><span>${pools.map(([k, w]) => `${S.WOUND_CARE[k]} ${fmt(w.n)}`).join(" · ")}</span></div>` : "");
  }
  // Moving the force capital here.
  function capitalRow(c) {
    if (S.isCapital(state, c.id)) return "";
    const can = S.canMoveCapital(state, c.owner, c.id);
    return `<div class="links"><button data-action="moveCapital"${can.ok ? "" : " disabled"}>이곳으로 ${S.capitalLabel(state, c.owner)} 이전</button>` +
      ` <span class="hint">${can.ok ? `이 도시의 금 ${S.CAPITAL.moveCost}이 들고, ${S.CAPITAL.moveCooldown}개월 동안 다시 옮길 수 없습니다.` : can.msg}</span></div>`;
  }

  function holderName(c, kind) {
    const p = c.posts[kind];
    if (!p) return `<span class="bad">공석</span>`;
    if (p.type === "clerk") return `${S.CLERKS[p.tier].name}`;
    return `<b>${state.officers[p.id].name}</b>`;
  }
  UI.tuntianText = function (ability) {
    const e = S.tuntianEffect(ability);
    return `<span class="good">군량 +${Math.round(e.food)}</span>, 호족 -${(e.gentry * 12).toFixed(1)}/년`;
  };
  function postsTable(c) {
    const rows = S.DEV_KEYS.map((k) => {
      const max = k === "order" ? 100 : c[k + "Max"];
      return `<tr><td>${S.POSTS[k].label}</td><td>${c[k]}/${max}</td><td>${holderName(c, k)}</td>` +
        `<td>${signed(S.postDelta(state, c, k))}</td>` +
        `<td><button data-action="post" data-kind="${k}">변경</button></td></tr>`;
    }).join("");
    const tt = c.posts.tuntian;
    const ttRow = `<tr><td>둔전</td><td>호족 ${Math.round(c.gentry)}</td><td>${tt ? holderName(c, "tuntian") : "미실시"}</td>` +
      `<td>${tt ? UI.tuntianText(S.postAbility(state, tt, "tuntian")) : "-"}</td>` +
      `<td><button data-action="post" data-kind="tuntian">변경</button></td></tr>`;
    const tip = helpTip(H.posts);
    return `<h3>내정 담당${tip}</h3><table><tr><th>분야</th><th>수치</th><th>담당</th><th>월 변화</th><th></th></tr>${rows}${ttRow}</table>`;
  }

  // Commands, grouped as a strategy game's menu is: each has a one-character
  // mark, and is greyed out when no officer is free to carry it out.
  const CMD = {
    draft: ["徵", "징병"], train: ["鍊", "훈련"], attack: ["征", "출진"], relieve: ["援", "원군"], move: ["輸", "수송"], build: ["築", "축성"],
    search: ["探", "탐색"], recruit: ["登", "등용"], reward: ["賞", "포상"], relocate: ["移", "이동"],
    stake: ["柵", "녹각"], scheme: ["計", "계략"], woo: ["懷", "회유"], research: ["硏", "연구"], trade: ["商", "교역"], captives: ["虜", "포로"],
  };
  function cmdButton(place, cmd, free) {
    const disabled = !free && !S.idle(state, place.id).length;
    return `<button class="cmd" data-action="cmd" data-cmd="${cmd}"${disabled ? " disabled" : ""}><i>${CMD[cmd][0]}</i>${CMD[cmd][1]}</button>`;
  }
  const cmdGroup = (title, buttons) => (buttons.filter(Boolean).length
    ? `<div class="cgroup"><h4>${title}</h4><div class="cmds">${buttons.filter(Boolean).join("")}</div></div>` : "");

  function neighbours(p) {
    return `<h3>길로 이어진 곳</h3><div class="links">${S.links(state, p.id).map((n) => {
      const nc = S.place(state, n);
      return `<button data-action="select" data-city="${n}" style="border-left:4px solid ${UI.forceColor(nc.owner)}">${nc.name}${S.isFort(state, n) ? " (" + S.FORT_KINDS[nc.kind] + ")" : ""} ${fmt(nc.troops)}</button>`;
    }).join("")}</div>`;
  }
  function situation(p) {
    const battles = battleRows(p.id), roads = roadRows(p);
    return (battles.length ? `<h3>전투</h3><div class="road-list">${battles.join("")}</div>` : "") +
      (roads.length ? `<h3>길 위</h3><div class="road-list">${roads.join("")}</div>` : "") +
      neighbours(p);
  }
  const statusOf = (o) => {
    const k = S.postOf(state, o);
    return k ? `${S.POSTS[k].label} 담당` : o.done ? "완료" : "대기";
  };

  // ---------- the tabs of the command window ----------
  // Each tab: [key, label, body]. A tab with nothing to show is left out.
  function cityTabs(c) {
    const own = UI.mine(c);
    const servants = S.serving(state, c.id);
    const idle = S.idle(state, c.id).length;
    const busy = battleRows(c.id).length + roadRows(c).length;
    const tabs = [];
    if (own) {
      tabs.push(["cmd", "명령", () =>
        `<p class="idle">대기 무장 <b>${idle}</b> / ${servants.length}명${helpTip(H.command)}</p>` +
        cmdGroup("군사", [cmdButton(c, "draft"), cmdButton(c, "train"), cmdButton(c, "attack"),
          S.reliefTargets(state, c.id).length ? cmdButton(c, "relieve") : "", cmdButton(c, "move"),
          S.buildSites(state, c.id).length ? cmdButton(c, "build") : "", cmdButton(c, "stake")]) +
        cmdGroup("인사", [cmdButton(c, "search"), cmdButton(c, "recruit"), cmdButton(c, "reward", true), cmdButton(c, "relocate"),
          S.captivesIn(state, c.id, c.owner).length ? cmdButton(c, "captives", true) : ""]) +
        cmdGroup("계략", [cmdButton(c, "scheme"), cmdButton(c, "woo")]) +
        cmdGroup("경제", [cmdButton(c, "trade", true), S.isCapital(state, c.id) ? cmdButton(c, "research") : ""]) +
        capitalRow(c) +
        `<h3>방비</h3>` + policyRow(c.id) + garrisonRow(c.id)]);
      tabs.push(["post", "내정", () => delegateRow(c) + postsTable(c)]);
    }
    tabs.push(["men", `무장 ${servants.length}`, () => {
      let html = `<h3>무장 (${servants.length})</h3>` + UI.officerTable(servants, { loyalty: true, showDone: own, status: own ? statusOf : null });
      const free = S.visibleFree(state, c.id);
      if (free.length) html += `<h3>재야 인재</h3>` + UI.officerTable(free, {});
      const caps = own ? S.captivesIn(state, c.id, c.owner) : [];
      if (caps.length) {
        html += `<h3>포로</h3>` + UI.officerTable(caps, { extraHead: "", extra: () => `<button data-action="cmd" data-cmd="captives">처우</button>` });
      }
      return html;
    }]);
    tabs.push(["info", `정세${busy ? ` <em>${busy}</em>` : ""}`, () => {
      const sites = S.buildSites(state, c.id);
      return situation(c) + (sites.length ? `<p class="hint">축성할 수 있는 터: ${sites.map((f) => f.name).join(", ")}. 축성 특기가 있는 무장이 금 ${S.BUILD_COST}으로 ${S.BUILD_DAYS}일 동안 쌓습니다.</p>` : "");
    }]);
    return tabs;
  }
  function fortTabs(f) {
    const own = UI.mine(f);
    const servants = S.serving(state, f.id);
    const busy = battleRows(f.id).length + roadRows(f).length;
    const tabs = [];
    if (own) {
      tabs.push(["cmd", "명령", () =>
        `<p class="idle">대기 무장 <b>${S.idle(state, f.id).length}</b> / ${servants.length}명${helpTip(H.command)}</p>` +
        cmdGroup("군사", [cmdButton(f, "attack"), S.reliefTargets(state, f.id).length ? cmdButton(f, "relieve") : "", cmdButton(f, "move")]) +
        cmdGroup("인사", [cmdButton(f, "relocate")]) +
        `<h3>방비</h3>` + policyRow(f.id) + garrisonRow(f.id)]);
    }
    tabs.push(["men", `무장 ${servants.length}`, () => `<h3>무장 (${servants.length})</h3>` +
      UI.officerTable(servants, { loyalty: true, showDone: own, status: own ? (o) => (o.done ? "완료" : "대기") : null })]);
    tabs.push(["info", `정세${busy ? ` <em>${busy}</em>` : ""}`, () => situation(f)]);
    return tabs;
  }

  // ---------- the summary on the left ----------
  function citySummary(c) {
    const own = UI.mine(c);
    const ally = S.allied(state, state.playerForce, c.owner) ? " · 동맹" : "";
    const cap = S.isCapital(state, c.id) ? `<span class="capstar" title="${S.forceName(state, c.owner)} ${S.capitalLabel(state, c.owner)}">★</span>` : "";
    const ph = c.owner ? S.provinceHold(state, c.prov, c.owner) : null;
    const lines = [
      c.id === state.emperor && !(state.han && state.han.ended) && "<b>한 수도</b> (헌제의 거처)",
      `${S.PROVINCES[c.prov]}${ph ? ` (${ph.held}/${ph.total}군 보유)` : ""}`,
      S.fullName(c),
      S.regionLabel(c.prov) && `특산: ${S.regionLabel(c.prov)}`,
      S.specialsHere(c).length && `특수 병종: ${S.specialsHere(c).map((k) => S.unitName(k)).join(", ")}`,
      S.specialLand("louchuan", c) && "장강 수군(누선)",
      S.landHas("salt", c) && "소금이 나는 땅",
      S.houseLabel(c, state) && `가문: ${S.houseLabel(c, state)}${helpTip(S.HOUSES[S.houseAt(c, state).key].help)}`,
      own && S.governorOf && S.governorOf(state, c) && ((g) => `태수: ${g.name} (${S.governorType(state, g)}형)${helpTip(S.GOVERNOR_TYPES[S.governorType(state, g)])}`)(S.governorOf(state, c)),
    ].filter(Boolean);
    return `<h2>${c.name}${cap}<span class="badge" style="--force:${UI.forceColor(c.owner)}">${S.forceName(state, c.owner)}${ally}</span></h2>` +
      `<div class="cinfo">${lines.map((l) => `<div>${l}</div>`).join("")}</div>` +
      `<div class="stats">` +
      (S.isCapitalCity(state, c) ? stat("주력군", c.troops.toLocaleString())
        : stat("수비대", `${c.troops.toLocaleString()}/${S.garrisonCap(state, c).toLocaleString()}`)) + stat("훈련", c.train) +
      stat("금", c.gold.toLocaleString()) + stat("군량", c.food.toLocaleString()) +
      (own && c.sent ? stat("지난달 상납", `금 ${fmt(c.sent.gold)} · 군량 ${fmt(c.sent.food)}`) : "") +
      stat("인구", c.pop.toLocaleString()) + stat("치안", c.order) +
      stat("병역 인구", `${fmt(c.manpower)}/${fmt(S.manpowerMax(c))}`) + stat("월 회복", "+" + S.manpowerRegen(c)) +
      stat("농업", `${c.farm}/${c.farmMax}`) + stat("상업", `${c.trade}/${c.tradeMax}`) +
      stat("성벽", `${c.wall}/${c.wallMax}`) + (c.stakes > 0 ? stat("녹각", Math.round(c.stakes)) : "") +
      (own ? stat("월 수지", signed(S.balance(c))) : "") +
      `</div>` +
      // Resources down the left, the monthly budget down the right.
      `<h3>자원${own ? " · 월 수지" : ""}</h3><div class="stats cols">` +
      S.RES_KEYS.map((k) => stat(S.RESOURCES[k], `${fmt(c.res[k])}/${fmt(S.resCap(c, k))}/+${S.resYield(c, k)}`)).join("") +
      (own ? stat("수입", "+" + S.income(c)) + stat("병사 봉급", "-" + S.upkeep(c)) + stat("관리 봉급", "-" + S.salaries(c)) : "") +
      `</div>` +
      `<h3>호족${own ? helpTip(`${H.gentry} 협력 목표치 ${Math.round(S.consentTarget(state, c))}.`) : ""}</h3><div class="stats">` +
      stat("호족 세력", Math.round(c.gentry)) + stat("호족 협력", Math.round(c.consent)) +
      stat("호족 사병", c.retainers.toLocaleString()) + stat("출진 가능", S.marchable(c).toLocaleString()) +
      (own && c.cut > 0.05 ? stat("반발 위험", `월 ${S.unrestChance(c).toFixed(1)}%`) : "") +
      (own && S.cityHead(state, c) && S.rebelChance(state, S.cityHead(state, c), c) >= 0.1 ? stat("태수 반란", `월 ${S.rebelChance(state, S.cityHead(state, c), c)}%`) : "") +
      `</div>` +
      (own && c.unrest ? `<p class="bad">호족들이 둔전에 반발해 들고일어났습니다. 둔전이 멈추고 매달 치안이 떨어집니다. <button data-action="unrest">처리</button></p>` : "");
  }
  function fortSummary(f) {
    const ends = f.road.map((id) => state.cities[id].name);
    const between = ends.length > 2 ? `${ends[0]}에서 ${S.ro(ends.slice(1).join("·"))} 가는 길` : `${ends.join("–")} 사이 길`;
    const ally = f.owner && S.allied(state, state.playerForce, f.owner) ? " · 동맹" : "";
    let html = `<h2>${f.name}<span class="badge" style="--force:${UI.forceColor(f.owner)}">${f.built ? (f.owner ? S.forceName(state, f.owner) : "비어 있음") : "터"}${ally}</span></h2>` +
      `<div class="cinfo"><div>${S.FORT_KINDS[f.kind]} · ${between}</div><div>소속: ${state.cities[f.home].name}</div></div>`;
    if (!f.built) {
      return html + `<p>${f.building ? `${S.forceName(state, f.building.force)}이 쌓고 있습니다.` : "아직 쌓지 않은 터입니다."} ` +
        `축성 특기가 있는 무장이 ${ends.join(", ")} 중 한 곳에서 금 ${S.BUILD_COST}으로 ${S.BUILD_DAYS}일 동안 쌓을 수 있습니다.</p>` +
        `<h3>축성 특기</h3><p class="hint">${Object.keys(S.SKILLS).filter((n) => S.SKILLS[n].includes("축성")).join(", ")}</p>`;
    }
    html += `<div class="stats">` + stat("병력", f.troops.toLocaleString()) + stat("훈련", f.train) +
      stat("성벽", `${f.wall}/${f.wallMax}`) + stat("군량", f.food.toLocaleString()) + `</div>`;
    return html + `<p class="hint">${f.kind === "pass" ? "지형이 험해 지키기 쉽습니다." : "성벽이 높고 군량을 많이 쌓아 오래 버팁니다."} ` +
      `거점에는 백성과 내정이 없습니다. 지키는 병사는 한 달에 병사 25명당 군량 1을 먹고, 군량은 길로 이어진 아군 도시에서 채웁니다. ` +
      `적이 지키는 거점은 먼저 빼앗아야 그 너머로 갈 수 있습니다. 비어 있는 거점은 수송이나 이동으로 들어가면 차지합니다.</p>`;
  }

  // The player's cities in map-list order, for stepping through them.
  UI.cycleCity = function (step) {
    const own = UI.myCities();
    if (!own.length) return;
    const i = own.findIndex((c) => c.id === UI.selected);
    const next = own[((i < 0 ? 0 : i + step) + own.length) % own.length];
    UI.openCity(next.id);
    UI.centerOn(next);
  };

  UI.renderPanel = function () {
    const info = $("#panelInfo"), win = $("#cityWin");
    if (!UI.selected) {
      UI.winOpen = false;
      win.classList.add("hidden");
      const me = S.playerChar(state);
      if (me && !S.playerRules(state)) {
        const pc = S.playerCity(state);
        UI.setHTML(info, `<h2>${me.name}</h2><p>${UI.personaLine()}</p>` +
          `<p class="hint">${state.heirPick ? "뒤를 이을 인물을 골라야 합니다." : S.personaBlocked(state) || "이번 달 행동을 할 수 있습니다."}</p>` +
          `<div class="links"><button class="primary" data-action="persona">인물 창 (P)</button>` +
          (pc ? `<button data-action="select" data-city="${pc}">${state.cities[pc].name} (내 성)</button>` : "") +
          (me.city && state.cities[me.city] && me.city !== pc ? `<button data-action="select" data-city="${me.city}">${state.cities[me.city].name} (있는 곳)</button>` : "") + `</div>` +
          `<p class="hint">군주가 아니므로 세력의 결정은 컴퓨터 군주가 내립니다. 지도에서 도시를 누르면 정보가 나옵니다.</p>`);
        return;
      }
      UI.setHTML(info, !state.playerForce
        ? `<h2>관전</h2><p class="hint">지도에서 도시를 누르면 그곳의 정보가 나옵니다. 위쪽 메뉴의 도시·무장·기술은 고른 도시의 세력 것을 보여 줍니다. 시간은 「▶ 진행」이나 스페이스 바로 흐르게 합니다.</p>`
        : `<h2>도시를 선택하세요</h2><p class="hint">지도에서 도시를 누르면 정보와 명령이 나옵니다. ` +
        `무장마다 한 달에 한 번 명령할 수 있습니다. 시간은 「▶ 진행」이나 스페이스 바로 흐르게 합니다.</p>` +
        `<h3>내 도시</h3><div class="links">${UI.myCities()
          .map((c) => `<button data-action="select" data-city="${c.id}">${c.name} (${S.idle(state, c.id).length})</button>`).join("")}</div>`);
      return;
    }
    const fort = S.isFort(state, UI.selected);
    const p = S.place(state, UI.selected);
    UI.setHTML(info, fort ? fortSummary(p) : citySummary(p));
    const tabs = fort && !p.built ? [] : fort ? fortTabs(p) : cityTabs(p);
    const open = UI.winOpen && tabs.length > 0;
    win.classList.toggle("hidden", !open);
    if (!open) return;
    const cur = tabs.find((t) => t[0] === UI.tab) || tabs[0];
    UI.tab = cur[0];
    win.classList.toggle("wide", cur[0] === "men"); // the officer table needs the room
    const own = UI.mine(p);
    const many = UI.myCities().length > 1;
    UI.setHTML(win,
      `<div class="cwh">` +
      (many ? `<button data-action="cycle" data-step="-1" title="이전 아군 도시 (Q)">◀</button>` : "") +
      `<b style="--force:${UI.forceColor(p.owner)}">${p.name}</b>` +
      (many ? `<button data-action="cycle" data-step="1" title="다음 아군 도시 (E)">▶</button>` : "") +
      `<span class="grow"></span><button data-action="closeCity" title="닫기 (Esc)">×</button></div>` +
      `<div class="tabs">${tabs.map((t) => `<button data-action="tab" data-tab="${t[0]}" class="${t[0] === cur[0] ? "on" : ""}">${t[1]}</button>`).join("")}</div>` +
      `<div class="cwb${own ? "" : " foreign"}">${cur[2]()}</div>`);
  };
})(globalThis.SAM = globalThis.SAM || {});
