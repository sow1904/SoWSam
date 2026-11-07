// Headless all-AI simulation for balance checks.
// usage: node tools/sim.js [games=20] [years=30]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "js");
for (const f of ["data/cities.js", "data/scenario190.js", "engine.js", "ai.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}
const S = globalThis.SAM;

const games = +(process.argv[2] || 20);
const years = +(process.argv[3] || 30);
const winners = {};
const endYears = [];
let battles = 0;

for (let g = 0; g < games; g++) {
  const state = S.newGame(S.SCENARIO_190, null, 1000 + g);
  for (let m = 0; m < years * 12 && !state.over; m++) {
    S.advanceTurn(state, () => battles++);
    validate(state);
    if (g === 0 && state.month === 1 && (state.year - 190) % 5 === 0) {
      const alive = Object.values(state.forces).filter((f) => f.alive)
        .map((f) => `${f.name}:${S.citiesOf(state, f.id).length}`).join(" ");
      console.log(`${state.year}: ${alive}`);
    }
  }
  const top = Object.values(state.forces).filter((f) => f.alive)
    .sort((a, b) => S.citiesOf(state, b.id).length - S.citiesOf(state, a.id).length)[0];
  const key = state.over ? `${top.name}(통일)` : `${top.name}(${S.citiesOf(state, top.id).length}성)`;
  winners[key] = (winners[key] || 0) + 1;
  if (state.over) endYears.push(state.year);
}

console.log("\nresults:", winners);
console.log("unified in:", endYears.sort((a, b) => a - b).join(", ") || "none");
console.log("battles per game:", Math.round(battles / games));

function validate(state) {
  for (const c of Object.values(state.cities)) {
    for (const k of ["gold", "food", "troops", "pop"]) {
      if (!Number.isFinite(c[k]) || c[k] < 0) throw new Error(`${c.name}.${k} = ${c[k]}`);
    }
  }
  for (const o of Object.values(state.officers)) {
    if (o.status === "serving" && state.cities[o.city].owner !== o.force) {
      throw new Error(`${o.name} serves ${o.force} but sits in ${o.city} owned by ${state.cities[o.city].owner}`);
    }
  }
}
