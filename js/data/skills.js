// Specialties (특기): things an officer can do that others cannot, or does
// notably better. Only officers with a clear record in the histories get one.
// Field, siege and naval specialties will join this list later.
(function (S) {
  S.SKILL_HELP = {
    축성: "관문이나 요새를 새로 쌓을 수 있습니다.",
  };
  // 공손찬 역경 · 만총 합비신성 · 학소 진창성 · 여몽 유수오 · 서성 강변의 의성(疑城)
  // 손권 석두성 · 제갈량 각도와 한·악 두 성 · 위연 한중의 위(圍) · 강유 한중 수비 재편
  const LINES = `
  공손찬 축성  만총 축성  학소 축성  여몽 축성  서성 축성
  손권 축성  제갈량 축성  위연 축성  강유 축성
`;
  S.SKILLS = {};
  for (const m of LINES.matchAll(/(\S+)((?: 축성)+)/g)) S.SKILLS[m[1]] = m[2].trim().split(" ");
  S.skillsOf = (o) => (o && S.SKILLS[o.name]) || [];
  S.hasSkill = (o, k) => S.skillsOf(o).includes(k);
})(globalThis.SAM = globalThis.SAM || {});
