// Home districts (본관) of the people in data/people.js, who unlike those of
// data/roster.js have no home there. Each is the map city nearest the
// commandery the histories name (정사, 후한서, 배송지 주석); where the histories
// are silent, the place they served from around 190 (marked with ?).
// Used for factions (js/factions.js).
(function (S) {
  const LINES = `
  동탁 longxi  이유 longxi?  우보 longxi?  동월 longxi?  동민 longxi  호진 wuwei?  번조 wuwei?
  여포 xihe  고순 xihe?  이숙 xihe  서영 xuantu  장료 yanmen  장양 yanmen
  채옹 chenliu  이각 wuwei  곽사 zhangye  장제 wuwei  가후 wuwei  장수 wuwei  단외 wuwei
  왕윤 taiyuan  개훈 hanyang  황보숭 hanyang  부손 wuwei
  원소 runan  원담 runan  원희 runan  원상 runan  원술 runan  원윤 runan
  안량 weijun?  문추 weijun?  고람 weijun?  전풍 julu  저수 julu  심배 weijun  봉기 nanyang  허유 nanyang
  곽도 yingchuan  순심 yingchuan  신평 yingchuan  신비 yingchuan  한복 yingchuan  고간 chenliu  진림 guangling
  장합 hejian  국의 jincheng
  조조 qiao  하후돈 qiao  하후연 qiao  조인 qiao  조홍 qiao  조순 qiao  조휴 qiao  조진 qiao
  조비 qiao  조식 qiao  조창 qiao  하후패 qiao  허저 qiao  사환 peiguo
  악진 dongjun  이전 shanyang  순욱 yingchuan  순유 yingchuan  종요 yingchuan  곽가 yingchuan  희지재 yingchuan
  진군 yingchuan  서서 yingchuan  종회 yingchuan
  장막 shanyang  장초 shanyang  유대 donglai  포신 taishan  우금 taishan  장홍 guangling
  유총 chenliu  낙준 kuaiji
  기령 nanyang?  장훈 nanyang?  염상 nanyang?  이풍 nanyang?  뇌박 jiujiang?  교유 jiujiang?  양홍 jiujiang?
  진란 jiujiang?  진기 jiujiang?  유훈 donghai
  손견 wujun  손책 wujun  손권 wujun  손익 wujun  손정 wujun  손분 wujun  손하 wujun  손소 wujun  오경 wujun
  정보 liaoxi  황개 lingling  한당 liaoxi  조무 wujun?  주치 danyang  서곤 wujun
  유표 shanyang  유반 shanyang  유기 shanyang  유종 shanyang  괴량 xiangyang  괴월 xiangyang  채모 xiangyang
  왕위 xiangyang?  장윤 xiangyang?  문빙 nanyang  황충 nanyang  한숭 nanyang  유선(劉先) lingling  황조 jiangxia
  공손찬 liaoxi  공손범 liaoxi  공손속 liaoxi  엄강 liaoxi?  전해 liaoxi?  관정 liaoxi?  단경 liaoxi?  추단 zhuo?
  조운 changshan  유우 donghai  선우보 guangyang  선우은 guangyang  전주 liaoxi  염유 guangyang  위유 zhuo?  제주 guangyang?
  공손도 liaodong  공손강 liaodong  공손공 liaodong  유의 liaodong?  양의(陽儀) liaodong
  유비 zhuo  관우 hedong  장비 zhuo  간옹 zhuo  관평 hedong  관흥 hedong  장포 zhuo
  공융 taishan  왕수 beihai  도겸 danyang  미축 donghai  미방 donghai  조굉 danyang  왕랑 donghai  조욱 donghai
  진규 xiapi  진등 xiapi  장패 taishan  손관 taishan  조표 danyang?  착융 danyang  설례 pengcheng?
  유언 jiangxia  유장 jiangxia  오의 chenliu  방희 henan  장임 shujun  장송 shujun  조위 bajun  장숙 shujun
  가룡 shujun?  임기 shujun?  황권 bajun  엄안 bajun
  장로 peiguo  장위 peiguo  염포 bajun  양송 hanzhong  양앙 hanzhong  양백 hanzhong
  마등 youfufeng  마초 youfufeng  마휴 youfufeng  마철 youfufeng  마대 youfufeng  방덕 hanyang
  한수 jincheng  성의 jincheng  염행 jincheng  양추 hanyang  후선 jincheng
  정은 hedong  이감 hedong  장횡 zuopingyi?  양흥 zuopingyi?  마완 zuopingyi?
  엄백호 wujun  엄여 wujun  허공 wujun
  사섭 cangwu  사휘 cangwu  사일 cangwu  사유 cangwu  사무 cangwu
  주준 kuaiji  법정 youfufeng  서황 hedong  양봉 hedong?  한섬 hedong?  가규 hedong
  사마랑 henei  사마의 henei  사마부 henei  한호 henei
  전위 chenliu  정욱 dongjun  진궁 dongjun  만총 shanyang  장연 changshan  전예 guangyang
  태사자 donglai  유요 donglai  왕기 donglai  화흠 pingyuan  곽회 taiyuan  학소 taiyuan
  노숙 xiapi  보즐 xiapi  장소 pengcheng  장굉 guangling  장흠 jiujiang  주태 jiujiang  주유 lujiang  진무 lujiang
  장영 danyang?  번능 danyang?  우미 danyang?  능조 wujun  능통 wujun  육손 wujun  주환 wujun
  하제 kuaiji  우번 kuaiji  감택 kuaiji  여몽 runan  반장 dongjun  서성 donghai
  제갈량 donghai  제갈근 donghai  방통 xiangyang  마량 xiangyang  마속 xiangyang  위연 nanyang  등애 nanyang
  등지 nanyang  감녕 bajun  왕평 bajun  강유 hanyang  비의 jiangxia  동윤 nanjun  장완 lingling  유파 lingling
  장억 shujun
`;
  S.HOMES = {};
  for (const m of LINES.matchAll(/(\S+) ([a-z]+)\??/g)) S.HOMES[m[1]] = m[2];
  // Where a person comes from: the roster's home, else this table. (Not
  // written into S.PEOPLE, whose home also says where a scenario places people.)
  S.homeOf = (name) => (S.PEOPLE[name] && S.PEOPLE[name].home) || S.HOMES[name] || null;
})(globalThis.SAM = globalThis.SAM || {});
