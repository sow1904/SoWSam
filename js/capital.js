// The force capital (세력 수도): each force's seat of government, where its
// research happens. It is chosen apart from where the ruler stands, so a
// ruler can campaign while the capital is run in their absence. A force that
// proclaims itself emperor holds court there (황궁). The Han emperor's city
// (state.emperor) is a separate thing, the Han capital (한 수도).
//
// Losing the capital shakes the realm: some of the remaining cities give
// themselves up to the conqueror, loyal officers in them leave for the new
// capital, and the largest city still standing becomes the capital.
(function (S) {
  const fail = (msg) => ({ ok: false, msg });

  S.CAPITAL = {
    moveCost: 1000, // gold, paid by the new capital
    moveCooldown: 12, // months between moves
    surrender: 35, // base chance (%) that a remaining city gives itself up
    loyal: 70, // officers at least this loyal leave for the new capital
  };

  const biggest = (cities) => cities.reduce((a, b) => (b.pop > a.pop ? b : a));

  // The force's capital, repaired if it no longer holds it.
  S.capitalOf = function (state, fid) {
    const f = state.forces[fid];
    if (!f) return null;
    const c = f.capital && state.cities[f.capital];
    if (c && c.owner === fid) return c.id;
    const own = S.citiesOf(state, fid);
    if (!own.length) return (f.capital = null);
    const rc = state.officers[f.ruler] && state.officers[f.ruler].city;
    f.capital = state.cities[rc] && state.cities[rc].owner === fid ? rc : biggest(own).id;
    return f.capital;
  };
  S.isCapital = (state, cid) => {
    const c = state.cities[cid];
    return !!(c && c.owner && S.capitalOf(state, c.owner) === cid);
  };
  // "세력 수도", or "황궁" for a force that proclaimed itself emperor.
  S.capitalLabel = (state, fid) => (state.forces[fid] && state.forces[fid].emperor ? "황궁" : "세력 수도");
  S.initCapitals = (state) => { for (const f of Object.values(state.forces)) if (f.alive) S.capitalOf(state, f.id); };

  S.capitalWait = function (state, fid) {
    const f = state.forces[fid];
    return f.capitalMovedAt != null ? f.capitalMovedAt + S.CAPITAL.moveCooldown - S.monthsElapsed(state) : 0;
  };
  S.canMoveCapital = function (state, fid, cid) {
    const c = state.cities[cid];
    if (!c || c.owner !== fid) return fail("자기 세력의 도시로만 수도를 옮길 수 있습니다.");
    if (S.capitalOf(state, fid) === cid) return fail("이미 세력 수도입니다.");
    if (S.besieged(state, cid)) return fail("포위당한 도시로는 수도를 옮길 수 없습니다.");
    const wait = S.capitalWait(state, fid);
    if (wait > 0) return fail(`${wait}개월 뒤에 수도를 옮길 수 있습니다.`);
    if (c.gold < S.CAPITAL.moveCost) return fail(`${c.name}의 금이 부족합니다. (필요 ${S.CAPITAL.moveCost})`);
    return { ok: true };
  };
  S.moveCapital = function (state, fid, cid) {
    const can = S.canMoveCapital(state, fid, cid);
    if (!can.ok) return can;
    const f = state.forces[fid];
    const from = state.cities[S.capitalOf(state, fid)];
    const c = state.cities[cid];
    c.gold -= S.CAPITAL.moveCost;
    f.capital = cid;
    f.capitalMovedAt = S.monthsElapsed(state);
    const msg = `${S.josa(S.forceName(state, fid), "이", "가")} ${S.capitalLabel(state, fid)}를 ${from.name}에서 ${S.ro(c.name)} 옮겼습니다.`;
    if (fid !== state.playerForce) S.addLog(state, msg, "info");
    return { ok: true, msg };
  };

  // Officers who stand by their lord when their city goes over.
  const staysLoyal = (state, o, fid) => {
    const r = S.CLAN[state.officers[state.forces[fid].ruler].name];
    const kin = r && S.CLAN[o.name] && S.CLAN[o.name].clan === r.clan;
    return kin || o.loyalty >= S.CAPITAL.loyal || S.hasTrait(o, "의리");
  };
  // Chance that a city gives itself up: loyal officers hold it, and the
  // ruler's own city never yields.
  S.surrenderChance = function (state, c, fid) {
    const ruler = state.officers[state.forces[fid].ruler];
    if (ruler && ruler.city === c.id && ruler.status === "serving") return 0;
    const staff = S.serving(state, c.id).filter((o) => o.force === fid);
    const best = staff.length ? Math.max(...staff.map((o) => o.loyalty)) : 50;
    return Math.max(5, Math.min(70, S.CAPITAL.surrender - (best - 70) / 2));
  };

  // The capital of fid has just fallen to captor.
  S.capitalFell = function (state, fid, captor, report) {
    const f = state.forces[fid];
    const lost = state.cities[f.capital];
    const say = (msg, kind) => {
      if (report) report.lines.push(msg);
      S.addLog(state, msg, kind);
    };
    const mine = fid === state.playerForce;
    say(`${S.josa(S.forceName(state, fid), "이", "가")} ${S.capitalLabel(state, fid)} ${S.josa(lost.name, "을", "를")} 잃었습니다! 나라가 흔들립니다.`, mine ? "warn" : "fall");
    // Cities under siege hold out; the rest weigh their chances.
    const rest = S.citiesOf(state, fid).filter((c) => !S.besieged(state, c.id));
    const yields = [];
    const holds = [];
    for (const c of rest) (S.chance(state, S.surrenderChance(state, c, fid)) ? yields : holds).push(c);
    const keep = S.citiesOf(state, fid).filter((c) => !yields.includes(c));
    if (!keep.length) {
      // Everything would go: the ruler's city or the largest stands firm.
      const stand = yields.find((c) => S.surrenderChance(state, c, fid) === 0) || biggest(yields);
      yields.splice(yields.indexOf(stand), 1);
      keep.push(stand);
    }
    f.capital = biggest(keep).id;
    const capital = state.cities[f.capital];
    for (const c of yields) {
      // Loyal officers set out for the new capital while the roads are still theirs.
      const staff = S.serving(state, c.id).filter((o) => o.force === fid);
      const loyal = staff.filter((o) => staysLoyal(state, o, fid));
      if (loyal.length) {
        const route = S.route(state, c.id, capital.id, "officer");
        if (route) {
          S.launch(state, { kind: "move", force: fid, path: route.path, km: route.km, speed: "officer",
            officers: loyal.map((o) => o.id), origin: c.id, target: capital.id });
        } else {
          for (const o of loyal) { o.status = "free"; o.force = null; o.hidden = false; }
        }
      }
      const turned = staff.filter((o) => !loyal.includes(o));
      for (const o of turned) { o.force = captor; o.loyalty = 50; o.done = true; S.joinBond(state, o, S.BOND.captive); }
      for (const p of S.officersIn(state, c.id, (x) => x.status === "captive" && x.captor === fid)) {
        if (p.force === captor) { p.status = "serving"; p.captor = null; }
        else if (p.lord) S.freeCaptive(state, p);
        else p.captor = captor; // the captives go with the city
      }
      c.owner = captor;
      c.posts = S.emptyPosts();
      c.consent = Math.min(c.consent, 40);
      c.order = Math.max(10, c.order - 10);
      const who = [
        loyal.length && `${S.josa(loyal.map((o) => o.name).join(", "), "은", "는")} ${S.ro(capital.name)} 떠났습니다.`,
        turned.length && `${S.josa(turned.map((o) => o.name).join(", "), "은", "는")} 함께 투항했습니다.`,
      ].filter(Boolean).join(" ");
      say(`${S.josa(c.name, "이", "가")} ${S.forceName(state, captor)}에 항복했습니다.${who ? " " + who : ""}`,
        mine || captor === state.playerForce ? "warn" : "info");
    }
    say(`${S.josa(S.forceName(state, fid), "은", "는")} ${S.ro(capital.name)} ${S.capitalLabel(state, fid)}를 옮겼습니다.`, mine ? "warn" : "info");
  };

  // Computer forces keep the capital away from the front: when it borders an
  // enemy and a larger-or-similar interior city exists, they move it there.
  S.capitalAI = function (state, fid) {
    const cur = state.cities[S.capitalOf(state, fid)];
    if (!cur || S.capitalWait(state, fid) > 0) return;
    const front = (c) => S.links(state, c.id).some((n) => {
      const p = S.place(state, n);
      return p && p.owner && p.owner !== fid && !S.allied(state, fid, p.owner);
    });
    if (!front(cur) || !S.chance(state, 20)) return;
    const safe = S.citiesOf(state, fid).filter((c) => !front(c) && c.pop >= cur.pop * 0.6 && c.gold >= S.CAPITAL.moveCost + 300);
    if (!safe.length) return;
    S.moveCapital(state, fid, biggest(safe).id);
  };
})(globalThis.SAM = globalThis.SAM || {});
