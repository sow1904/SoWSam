// Technology (기술). Each force has a level in each field, raised by research
// (연구): an officer spends a month and some gold, and the force gains
// points in the field; enough points raise the level. Military fields unlock
// the later unit types of a line (창병, 중보병, 노병, 중기병, 투함).
// Domestic fields will join the same table later.
(function (S) {
  const fail = (msg) => ({ ok: false, msg });

  // group: what the field belongs to; line: the unit line it arms.
  S.TECH = {
    spear: { name: "창술", group: "군사", line: "spear" },
    sword: { name: "도검", group: "군사", line: "sword" },
    bow: { name: "궁노", group: "군사", line: "bow" },
    horse: { name: "기마", group: "군사", line: "horse" },
    navy: { name: "조선", group: "군사", line: "navy" },
  };
  S.TECH_COST = 150; // gold per month of research
  // Points to go from level lv to lv + 1.
  S.techNeed = (lv) => 400 * lv;
  // The highest level a field can reach: the last unit it unlocks.
  S.techMax = function (field) {
    const line = S.TECH[field].line;
    return Math.max(1, ...Object.values(S.UNITS).filter((u) => u.line === line && !u.special).map((u) => u.tier));
  };

  const entry = (state, fid, field) => {
    const f = state && fid && state.forces[fid];
    if (!f) return null;
    f.tech = f.tech || {};
    return (f.tech[field] = f.tech[field] || { lv: 1, pts: 0 });
  };
  // A force's level in a field; fields with nothing to research count as 1.
  S.techLevel = function (state, fid, field) {
    const f = state && fid && state.forces[fid];
    const t = f && f.tech && f.tech[field];
    return t ? t.lv : 1;
  };
  S.techFieldOfLine = (line) => Object.keys(S.TECH).find((k) => S.TECH[k].line === line);
  S.lineLevel = (state, fid, line) => {
    const field = S.techFieldOfLine(line);
    return field ? S.techLevel(state, fid, field) : 1;
  };
  // What the next level of a field brings.
  S.techUnlocks = (field, lv) => Object.values(S.UNITS).filter((u) => u.line === S.TECH[field].line && !u.special && u.tier === lv).map((u) => u.name);

  // Points an officer adds in a month: 지략 for now (a 학식 stat may take over).
  S.researchPoints = (o) => Math.round(10 + o.wit / 3);
  S.research = function (state, oid, cid, field) {
    const o = state.officers[oid];
    const c = S.place(state, cid);
    if (!S.TECH[field]) return fail("알 수 없는 기술입니다.");
    if (!o || !c || S.isFort(state, cid)) return fail("도시에서만 연구할 수 있습니다.");
    if (o.status !== "serving" || o.city !== cid || o.force !== c.owner) return fail("이 도시의 무장이 아닙니다.");
    if (S.capitalOf(state, c.owner) !== cid) return fail(`연구는 ${S.capitalLabel(state, c.owner)}에서만 할 수 있습니다.`);
    if (o.done) return fail(`${S.josa(o.name, "은", "는")} 이번 달 이미 행동했습니다.`);
    if (S.postOf(state, o)) return fail(`${S.josa(o.name, "은", "는")} 담당 업무 중입니다.`);
    const t = entry(state, c.owner, field);
    if (t.lv >= S.techMax(field)) return fail(`${S.TECH[field].name} 기술은 이미 끝까지 올랐습니다.`);
    if (c.gold < S.TECH_COST) return fail(`금이 부족합니다. (필요 ${S.TECH_COST})`);
    c.gold -= S.TECH_COST;
    o.done = true;
    const gain = S.researchPoints(o);
    t.pts += gain;
    let msg = `${S.josa(o.name, "이", "가")} ${S.TECH[field].name} 기술을 연구했습니다. (+${gain}, ${t.pts}/${S.techNeed(t.lv)})`;
    if (t.pts >= S.techNeed(t.lv)) {
      t.pts -= S.techNeed(t.lv);
      t.lv++;
      const opens = S.techUnlocks(field, t.lv);
      msg = `${S.josa(o.name, "이", "가")} ${S.TECH[field].name} 기술을 ${t.lv}단계로 올렸습니다!` + (opens.length ? ` 이제 ${opens.join(", ")}을 쓸 수 있습니다.` : "");
      if (c.owner !== state.playerForce) S.addLog(state, `${S.forceName(state, c.owner)}이 ${S.TECH[field].name} 기술을 ${t.lv}단계로 올렸습니다.`, "info");
    }
    return { ok: true, msg };
  };

  // Computer forces: the sharpest minds in the capital study the field of the
  // arms the force fights with most, and keep at a field once begun.
  // Returns the officers who studied.
  S.researchAI = function (state, c, idle) {
    if (S.capitalOf(state, c.owner) !== c.id) return [];
    const out = [];
    for (let i = 0; i < 2; i++) {
      const o = researchOnce(state, c, idle.filter((x) => !out.includes(x)));
      if (!o) break;
      out.push(o);
    }
    return out;
  };
  function researchOnce(state, c, idle) {
    if (!idle.length || c.gold < 400) return null;
    const fid = c.owner;
    const open = Object.keys(S.TECH).filter((k) => S.techLevel(state, fid, k) < S.techMax(k));
    if (!open.length) return null;
    const use = {};
    for (const p of S.citiesOf(state, fid).concat(S.fortsOf(state, fid))) {
      const line = S.unitOf(S.garrisonUnit(p)).line;
      use[line] = (use[line] || 0) + 1;
    }
    for (const m of S.marchesOf(state, fid)) if (m.unit) use[S.unitOf(m.unit).line] = (use[S.unitOf(m.unit).line] || 0) + 2;
    // Keep at a field once begun rather than spreading thin.
    const begun = (k) => ((state.forces[fid].tech || {})[k] || { pts: 0 }).pts / 40;
    const weight = (k) => 1 + (use[S.TECH[k].line] || 0) + begun(k) + (k === "navy" && S.citiesOf(state, fid).some((x) => S.links(state, x.id).some((n) => S.isWater(x.id, n))) ? 3 : 0);
    let roll = S.rand(state) * open.reduce((s, k) => s + weight(k), 0);
    let field = open[open.length - 1];
    for (const k of open) if ((roll -= weight(k)) <= 0) { field = k; break; }
    const o = idle.slice().sort((a, b) => b.wit - a.wit)[0];
    const r = S.research(state, o.id, c.id, field);
    return r.ok ? o : null;
  }

})(globalThis.SAM = globalThis.SAM || {});
