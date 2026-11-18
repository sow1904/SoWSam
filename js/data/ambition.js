// Regions (지방) and how far a lord means to reach (군주 성향).
//
// The regions group the provinces as the user laid them out, close to
// 삼국지14's but split so that each is something a lord of the age actually
// fought to hold: 강남 is 손권's 양주 with 형남, the lands he would not give
// up; 중원 is 예주 and 서주 and, of this map's own divisions, 형북 (남양 and
// 양양 are the road from 허도 to the 한수).
//
// Reach: 성 (content with his own commandery, like 장로 in 한중), 주 (one
// province, like 사섭 in 교주 or 공손씨 in 요동), 지방 (a region, like
// 손권), 천하 (the whole realm). Every officer has one, since anyone may come
// to rule. The histories decide for those named below; the others follow
// their nature: the ambitious and able reach for the realm, the ambitious
// for a region, the content for their own city, the rest by their ability.
// why: the user's design for ruler tendencies: a lord's wars stop at what he
// means to hold.
(function (S) {
  S.REGIONS = {
    bashu: { name: "파촉", provs: ["yi", "nanzhong"] },
    xibei: { name: "서북", provs: ["yong", "liang"] },
    jiangnan: { name: "강남", provs: ["yang", "jingnan"] },
    nanyue: { name: "남월", provs: ["jiao"] },
    haidong: { name: "해동", provs: ["liaodong"] },
    hebei: { name: "하북", provs: ["you", "bing", "ji"] },
    henan: { name: "하남", provs: ["sili", "yan", "qing"] },
    zhongyuan: { name: "중원", provs: ["yu", "xu", "jingbei"] },
  };
  S.REGION_OF = {};
  for (const [id, r] of Object.entries(S.REGIONS)) for (const p of r.provs) S.REGION_OF[p] = id;
  S.regionOf = (c) => (c && c.prov ? S.REGION_OF[c.prov] : null);

  S.REACH = ["성", "주", "지방", "천하"];
  S.REACH_HELP = {
    성: "자기 성 하나에 만족합니다. 빼앗긴 성을 되찾을 때 말고는 먼저 공격하지 않습니다.",
    주: "주 하나를 다스리려 합니다. 수도가 있는 주와, 성의 절반 이상을 가진 주 안에서만 공격합니다.",
    지방: "지방 하나를 다스리려 합니다. 수도가 있는 지방과, 성의 절반 이상을 가진 지방 안에서만 공격합니다.",
    천하: "천하를 모두 삼키려 합니다. 어디든 공격합니다.",
  };

  // From the histories. Lords first, then subjects who aimed beyond their
  // station (주유's 천하이분지계, 노숙's 탑상책) or were content below it.
  const LINES = `
  천하: 동탁 원소 원술 조조 조비 조예 손책 유비 사마의 사마사 사마소 사마염 종회
        주유 노숙 제갈량 강유 곽가 법정 방통 진궁 위연
  지방: 손견 손권 공손찬 원담 원상 유언 마초 한수 손등 손화 손패 손휴 유선 육손 여몽
        등애 조창 이각 곽사 가비능 장임
  주:   여포 유표 유기 유종 유장 마등 마휴 마철 공손도 공손강 공손공 공손연 사섭 사휘 엄백호
        도겸 유우 한복 원희 유요 맹획 사마랑 장수
  성:   장로 장위 장막 장초 포신 유대 유총 공융 왕랑 화흠 장연 장양 장홍 왕광 동승 왕윤
        조식 사일 사유 사무 축융
`;
  const SET = {};
  for (const line of LINES.trim().split(/\n(?=\s*\S+:)/)) {
    const [k, names] = line.split(":");
    for (const n of names.trim().split(/\s+/)) SET[n] = k.trim();
  }
  S.REACH_SET = SET;

  // An officer's reach: the histories, else his nature and ability.
  S.reachOf = function (o) {
    if (!o) return "주";
    if (SET[o.name]) return SET[o.name];
    const able = ((o.cmd || 0) + (o.pol || 0) + (o.strat || 0)) / 3;
    if (S.hasTrait(o, "야심")) return able >= 75 ? "천하" : "지방";
    if (S.hasTrait(o, "무욕")) return "성";
    if (S.hasTrait(o, "의리")) return "주";
    return ((o.cmd || 0) + (o.pol || 0)) / 2 >= 70 ? "주" : "성";
  };
})(globalThis.SAM = globalThis.SAM || {});
