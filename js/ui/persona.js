// The player's character (장수제): his window, the choice of heir, and what
// he can do in the place he stands (js/persona.js).
(function (S) {
  const UI = S.UI, $ = UI.$;
  let state = null;
  UI.bind((s) => { state = s; });

  const title = (text) => `<h2>${text}</h2>`;
  const sel = (id, opts) => `<select id="pa_${id}">${opts.map(([v, label]) => `<option value="${v}">${label}</option>`).join("")}</select>`;
  const go = (kind, label, extra) => `<button data-action="pa" data-kind="${kind}"${extra || ""}>${label}</button>`;
  const row = (head, body, hint) => `<div class="pa-row"><b>${head}</b> ${body}${hint ? ` <span class="hint">${hint}</span>` : ""}</div>`;
  const pct = (n) => `${n}%`;
  const rulerOf = (fid) => (fid && state.forces[fid] ? state.officers[state.forces[fid].ruler] : null);

  UI.roleLabel = () => S.ROLES[S.playerRole(state)] || "-";
  // Where he stands, in one line.
  UI.personaLine = function () {
    const o = S.playerChar(state);
    if (!o) return "";
    const role = S.playerRole(state);
    const where = S.placeName(state, o.city);
    if (role === "free") return `재야 · ${where}`;
    if (role === "captive") return `${S.forceName(state, o.captor)}의 포로 · ${where}`;
    const off = S.officeOf(state, o);
    const gov = S.governs(state, o);
    if (role === "returning") return `${S.forceName(state, o.force)} 군주 · 귀환 중 (${o.homeBy - S.today(state)}일 남음)`;
    return `${S.forceName(state, o.force)} ${role === "ruler" ? "군주" : off ? off.name : gov ? `${gov.name} 태수` : role === "court" ? "조정" : "장수"} · ${where}`;
  };

  UI.showPersona = function () {
    if (!state) return;
    if (state.heirPick) return UI.showHeirPick();
    const o = S.playerChar(state);
    if (!o) { UI.toast("관전 중에는 인물이 없습니다."); return; }
    const role = S.playerRole(state);
    const r = o.status === "serving" ? rulerOf(o.force) : null;
    const off = S.officeOf(state, o);
    const block = S.personaBlocked(state);
    const ps = S.persona(state);
    let html = title(`${o.name} <span class="hint">${UI.personaLine()}</span>`) +
      `<div class="otable"><table><tr>${UI.abilityHead()}<th>명성</th><th>공적</th><th>만족</th><th>충성</th><th>야망</th></tr>` +
      `<tr>${UI.abilityCells(o)}<td>${o.fame || 0}</td><td>${o.merit || 0}</td><td>${o.content == null ? "-" : o.content}</td><td>${o.status === "serving" && !S.isRuler(state, o) ? o.loyalty : "-"}</td><td>${S.ambitionLabels(state, o).join(" ") || "-"}</td></tr></table></div>` +
      (S.traitsOf(o).length || S.skillsOf(o).length ? `<p>${UI.traitTags(o)} ${UI.skillTags(o)}</p>` : "") +
      (r && r !== o ? `<p>주군 <b>${r.name}</b> · 주군이 나를 보는 의견 <b>${UI.signed(S.opinion(state, r, o))}</b> · 내가 주군을 보는 의견 ${UI.signed(S.opinion(state, o, r))}${off ? ` · 관직 <b>${off.name}</b>` : ""}</p>` : "") +
      `<p class="hint">${block ? `이번 달 행동: ${block}` : "이번 달 행동: 한 가지를 할 수 있습니다. (조정 성향과 다스리는 방식은 언제든 바꿉니다.)"}</p>`;

    if (role === "ruler") {
      html += `<p>군주로서 세력의 모든 명령을 내립니다. 도시 창, 외교, 관직, 조정, 황실 창을 쓰십시오.</p>`;
    }
    if (role === "returning") {
      html += `<p>풀려나 ${S.ro(S.placeName(state, o.city))} 돌아가는 길입니다. 돌아갈 때까지 세력 전체의 일(출정, 외교, 관직, 조정, 황실)은 멈추고, 각 태수가 자기 성을 알아서 다스립니다.</p>`;
    }
    // 교류: anyone at hand.
    const peers = S.minglePeers(state);
    if (peers.length && role !== "captive") {
      html += `<h3>교류</h3>` + row("어울린다", sel("mingle", peers.sort((a, b) => S.opinion(state, a, o) - S.opinion(state, b, o)).map((x) =>
        [x.id, `${x.name} (${x.status === "free" ? "재야" : S.forceName(state, x.force)}, 그의 의견 ${S.opinion(state, x, o)})`])) + go("mingle", "교류"),
        "서로의 의견이 오릅니다. 의견은 관직 청원, 부임, 진언, 사관이 받아들여질지에 듭니다.");
    }
    if (o.status === "serving" && role !== "ruler" && role !== "returning") {
      // The court.
      html += `<h3>조정</h3>` +
        row("조정 성향", ["auto", "war", "peace"].map((k) => `<button data-action="paStance" data-v="${k}" class="${ps.stance === k ? "primary" : ""}">${{ auto: "내 뜻대로(자동)", war: "주전", peace: "주화" }[k]}</button>`).join(" "),
          "회의에서 내 인물이 어느 쪽에 서는지. 목소리가 클수록 출정과 강화의 결정이 움직입니다.");
      const why = S.canMemorial(state);
      if (why) html += row("진언", `<span class="hint">${why}</span>`);
      else {
        const wars = S.expeditionList(state, o.force);
        const foes = S.peaceFoes(state, o.force);
        if (wars.length) {
          html += row("출정 진언", sel("war", wars.map((e) => {
            const odds = S.memorialOdds(state, { kind: "war", foe: e.t.owner, target: e.t.id, ratio: e.ratio, team: e.team });
            return [e.t.id, `${S.forceName(state, e.t.owner)}의 ${e.t.name} (승산 ${e.ratio}, 조정 ${S.supportLabel(odds.d.support)}${odds.adopted ? ", 받아들일 듯" : ""})`];
          })) + go("war", "진언한다"), "주군이 받아들이면 수도의 주력군이 바로 출진하고, 결과의 책임과 공은 진언한 사람에게 먼저 갑니다.");
        } else html += row("출정 진언", `<span class="hint">지금은 수도의 주력군이 나갈 수 없습니다.</span>`);
        if (foes.length) {
          html += row("강화 진언", sel("peace", foes.map((f) => {
            const terms = S.peaceTerms(state, o.force, f);
            const odds = S.memorialOdds(state, { kind: "peace", foe: f, losing: terms.loser === o.force });
            return [f, `${S.forceName(state, f)} (조정 ${S.supportLabel(odds.d.support)}${odds.adopted ? ", 받아들일 듯" : ""})`];
          })) + go("peace", "진언한다"));
        }
      }
      // Seats and posts.
      const seats = S.seatsToAsk(state);
      if (seats.length) {
        html += row("관직 청원", sel("seat", seats.map((x) => {
          const h = S.holder(state, o.force, x.key);
          return [x.key, `${x.name} (${x.rank}품${h ? `, 지금 ${h.name}` : ", 빈자리"}${S.grantAsk(state, o.force, o, x.key) ? ", 받아들일 듯" : ""})`];
        })) + go("seat", "청한다"), "거절당하면 만족이 떨어지고 한동안 다시 청할 수 없습니다.");
      }
      const posts = S.postsToAsk(state);
      if (posts.length) {
        const capId = S.capitalOf(state, o.force);
        html += row("부임 청원", sel("post", posts.map((c) => [c.id, c.id === capId ? `${c.name} (수도로 돌아감)` : `${c.name} 태수 (${pct(S.postChance(state, c))}${S.cityHead(state, c) ? `, 지금 ${S.cityHead(state, c).name}` : ""})`])) + go("post", "청한다"),
          "태수가 되면 그 성은 직접 다스립니다. 수도에 있으면 조정에 앉고 주력군과 함께 출정합니다.");
      }
      const rivals = S.slanderTargets(state);
      if (rivals.length) {
        html += row("참소", sel("slander", rivals.sort((a, b) => S.worthOf(b) - S.worthOf(a)).map((x) => [x.id, `${x.name} (믿을 확률 ${pct(S.believeChance(state, o.force, o, x))})`])) + go("slander", "참소한다"),
          "주군이 믿으면 상대는 충성과 유대를 잃고, 태수였다면 수도로 불려 갑니다. 믿지 않으면 내가 체면을 잃습니다. 상대는 나를 미워합니다.");
      }
      const flee = S.fleeOptions(state);
      html += `<h3>거취</h3>` +
        (flee.length ? row("출분", sel("flee", flee.map((x) => [x.fid, `${S.forceName(state, x.fid)} (${pct(x.p)})`])) + go("flee", "달아난다"),
          "받아 주면 그 세력의 국경 도시로 갑니다. 공적은 0에서 다시 시작합니다.") : "") +
        row("하야", go("leave", "섬기기를 그만둔다"), "재야가 됩니다. 주군은 서운해합니다.");
    }
    if (role === "governor") {
      const c = state.cities[S.playerCity(state)];
      html += `<h3>태수: ${c.name}</h3><p class="hint">이 성의 명령은 도시 창에서 직접 내립니다. 컴퓨터 군주는 이 성에 손대지 않지만, 넘치는 병사와 상납은 수도로 갑니다.</p>` +
        row("다스리는 방식", Object.keys(S.GOVERNOR_TYPES).map((k) => `<button data-action="paStyle" data-v="${k}" class="${ps.style === k ? "primary" : ""}" title="${S.GOVERNOR_TYPES[k]}">${k}형</button>`).join(" "),
          ps.style === "할거" ? "할거하면 상납을 덜 보내지만 주군의 의견이 매달 떨어집니다." : "") +
        `<p><button data-action="select" data-city="${c.id}">${c.name} 도시 창</button></p>`;
      const raids = S.raidOptions(state);
      if (raids.length) html += row("국경 습격", sel("raid", raids.map((t) => [t.id, `${S.forceName(state, t.owner)}의 ${t.name} (병력 ${UI.fmt(t.troops)})`])) + go("raid", "습격한다"),
        `수비대의 1/4(${S.CONDUCT.raid.min}~${S.CONDUCT.raid.max}명)로 노략합니다. 관계가 나빠지고 주군이 문책할 수 있습니다.`);
      html += row("반기", go("rebel", "반기를 든다"), "이 성(과 불만인 같은 파벌 태수들의 성)을 들고 독립합니다. 그때부터 군주가 됩니다.");
    }
    if (role === "free") {
      const c = state.cities[o.city];
      const ways = S.travelOptions(state);
      html += `<h3>재야</h3>` +
        (ways.length ? row("이동", sel("travel", ways.map((x) => [x.id, `${x.name} (${x.owner ? S.forceName(state, x.owner) : "공백지"})`])) + go("travel", "옮겨 간다")) : "") +
        (c && c.owner ? row("사관", go("serve", `${S.forceName(state, c.owner)}에 사관한다 (${pct(S.serveChance(state))})`), "명성, 능력, 그 세력에 대한 감정, 군주의 의견이 받아들여질지를 정합니다.") : "") +
        row("거병", S.canRise(state) ? `<span class="hint">${S.canRise(state)}</span>` : go("rise", `${c.name}에서 거병한다`), "아무도 다스리지 않는 도시에서 세력을 세웁니다. 나를 좋게 보는 재야 인물이 따릅니다.");
    }
    if (role === "captive") {
      // A ruler does not go over (S.pSurrender).
      const lord = o.lord || S.isRuler(state, o);
      html += `<h3>포로</h3>` + (lord ? "" : row("투항", go("surrender", `${S.forceName(state, o.captor)}에 투항한다`))) +
        row("탈주", go("escape", `달아난다 (${pct(S.selfEscapeChance(state))})`), "성공하면 내 세력의 가까운 도시로 돌아가고, 세력이 없으면 재야가 됩니다.");
    }
    html += `<p class="hint">자세한 것은 도움말 「장수제」를 보세요.</p><div class="footer"><button class="primary" data-action="close">닫기</button></div>`;
    UI.openModal(html, true);
  };

  // ---------- the heir ----------
  UI.showHeirPick = function () {
    const h = state.heirPick;
    if (!h) return UI.showPersona();
    const from = state.officers[h.from];
    const list = h.list.map((id) => state.officers[id]).filter(Boolean);
    const rows = list.map((x) => `<tr><td><b>${x.name}</b></td><td>${S.heirReason(state, from, x)}</td>` +
      `<td>${x.status === "free" ? "재야" : x.status === "captive" ? "포로" : `${S.forceName(state, x.force)}${S.isRuler(state, x) ? " 군주" : ""}`}</td>${UI.abilityCells(x)}<td>${x.fame || 0}</td>` +
      `<td><button class="primary" data-action="heirPick" data-id="${x.id}">이어받는다</button></td></tr>`).join("");
    UI.openModal(title(`${from.name}의 뒤를 이을 인물`) +
      `<p>${S.josa(from.name, "이", "가")} ${from.status === "retired" ? "세상을 등졌습니다" : "세상을 떠났습니다"}. 일족, 인연이 깊은 사람, 가까웠던 사람 가운데 한 명을 골라 이어 갑니다.</p>` +
      `<div class="otable"><table><tr><th>이름</th><th>관계</th><th>자리</th>${UI.abilityHead()}<th>명성</th><th></th></tr>${rows}</table></div>` +
      `<p class="hint">고르기 전까지 시간은 흐르지 않습니다. 창을 닫았다면 위쪽의 「인물」 버튼으로 다시 엽니다.</p>` +
      `<div class="footer"><button data-action="close">나중에</button></div>`, true);
  };

  // ---------- choosing at the start ----------
  UI.showCharPick = function (fid, onPick) {
    const f = state.forces[fid];
    const list = S.playable(state, fid);
    const seat = (o) => {
      if (o.status === "free") return "재야";
      if (S.isRuler(state, o)) return "<b>군주</b>";
      const off = S.officeOf(state, o);
      if (off) return off.name;
      const g = S.governs(state, o);
      return g ? `${g.name} 태수` : o.city === S.capitalOf(state, fid) ? "조정" : "장수";
    };
    UI.charPicked = onPick;
    const rows = list.map((o) => `<tr><td><b>${o.name}</b>${UI.personMarks(o)}</td><td>${seat(o)}</td><td>${S.placeName(state, o.city)}</td>${UI.abilityCells(o)}<td>${o.fame || 0}</td>` +
      `<td>${S.ambitionLabels(state, o).join(" ") || "-"}</td><td><button class="${S.isRuler(state, o) ? "primary" : ""}" data-action="charPick" data-id="${o.id}">이 인물로</button></td></tr>`).join("");
    UI.openModal(title(`${f.name}군 — 누구로 할까요?`) +
      `<p class="hint">군주를 고르면 지금까지처럼 세력 전체를 다스립니다. 신하를 고르면 그 자리(조정, 태수, 장수)에서 할 수 있는 일만 하고, 세력의 결정은 컴퓨터 군주가 내립니다. 재야 인물은 떠돌며 섬길 곳을 찾거나 거병합니다.</p>` +
      `<div class="otable"><table><tr><th>이름</th><th>자리</th><th>있는 곳</th>${UI.abilityHead()}<th>명성</th><th>야망</th><th></th></tr>${rows}</table></div>` +
      `<div class="footer"><button data-action="newGame">뒤로</button></div>`, true);
    $("#modal .box").classList.add("titlebox");
    UI.modalLocked = true; // the new game begins only with a pick (or 뒤로)
  };

  Object.assign(UI.actions, {
    persona: () => state && UI.showPersona(),
    paStance: (d) => { S.persona(state).stance = d.v; UI.showPersona(); },
    paStyle: (d) => { if (UI.result(S.setStyle(state, d.v))) UI.showPersona(); },
    pa: (d) => {
      const el = $("#pa_" + d.kind);
      const v = el ? el.value : null;
      const run = {
        mingle: () => S.pMingle(state, v), war: () => S.memorial(state, "war", v), peace: () => S.memorial(state, "peace", v),
        seat: () => S.pAskSeat(state, v), post: () => S.pAskPost(state, v), slander: () => S.pSlander(state, v), flee: () => S.pFlee(state, v),
        leave: () => (confirm("주군을 떠나 재야가 될까요?") ? S.pLeave(state) : null),
        raid: () => S.pRaid(state, v), rebel: () => (confirm("정말 반기를 들까요? 돌이킬 수 없습니다.") ? S.pRebel(state) : null),
        travel: () => S.pTravel(state, v), serve: () => S.pServe(state), rise: () => S.pRise(state),
        surrender: () => S.pSurrender(state), escape: () => S.pEscape(state),
      }[d.kind];
      const r = run && run();
      if (!r) return;
      if (UI.result(r)) {
        const o = S.playerChar(state);
        if (o && (d.kind === "travel" || d.kind === "post" || d.kind === "flee" || d.kind === "serve" || d.kind === "rise" || d.kind === "rebel")) { UI.selected = o.city; UI.centerOn(state.cities[o.city]); UI.renderAll(); }
        UI.showPersona();
      }
    },
    heirPick: (d) => {
      if (!UI.result(S.takeHeir(state, d.id))) return;
      const o = S.playerChar(state);
      UI.closeModal();
      if (o && state.cities[o.city]) { UI.selected = o.city; UI.centerOn(state.cities[o.city]); }
      UI.renderAll();
    },
    charPick: (d) => { S.setPlayer(state, d.id); if (UI.charPicked) UI.charPicked(); },
  });
})(globalThis.SAM = globalThis.SAM || {});
