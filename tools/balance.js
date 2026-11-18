// A balance report from all-computer games.
// usage: node tools/balance.js [games=8] [years=40]
// Prints who wins, how fast the land is united, and averages every five
// years: forces alive, the largest force's share of cities, troops, stores,
// order, weariness, and what the armies are made of.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "js");
for (const f of ["data/map.js", "data/people.js", "data/abilities.js", "data/traits.js", "data/skills.js", "data/roster.js", "data/homes.js", "data/scenario191.js", "data/scenario219.js", "engine.js", "resources.js", "march.js", "units.js", "tech.js", "capital.js", "forts.js", "battle.js", "court.js", "houses.js", "diplomacy.js", "data/ties.js", "bonds.js", "gentry.js", "factions.js", "succession.js", "ai.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}
const S = globalThis.SAM;
const games = +(process.argv[2] || 8);
const years = +(process.argv[3] || 40);

const avg = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0);
const snaps = {}; // year offset -> list of snapshots
const winners = {};
const ends = [];
const firstOut = {}; // force -> list of the years it fell
let battles = 0, sieges = 0, siegeWins = 0, fields = 0;

for (let g = 0; g < games; g++) {
  const state = S.newGame(S.SCENARIO_191, null, 2000 + g, {});
  const alive0 = new Set(Object.keys(state.forces));
  const name0 = Object.fromEntries(Object.values(state.forces).map((f) => [f.id, f.name]));
  for (let m = 0; m < years * 12 && !state.over; m++) {
    S.advanceTurn(state, (r) => {
      if (!r.report) return;
      battles++;
      if (r.report.kind === "siege") { sieges++; if (r.report.attackerWon) siegeWins++; } else fields++;
    });
    for (const fid of [...alive0]) {
      if (!state.forces[fid].alive) { alive0.delete(fid); (firstOut[name0[fid]] = firstOut[name0[fid]] || []).push(state.year); }
    }
    if (state.month === 1 && (state.year - 191) % 5 === 0) {
      const cs = S.cityList(state);
      const owned = cs.filter((c) => c.owner);
      const forces = Object.values(state.forces).filter((f) => f.alive);
      const sizes = forces.map((f) => S.citiesOf(state, f.id).length).sort((a, b) => b - a);
      const mix = {};
      let troops = 0;
      for (const c of owned) {
        troops += c.troops;
        for (const [k, v] of Object.entries(S.mixCounts(S.garrisonUnit(c), c.troops))) mix[k] = (mix[k] || 0) + v;
      }
      const os = Object.values(state.officers);
      (snaps[state.year] = snaps[state.year] || []).push({
        forces: forces.length, top: sizes[0], second: sizes[1] || 0, vacant: cs.length - owned.length,
        troops, perCity: troops / Math.max(1, owned.length),
        gold: avg(owned.map((c) => c.gold)), food: avg(owned.map((c) => c.food)),
        order: avg(owned.map((c) => c.order)), pop: avg(owned.map((c) => c.pop)),
        farm: avg(owned.map((c) => c.farm / c.farmMax)), train: avg(owned.map((c) => c.train)),
        manpower: avg(owned.map((c) => c.manpower / S.manpowerMax(c))),
        weary: avg(forces.map((f) => f.weariness)),
        serving: os.filter((o) => o.status === "serving").length, free: os.filter((o) => o.status === "free").length,
        loyalty: avg(os.filter((o) => o.status === "serving" && !S.isRuler(state, o)).map((o) => o.loyalty)),
        mix,
        tech: avg(forces.map((f) => avg(Object.keys(S.TECH).map((k) => S.techLevel(state, f.id, k))))),
      });
    }
  }
  const top = Object.values(state.forces).filter((f) => f.alive)
    .sort((a, b) => S.citiesOf(state, b.id).length - S.citiesOf(state, a.id).length)[0];
  const first = state.officers[top.ruler].name;
  const key = `${top.name}${first !== top.name ? "→" + first : ""}`;
  winners[key] = (winners[key] || 0) + 1;
  if (state.over) ends.push(state.year);
}

const f1 = (n) => n.toFixed(1);
console.log("year  forces top 2nd vacant | troops/city gold  food  order farm% train mp%  weary | serving free loyal tech | army");
for (const y of Object.keys(snaps).sort()) {
  const s = snaps[y];
  const a = (k) => avg(s.map((x) => x[k]));
  const mix = {};
  for (const x of s) for (const [k, v] of Object.entries(x.mix)) mix[k] = (mix[k] || 0) + v;
  const total = Object.values(mix).reduce((p, v) => p + v, 0) || 1;
  const army = Object.entries(mix).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, v]) => `${S.UNITS[k].name}${Math.round((v / total) * 100)}`).join(" ");
  console.log(`${y}  ${f1(a("forces")).padStart(5)} ${f1(a("top")).padStart(4)} ${f1(a("second")).padStart(4)} ${f1(a("vacant")).padStart(5)} | ` +
    `${Math.round(a("perCity")).toString().padStart(7)} ${Math.round(a("gold")).toString().padStart(8)} ${Math.round(a("food")).toString().padStart(6)} ` +
    `${Math.round(a("order")).toString().padStart(4)} ${Math.round(a("farm") * 100).toString().padStart(5)} ${Math.round(a("train")).toString().padStart(5)} ` +
    `${Math.round(a("manpower") * 100).toString().padStart(4)} ${Math.round(a("weary")).toString().padStart(5)} | ` +
    `${Math.round(a("serving")).toString().padStart(6)} ${Math.round(a("free")).toString().padStart(5)} ${Math.round(a("loyalty")).toString().padStart(5)} ${f1(a("tech")).padStart(4)} | ${army}  (${s.length})`);
}
console.log("\nlargest at the end:", winners);
console.log("united in:", ends.sort((a, b) => a - b).join(", ") || "never", `(${ends.length}/${games})`);
console.log(`battles per game: ${Math.round(battles / games)} (sieges ${Math.round(sieges / games)}, won ${Math.round((siegeWins / Math.max(1, sieges)) * 100)}%; field ${Math.round(fields / games)})`);
console.log("fell (median year):", Object.entries(firstOut).map(([n, ys]) => `${n} ${ys.sort()[Math.floor(ys.length / 2)]}×${ys.length}`).join(", "));
