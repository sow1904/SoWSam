// Succession and the strife it brings (후계 내분).
//
// When a ruler dies or is taken, the men of his clan in the force are the
// candidates; the one he named (f.heir), else the first in the clan's order,
// is the appointed heir. Every faction (js/factions.js) backs the candidate
// it likes best: one of its own, one its leader is close to, the appointed
// one, an able one. The appointed heir takes over unless a rival's backing is
// clearly larger, when the rival seizes power instead.
// The candidate left out may then break away with the cities his backers
// govern (원담과 원상, 손화와 손패). How likely depends on his backing, on the
// force's regime (a 중앙집권형 state holds its armies; in a 호족연합형 one
// the families follow their own men) and on his nature. If he stays, his
// backers resent it and the winner's backers are rewarded.
// With fewer than two of the clan, the leader of the strongest faction outside
// it contends as well (a 권신), and with no clan the two strongest leaders.
// A ruler may also step down (하야), by choice or forced out by a faction; then
// the faction that forced him puts up its own man (js/rebellion.js).
// why: the user wanted about half of all successions to split the force, to
// break up stalemates.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const C = S.SUCCESSION = {
    usurp: 1.25, // a rival with this much more backing than the appointed heir takes power
    split: { base: 60, per: 70, max: 95 }, // % to break away: base + backing x per, at most max
    regime: { 중앙집권형: 0.75, 부곡형: 1, 호족연합형: 1.3 },
    nature: { 야심: 1.5, 무욕: 0.3, 의리: 0.5 },
    grudge: 15, favor: 10, // bond lost by the losers' backers, gained by the winner's
    named: 15, own: 40, // weight for the appointed heir, for a faction's own man
    near: 3, // the clan's men nearest in its order who may contend
    beside: 25, // weight for a candidate by the share of a faction serving in his city or region
    luck: 10,
  };
  const rulerOf = (state, fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);
  const sameClan = (a, b) => !!(S.CLAN[a.name] && S.CLAN[b.name] && S.CLAN[a.name].clan === S.CLAN[b.name].clan);
  const female = (o) => !!(S.PEOPLE[o.name] && S.PEOPLE[o.name].female);

  // The clan's men who could follow the ruler.
  S.heirCandidates = function (state, fid, ruler) {
    ruler = ruler || rulerOf(state, fid);
    return S.officersOf(state, fid).filter((o) => o.id !== ruler.id && sameClan(o, ruler) && !female(o))
      .sort((a, b) => S.CLAN[a.name].rank - S.CLAN[b.name].rank).slice(0, C.near);
  };
  // The appointed heir: the one named, else the first in the clan's order.
  S.namedHeir = function (state, fid, cands) {
    const f = state.forces[fid];
    return cands.find((o) => o.id === f.heir) || (cands.length ? cands.reduce((a, b) => (S.CLAN[b.name].rank < S.CLAN[a.name].rank ? b : a)) : null);
  };
  // The player names an heir (or clears the choice with null).
  S.setHeir = function (state, fid, oid) {
    const f = state.forces[fid];
    if (!oid) { f.heir = null; return { ok: true, msg: "후계자 지명을 거두었습니다. 가문의 서열대로 잇습니다." }; }
    const o = state.officers[oid];
    if (!o || !S.heirCandidates(state, fid).includes(o)) return { ok: false, msg: "후계자로 세울 수 없는 사람입니다." };
    f.heir = oid;
    return { ok: true, msg: `${S.josa(o.name, "을", "를")} 후계자로 세웠습니다.` };
  };

  // Who backs whom. luck: a function giving 0-1 (the dice, or 0.5 for a
  // forecast). Returns {cands, named, backing: Map(cand -> share), sides:
  // Map(faction -> cand), facs}.
  // by: a faction forcing the ruler out, which puts up its own leader.
  function contest(state, fid, ruler, luck, by) {
    const facs = S.factions(state, fid);
    let cands = S.heirCandidates(state, fid, ruler);
    let named = S.namedHeir(state, fid, cands);
    const kin = cands.length > 0;
    // Too few of the clan: the strongest factions outside it put up their
    // leaders (the ablest of them leads where there is no clan at all).
    const extra = by && !cands.includes(by.leader) ? [by.leader] : [];
    for (const g of facs) {
      if (cands.length + extra.length >= 2) break;
      if (g.kind !== "kin" && !cands.includes(g.leader) && !extra.includes(g.leader)) extra.push(g.leader);
    }
    cands = cands.concat(extra);
    if (!kin) named = cands.length ? S.pickHeir(ruler, cands) : null;
    const backing = new Map(cands.map((o) => [o, 0]));
    const sides = new Map();
    for (const g of facs) {
      let best = null, bestV = -Infinity;
      for (const x of cands) {
        // A faction leans to its own man, to one its leader is close to, to
        // the appointed heir, to an able one, and to the man it serves beside.
        const near = (o) => o.city === x.city || (S.blocOf(o.city) && S.blocOf(o.city) === S.blocOf(x.city));
        const beside = g.members.filter(near).length / g.members.length;
        // A strong patron anywhere in the faction pulls it along.
        const patron = Math.max(S.tieOf(g.leader, x), 0.7 * Math.max(0, ...g.members.map((o) => S.tieOf(o, x))));
        const v = (g.kind !== "kin" && g.members.includes(x) ? C.own : 0) + patron / 2 + (x === named ? C.named : 0) +
          (x.pol + x.cmd + x.speech) / 15 + beside * C.beside + luck() * C.luck;
        if (v > bestV) { bestV = v; best = x; }
      }
      if (!best) continue;
      sides.set(g, best);
      backing.set(best, backing.get(best) + g.share);
    }
    return { cands, named, backing, sides, facs, kin };
  }
  // What the court looks like now, for the faction window: [{o, share, named}].
  S.successionOutlook = function (state, fid) {
    const ruler = rulerOf(state, fid);
    if (!ruler) return [];
    const r = contest(state, fid, ruler, () => 0.5);
    return r.cands.map((o) => ({ o, share: r.backing.get(o) || 0, named: o === r.named })).sort((a, b) => b.share - a.share);
  };
  // The chance (%) that the one left out breaks away.
  S.splitChance = function (state, fid, loser, share) {
    let p = clamp(C.split.base + share * C.split.per, 0, C.split.max);
    p *= C.regime[S.regime(state, fid).label] || 1;
    for (const t of S.traitsOf(loser)) p *= C.nature[t] || 1;
    return Math.round(p);
  };

  // The ruler is gone (dead, taken, or stepped down): someone follows.
  // opts.by: the faction that forced him out (opts.verb: how, for the
  // news; opts.take: its leader takes the seat). Returns log lines.
  S.succeed = function (state, fid, ruler, heirs, opts) {
    opts = opts || {};
    const f = state.forces[fid];
    const msgs = [];
    const r = contest(state, fid, ruler, () => S.rand(state), opts.by);
    let heir = r.named || S.pickHeir(ruler, heirs);
    const how = ruler.beheaded ? "참수되어" : ruler.status === "dead" ? "세상을 떠나" : "물러나";
    const top = [...r.backing.entries()].sort((a, b) => b[1] - a[1])[0];
    let seized = false;
    if (opts.by && opts.take) {
      // Those who struck him down take the seat themselves.
      heir = opts.by.leader;
    } else if (opts.by && r.sides.get(opts.by)) {
      // Those who forced him out choose who follows.
      heir = r.sides.get(opts.by);
    } else if (top && top[0] !== heir && top[1] > (r.backing.get(heir) || 0) * C.usurp) {
      // Within the clan a rival with clearly more backing seizes power; with
      // no clan, the best backed simply takes the lead.
      seized = r.kin || !!r.named;
      heir = top[0];
    }
    // The one left out, and those behind him.
    const rivals = [...r.backing.entries()].filter(([o]) => o !== heir).sort((a, b) => b[1] - a[1]);
    const loser = rivals.length ? rivals[0][0] : null;
    const loserShare = rivals.length ? rivals[0][1] : 0;

    f.ruler = heir.id;
    f.heir = null;
    f.since = S.monthsElapsed(state);
    heir.loyalty = 100;
    S.heirBonds(state, fid, ruler, heir);
    f.name = heir.name;
    msgs.push(opts.by
      ? `${S.josa(opts.by.name, "이", "가")} ${S.josa(ruler.name, "을", "를")} ${opts.verb || "몰아내고"} ${S.josa(heir.name, "을", "를")} 세웠습니다.`
      : seized
      ? `${S.josa(ruler.name, "이", "가")} ${how} ${S.josa(r.named.name, "이", "가")} 뒤를 이을 참이었으나, ${S.josa(heir.name, "이", "가")} 정변을 일으켜 세력을 차지했습니다.`
      : `${S.josa(ruler.name, "이", "가")} ${how} ${S.josa(heir.name, "이", "가")} 세력을 이어받았습니다.`);
    if (!loser) return msgs;

    const winners = [...r.sides.entries()].filter(([, x]) => x === heir).map(([g]) => g);
    const backers = [...r.sides.entries()].filter(([, x]) => x === loser).map(([g]) => g);
    if (S.chance(state, S.splitChance(state, fid, loser, loserShare))) {
      const line = breakAway(state, fid, heir, loser, backers, winners);
      if (line) { msgs.push(line); return msgs; }
    }
    // He stays: his backers resent it, the winner's are rewarded.
    for (const g of backers) for (const o of g.members) if (o !== heir) S.bondAdd(state, o, -C.grudge);
    for (const g of winners) for (const o of g.members) S.bondAdd(state, o, C.favor);
    if (loserShare >= 0.2) msgs.push(`${S.josa(loser.name, "을", "를")} 밀던 ${backers.map((g) => g.name).join("·")}의 불만이 큽니다.`);
    return msgs;
  };

  // A darker or lighter shade of a force colour for the breakaway.
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [16, 8, 0].map((s) => (n >> s) & 255).map((v) => clamp(Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k), 0, 255));
    return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  // The loser leaves with the cities his backers govern, else the one he
  // serves in. Returns a log line, or null when he has nowhere to go.
  function breakAway(state, fid, heir, loser, backers, winners) {
    const capital = S.capitalOf(state, fid);
    const cities = new Set();
    for (const g of backers) for (const c of g.cities) cities.add(c);
    const own = state.cities[loser.city];
    if (own && own.owner === fid && (S.cityHead(state, own) === loser || !cities.size)) cities.add(own);
    for (const c of [...cities]) if (c.id === capital || c.id === heir.city) cities.delete(c);
    const theirs = new Set(backers.flatMap((g) => g.members));
    const loyal = new Set(winners.flatMap((g) => g.members).concat([heir]));
    if (!cities.size) {
      // Nothing of his own: he makes for the strongest city whose head did
      // not stand with the heir.
      const open = S.citiesOf(state, fid).filter((c) => c.id !== capital && c.id !== heir.city && !loyal.has(S.cityHead(state, c)));
      if (open.length) cities.add(open.reduce((a, b) => (b.troops > a.troops ? b : a)));
    }
    if (!cities.size) return null;
    const list = S.secede(state, fid, loser, [...cities], (o) => !loyal.has(o), (o) => theirs.has(o));
    return `${S.josa(loser.name, "이", "가")} 이에 불복하여 ${S.josa(list.map((c) => c.name).join("·"), "을", "를")} 이끌고 갈라져 나갔습니다.`;
  }

  // leader takes cities out of fid as a force of his own, hostile to it.
  // goes(o): whether one serving in those cities goes with him (the others
  // get out to the capital); sore(o): whether one elsewhere resents it.
  // Returns the cities.
  S.secede = function (state, fid, leader, list, goes, sore) {
    const f = state.forces[fid];
    const capital = S.capitalOf(state, fid);
    const cities = new Set(list);
    let n = 1;
    while (state.forces[`${fid}x${n}`]) n++;
    const nid = `${fid}x${n}`;
    const seat = list.reduce((a, b) => (b.pop > a.pop ? b : a));
    state.forces[nid] = {
      id: nid, name: leader.name, color: shade(f.color, n % 2 ? -0.35 : 0.35), ruler: leader.id, alive: true,
      weariness: f.weariness, tech: JSON.parse(JSON.stringify(f.tech || {})), capital: seat.id, from: fid,
      since: S.monthsElapsed(state),
    };
    for (const c of list) {
      c.owner = nid;
      c.delegate = null;
      c.unrest = null;
    }
    for (const o of S.officersOf(state, fid)) {
      if (S.isRuler(state, o)) continue;
      const there = cities.has(state.cities[o.city]);
      if (o === leader || (there && goes(o))) {
        o.force = nid;
        o.lastForce = nid;
        o.loyalty = Math.max(o.loyalty, 70);
        o.bond = o === leader ? 100 : Math.max(o.bond || 0, 50);
        if (o === leader && !there) o.city = seat.id;
      } else if (there) {
        o.city = capital; // the loyal get out
      } else if (sore(o)) {
        S.bondAdd(state, o, -C.grudge);
      }
    }
    S.officersMoved(state);
    // The two sides are enemies; the new force starts with the others as the
    // old force stood with them, and with no treaties.
    for (const other of Object.keys(state.forces)) {
      if (other === nid || other === fid) continue;
      S.relAdd(state, nid, other, S.rel(state, fid, other) - S.rel(state, nid, other));
    }
    S.relAdd(state, nid, fid, 5 - S.rel(state, nid, fid));
    if (state.aiDays) state.aiDays[nid] = 1 + Math.floor(S.rand(state) * S.DAYS_PER_MONTH);
    S.capitalOf(state, fid);
    return list;
  };
})(globalThis.SAM = globalThis.SAM || {});
