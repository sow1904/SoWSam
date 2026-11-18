// Ties between people: sworn brothers, trusted lieutenants, old friends, and
// feuds. "A B value", -100 to 100. Kin of one clan (data/roster.js) count as
// 80 unless listed here. These are this game's own readings of the histories
// (정사 and 배송지 주석); a few follow the novel where the histories are silent.
(function (S) {
  const LINES = `
  유비 관우 95      유비 장비 95      관우 장비 90      유비 간옹 80
  유비 조운 80      유비 미축 80      유비 제갈량 90    유비 법정 75
  유비 방통 70      제갈량 강유 85    제갈량 마속 80    제갈량 장완 80
  조조 하후돈 90    조조 하후연 85    조조 순욱 80      조조 전위 85
  조조 허저 85      조조 곽가 85      조조 포신 80
  여포 고순 80      여포 진궁 75      여포 장료 55
  손견 정보 85      손견 황개 85      손견 한당 85      손견 조무 85
  손책 주유 95      손책 태사자 80    손책 장소 80      손권 주태 85
  손권 노숙 80      손권 제갈근 85
  원소 심배 80      원소 저수 70      원소 전풍 65      원소 안량 75
  원소 문추 75      원술 기령 80      원술 장훈 70
  유장 장임 80      유장 황권 70      유표 문빙 80      유표 괴월 70
  유표 황조 70      유우 전주 90      유우 선우보 85    공손찬 관정 85
  장초 장홍 90      공융 왕수 80      공융 태사자 70
  마등 방덕 70      마초 방덕 75      동탁 이유 80      동탁 이각 70
  동탁 곽사 70
  조비 사마의 75    조비 진군 75      조비 가후 60      조식 정의 85
  조식 양수 80      조비 정의 -50     원상 심배 85      원상 봉기 80
  원담 곽도 80      원담 신평 75      원담 심배 -40     유종 채모 85
  유종 장윤 70      유기 이적 70      유기 채모 -40     손화 육손 70
  손화 고담 70      손화 오찬 70      손패 전종 75      손등 제갈각 75
  동탁 원소 -80     동탁 원술 -80     동탁 손견 -70     동탁 조조 -60
  동탁 황보숭 -50   동탁 왕윤 -60     원소 원술 -50     원소 공손찬 -60
  유우 공손찬 -60   장비 여포 -50
`;
  S.TIES = {};
  const key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  for (const m of LINES.matchAll(/(\S+) (\S+) (-?\d+)/g)) S.TIES[key(m[1], m[2])] = +m[3];
  // How two people stand with each other, by name.
  S.tie = function (a, b) {
    if (!a || !b || a === b) return 0;
    const v = S.TIES[key(a, b)];
    if (v !== undefined) return v;
    const ka = S.CLAN && S.CLAN[a], kb = S.CLAN && S.CLAN[b];
    return ka && kb && ka.clan === kb.clan ? 80 : 0;
  };
})(globalThis.SAM = globalThis.SAM || {});
