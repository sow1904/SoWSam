// What a force believes about the others: how many men a place holds and how
// strong its fleet is on the water. Nobody knows the true numbers of a
// place it does not hold; each force carries an error for each place it
// looks at, which drifts a little every month. Clever advisers and a border
// close by make the error smaller; a fight shows the truth.
//
// The errors come from a fixed hash, not the game's dice, so looking at the
// map never changes how the game plays out.
(function (S) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  S.INTEL = {
    base: 0.3,      // spread (log scale) when both sides' advisers are alike
    perWit: 0.005,  // per point of 지략 the other side's best adviser has over one's own
    min: 0.1,
    max: 0.5,
    near: 0.8,      // a place next to one's own is watched more closely
    far: 1.3,
    water: 0.25,    // extra spread judging fleets without a 수전 officer
    keep: 0.75,     // how much of last month's error stays
  };

  // Deterministic noise in [0, 1) from a few integers.
  function hash(...xs) {
    let h = 0x811c9dc5;
    for (const x of xs) {
      h ^= x | 0;
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  }
  function strHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h;
  }
  // A standard normal draw from the hash.
  function gauss(...xs) {
    const u = Math.max(1e-9, hash(...xs, 1)), v = hash(...xs, 2);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const salt = (state) => (state.intelSalt == null ? (state.intelSalt = (state.seed ^ 0x9e3779b9) | 0) : state.intelSalt);
  const monthNo = (state) => state.year * 12 + state.month;

  // A force's eye: its sharpest 지략, and whether anyone knows the water.
  function eyeOf(state, fid) {
    const cache = state._eye || (state._eye = {});
    const key = fid + ":" + monthNo(state);
    if (cache[fid] && cache[fid].key === key) return cache[fid];
    let wit = 30, water = false;
    for (const o of Object.values(state.officers)) {
      if (o.force !== fid || o.status !== "serving") continue;
      if (o.wit > wit) wit = o.wit;
      if (!water && S.hasSkill(o, "수전")) water = true;
    }
    return (cache[fid] = { key, wit, water });
  }
  S.intelEye = eyeOf;

  // How widely a force may misjudge a place (log scale): its sharpest
  // adviser against the other side's, who hides and misleads.
  //   other: the side being judged, when not the place's owner
  S.intelSpread = function (state, fid, placeId, onWater, other) {
    const I = S.INTEL;
    const eye = eyeOf(state, fid);
    const p = S.place(state, placeId);
    const them = other || (p && p.owner);
    const theirs = them ? eyeOf(state, them).wit : 50;
    let s = clamp(I.base + (theirs - eye.wit) * I.perWit, I.min, I.max);
    const near = S.links(state, placeId).some((id) => { const p = S.place(state, id); return p && p.owner === fid; });
    s *= near ? I.near : I.far;
    if (onWater && !eye.water) s += I.water;
    return s;
  };

  // Whether a force sees a place as it is: its own, an ally's, or one it
  // is fighting at right now.
  function plain(state, fid, p) {
    if (!fid || !p || p.owner === fid || !p.owner && p.troops <= 0) return true;
    if (p.owner && S.allied(state, fid, p.owner)) return true;
    return (state.battles || []).some((b) => b.place === p.id && (b.att.force === fid || b.def.force === fid));
  }

  // The error a force holds about a place: {t: men, q: fleet}, log scale.
  function errorOf(state, fid, p) {
    const book = state.intel || (state.intel = {});
    const mine = book[fid] || (book[fid] = {});
    let e = mine[p.id];
    if (!e) {
      const k = [salt(state), strHash(fid), strHash(p.id), monthNo(state)];
      e = mine[p.id] = {
        t: gauss(...k, 7) * S.intelSpread(state, fid, p.id, false),
        q: gauss(...k, 11) * S.intelSpread(state, fid, p.id, true),
      };
    }
    return e;
  }

  // How many men a force thinks a place holds (the truth for its own).
  S.seenTroops = function (state, fid, p, troops) {
    if (typeof p === "string") p = S.place(state, p);
    const n = troops == null ? p.troops : troops;
    if (plain(state, fid, p)) return n;
    return Math.round(n * Math.exp(errorOf(state, fid, p).t));
  };
  // How strong it thinks the place's fleet is, as a multiplier.
  S.seenFleet = function (state, fid, p) {
    if (typeof p === "string") p = S.place(state, p);
    if (plain(state, fid, p)) return 1;
    return Math.exp(errorOf(state, fid, p).q);
  };
  // Whether the number shown is a guess.
  S.guessed = (state, fid, p) => !plain(state, fid, typeof p === "string" ? S.place(state, p) : p);

  // A defender sizing up a fleet coming over the water: one look, when it
  // appears. {t, q} multipliers on its men and its strength.
  S.sizeUpFleet = function (state, fid, placeId, attForce, day) {
    const s = S.intelSpread(state, fid, placeId, true, attForce);
    const k = [salt(state), strHash(fid), strHash(attForce || ""), strHash(placeId), day | 0];
    return { t: Math.exp(gauss(...k, 3) * s * 0.6), q: Math.exp(gauss(...k, 5) * s) };
  };

  // Each month the errors drift: part stays, part is new.
  S.runIntel = function (state) {
    const book = state.intel || {};
    const I = S.INTEL;
    const fresh = Math.sqrt(1 - I.keep * I.keep);
    const mo = monthNo(state);
    for (const [fid, mine] of Object.entries(book)) {
      if (!state.forces[fid] || !state.forces[fid].alive) { delete book[fid]; continue; }
      for (const [pid, e] of Object.entries(mine)) {
        const p = S.place(state, pid);
        if (!p || p.owner === fid) { delete mine[pid]; continue; }
        // Draws of their own (13, 17): those of a new error (errorOf, 7 and
        // 11) in the same month would only double it.
        const k = [salt(state), strHash(fid), strHash(pid), mo];
        e.t = e.t * I.keep + gauss(...k, 13) * S.intelSpread(state, fid, pid, false) * fresh;
        e.q = e.q * I.keep + gauss(...k, 17) * S.intelSpread(state, fid, pid, true) * fresh;
      }
    }
  };
  // A fight shows most of the truth about the place.
  S.intelReveal = function (state, fid, placeId) {
    const e = state.intel && state.intel[fid] && state.intel[fid][placeId];
    if (e) { e.t *= 0.3; e.q *= 0.5; }
  };
})(globalThis.SAM = globalThis.SAM || {});
