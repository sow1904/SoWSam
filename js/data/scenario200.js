// Scenario: 200년 관도대전.
// February 200. 원소 has destroyed 공손찬 (역경, spring 199) and holds the
// four provinces north of the 황하: 기주, 청주 (원담), 유주 (원희) and 병주
// (고간). His army of a hundred thousand is gathering at 업 to cross at 여양;
// 진림 has written the call to arms against 조조, and 안량 is about to
// besiege 백마. 조조 holds the emperor at 허도 and the lands between the
// 황하 and the 회수; he has just driven 유비 out of 서주 (January 200),
// taking 관우, and put down the plot of 동승. 유비 has fled to 원소.
// 장수 came over to 조조 at the end of 199 on 가후's advice; 손책 has taken
// 여강 and 예장 and is said to be planning a raid on 허도; 유표 promised
// 원소 help and sent none.
//
// Who held which commandery follows the histories, with the map's usual
// simplifications:
//   - 청주 is 원담's: he had taken 북해 from 공융 in 196. 평원 (on the map in
//     기주) stays with the main realm.
//   - 서주: 하비, 팽성 and 광릉 (진등) are 조조's again. 동해 is given to
//     조조 under 장패, who held the coast of 낭야 and 동해 for him; 창희,
//     who rose with 유비, is left out of office (확인 필요: where he stood
//     in February).
//   - 구강 is given to 조조 (his 양주자사 엄상 sat at 수춘 until killed in
//     200; 확인 필요). 여강 and 예장 are 손책's (환성 fell late in 199).
//   - 관중 answers to 조조 through 종요 at 장안 (사례교위, 199); 마등 (우부풍
//     and 한양) and 한수 (금성, 농서) keep their own land; 좌빙익 and the
//     far west are held by local men.
//   - 형주 is all 유표's. 장선 of 장사 had risen against him with 영릉 and
//     계양 (198 to about 200), but 장선 is not in the roster: left out.
//   - 하내 (위충), 하동 and 홍농 are 조조's in name.
//   - 남중, 창오 and 상용 are held by local men.
// 유비 serves 원소 here, as he did, with those who fled with him; 관우 is
// with 조조. 장비 and 조운 had lost touch with him: 조운 is placed with
// 유비 at 업 (he joined him there that year), 장비 is out of office.
(function (S) {
  S.SCENARIO_200 = {
    id: "200",
    map: "main",
    title: "200년 관도대전",
    desc: "하북을 통일한 원소가 대군을 이끌고 남하한다. 헌제를 끼고 중원을 쥔 조조는 관도에서 이를 맞는다. 강동의 손책과 형주의 유표는 그 틈을 엿본다.",
    year: 200,
    month: 2,
    // 헌제 at 허도 under 조조; the plot of 동승 was found out in the first month.
    emperor: "yingchuan",
    hanFavor: 20,
    bondBonus: 10,
    alliances: [],
    // No opening truce: the war is already on. 원소 means to destroy 조조
    // (진림's call to arms); 조조 must meet him.
    truce: 0,
    wars: [["yuanshao", "caocao", "annihilate"], ["caocao", "yuanshao", "decisive"]],
    // Corps (js/corps.js): 원소's sons and nephew governed the provinces he
    // had taken (원담 청주, 원희 유주, 고간 병주); 종요 kept 관중 for 조조.
    corps: [
      { force: "yuanshao", head: "원담", seat: "qiguo", cities: ["qiguo", "beihai", "jinan", "donglai"] },
      { force: "yuanshao", head: "원희", seat: "guangyang", cities: ["guangyang", "zhuo", "daijun", "liaoxi"] },
      { force: "yuanshao", head: "고간", seat: "taiyuan", cities: ["taiyuan", "shangdang", "xihe", "yanmen"] },
      { force: "caocao", head: "종요", seat: "jingzhao", cities: ["jingzhao", "hongnong", "hedong"] },
    ],
    develop: 0.6,
    spread: 5,
    // 원정 의지 (js/will.js): 원소 has resolved on war (진림's call to arms);
    // 조조 means to meet him; 손책 wants 황조, who killed his father.
    will: [["yuanshao", "caocao", 85], ["caocao", "yuanshao", 55], ["sunce", "liubiao", 60], ["sunce", "caocao", 25], ["liuzhang", "zhanglu", 40]],
    relations: [
      ["yuanshao", "caocao", 10],
      // 유표 promised 원소 help and sent none; 장수 refused 원소's envoy.
      ["yuanshao", "liubiao", 60], ["caocao", "liubiao", 30],
      // 손책 was 조조's ally by marriage (손광 and 조조's niece) and his
      // 토역장군, but was thought to be planning a raid on 허도.
      ["caocao", "sunce", 45], ["yuanshao", "sunce", 50],
      // 황조 killed 손견 (191).
      ["sunce", "liubiao", 10],
      // 장로 had killed 유장's mother and brothers (확인 필요: the year).
      ["liuzhang", "zhanglu", 5], ["liuzhang", "liubiao", 40],
      // 마등 and 한수 had made peace through 종요 and sent their sons to
      // 조조's side the next years.
      ["caocao", "mateng", 60], ["caocao", "hansui", 55], ["mateng", "hansui", 55],
      ["yuanshao", "gongsundu", 45], ["caocao", "gongsundu", 50],
      ["sunce", "shixie", 50], ["liubiao", "shixie", 45],
    ],
    cityState: {
      // 낙양 still lay in ruins after 190; 장안 was emptied by 이각 and 곽사.
      henan: { pop: 50000, wall: 250 },
      jingzhao: { pop: 80000 },
      // 서주 had not recovered from 조조's massacres of 193-194.
      pengcheng: { pop: 90000 }, xiapi: { pop: 100000 },
      // 업 was 원소's seat and the richest city of the north; 허도 조조's.
      weijun: { pop: 300000, wall: 900, gold: 8000 },
      yingchuan: { wall: 700, gold: 5000 },
      // The front: 관도 (진류) and 백마·연진 (동군) were fortified.
      chenliu: { wall: 600 }, dongjun: { wall: 500 },
      // Held by local men.
      zangke: { troops: 6000 }, yuexi: { troops: 6000 }, yizhoujun: { troops: 7000 }, yongchang: { troops: 6000 },
      zuopingyi: { troops: 4000 }, wuwei: { troops: 3000 }, jiuquan: { troops: 2500 }, zhangye: { troops: 2500 },
      cangwu: { troops: 3000 }, xincheng: { troops: 3000 },
    },
    // 동승 was put to death in the first month of 200.
    absent: "동승 왕자복",
    forces: [
      {
        id: "yuanshao", name: "원소", color: "#c9a227", capital: "weijun",
        // why: 원소 ruled through the great families of 기주 (심배, 저수, 전풍),
        // and the 오환 rode for him.
        gentry: 15, weariness: 10,
        tech: { bow: 2, horse: 2 },
        cities: {
          // 기주
          weijun: 45000, julu: 4000, changshan: 4000, hejian: 4000, bohai: 5000, pingyuan: 6000,
          // 청주 (원담)
          qiguo: 7000, beihai: 3000, jinan: 3000, donglai: 2500,
          // 유주 (원희)
          guangyang: 7000, zhuo: 3000, daijun: 3000, liaoxi: 4000,
          // 병주 (고간)
          taiyuan: 6000, shangdang: 4000, xihe: 2500, yanmen: 3000,
        },
        officers: [
          "원소 @weijun", "전풍 @weijun", "저수 @weijun", "심배 @weijun",
          "봉기 @weijun", "허유 @weijun", "곽도 @weijun", "순심 @weijun",
          "신평 @weijun", "신비 @weijun", "진림 @weijun",
          "안량 @weijun", "문추 @weijun", "장합 @weijun", "고람 @weijun",
          "순우경 @weijun", "원상 @weijun", "여광 @weijun", "여상 @weijun",
          "장의 @weijun", "한맹 @weijun", "최염 @weijun", "마연 @weijun",
          "유비 @weijun", "간옹 @weijun", "손건 @weijun", "미축 @weijun",
          "미방 @weijun", "조운 @weijun",
          "원담 @qiguo", "왕수 @qiguo",
          "원희 @guangyang",
          "고간 @taiyuan",
        ],
      },
      {
        id: "caocao", name: "조조", color: "#2f5fb3", capital: "yingchuan",
        // why: 둔전 had begun at 허도 in 196; the state already fed its armies.
        gentry: -10, weariness: 20,
        tech: { siege: 2, irrigation: 2 },
        cities: {
          // 예주
          yingchuan: 25000, runan: 4000, peiguo: 2000, qiao: 2000,
          // 연주: 관도 (진류), 백마와 연진 (동군)
          chenliu: 6000, dongjun: 4000, shanyang: 2000, taishan: 2000,
          // 사례
          henan: 6000, henei: 3000, hedong: 2500, hongnong: 2500,
          // 옹주
          jingzhao: 5000,
          // 서주
          xiapi: 3000, pengcheng: 2000, donghai: 4000, guangling: 4000,
          // 남양 (장수), 회남
          nanyang: 7000, jiujiang: 2500,
        },
        officers: [
          "조조 @yingchuan", "순욱 @yingchuan", "순유 @yingchuan", "곽가 @yingchuan",
          "가후 @yingchuan", "허저 @yingchuan", "서황 @yingchuan", "장료 @yingchuan",
          "관우 @yingchuan", "조인 @yingchuan", "조홍 @yingchuan", "하후연 @yingchuan",
          "조순 @yingchuan", "조휴 @yingchuan", "공융 @yingchuan", "진군 @yingchuan",
          "유엽 @yingchuan", "동소 @yingchuan", "사마랑 @yingchuan", "조엄 @yingchuan",
          "주령 @yingchuan", "임준 @yingchuan", "왕필 @yingchuan",
          "악진 @chenliu", "이전 @chenliu",
          "정욱 @dongjun", "우금 @dongjun",
          "하후돈 @henan",
          "만총 @runan", "이통 @runan",
          "장패 @donghai", "손관 @donghai",
          "진등 @guangling",
          "장수 @nanyang",
          "종요 @jingzhao",
        ],
      },
      {
        id: "sunce", name: "손책", color: "#c0392b", capital: "wujun",
        weariness: 15,
        tech: { navy: 2 },
        cities: { wujun: 12000, danyang: 6000, kuaiji: 4000, yuzhang: 6000, lujiang: 10000 },
        officers: [
          "손책 @wujun", "손권 @wujun", "장소 @wujun", "장굉 @wujun",
          "여범 @wujun", "주치 @wujun", "손하 @wujun", "동습 @wujun",
          "손익 @danyang", "오경 @danyang",
          "우번 @kuaiji", "하제 @kuaiji",
          "손분 @yuzhang", "손보 @yuzhang", "태사자 @yuzhang", "화흠 @yuzhang",
          "주유 @lujiang", "정보 @lujiang", "황개 @lujiang", "한당 @lujiang",
          "여몽 @lujiang", "장흠 @lujiang", "주태 @lujiang", "진무 @lujiang",
        ],
      },
      {
        id: "liubiao", name: "유표", color: "#2e8b57", capital: "xiangyang",
        cities: {
          xiangyang: 15000, nanjun: 6000, xinye: 4000, jiangxia: 3000, wuchang: 8000,
          wuling: 3000, lingling: 3000, changsha: 5000, guiyang: 2500,
        },
        officers: [
          "유표 @xiangyang", "괴량 @xiangyang", "괴월 @xiangyang", "채모 @xiangyang",
          "장윤 @xiangyang", "한숭 @xiangyang", "유선(劉先) @xiangyang", "부손 @xiangyang",
          "유기 @xiangyang", "유종 @xiangyang", "이적 @xiangyang",
          "이엄 @nanjun", "문빙 @xinye",
          "황조 @wuchang", "감녕 @wuchang", "소비 @wuchang",
          "왕위 @wuling", "황충 @changsha", "유반 @changsha",
        ],
      },
      {
        id: "liuzhang", name: "유장", color: "#b8860b", capital: "shujun",
        cities: { shujun: 12000, guanghan: 6000, bajun: 6000, badong: 3000 },
        officers: [
          "유장 @shujun", "황권 @shujun", "장송 @shujun", "법정 @shujun",
          "맹달 @shujun", "장임 @shujun", "오의 @shujun", "오반 @shujun",
          "조위 @shujun", "장숙 @shujun",
          "방희 @bajun", "엄안 @bajun",
        ],
      },
      {
        id: "zhanglu", name: "장로", color: "#708090",
        cities: { hanzhong: 12000 },
        officers: ["장로 @hanzhong", "장위 @hanzhong", "염포 @hanzhong", "양송 @hanzhong", "양앙 @hanzhong", "양백 @hanzhong"],
      },
      {
        id: "mateng", name: "마등", color: "#cd5c5c", capital: "youfufeng",
        cities: { youfufeng: 8000, hanyang: 4000 },
        officers: ["마등 @youfufeng", "마초 @youfufeng", "마휴 @youfufeng", "마철 @youfufeng", "방덕 @youfufeng", "마대 @hanyang"],
      },
      {
        id: "hansui", name: "한수", color: "#daa520",
        cities: { jincheng: 8000, longxi: 4000 },
        officers: ["한수 @jincheng", "성의 @jincheng", "염행 @jincheng", "양추 @longxi", "후선 @longxi"],
      },
      {
        id: "gongsundu", name: "공손도", color: "#5f9ea0",
        cities: { liaodong: 10000, xuantu: 3000, lelang: 3000, daifang: 2000 },
        officers: ["공손도 @liaodong", "공손강 @liaodong", "공손공 @liaodong", "유의 @liaodong", "양의(陽儀) @xuantu"],
      },
      {
        id: "shixie", name: "사섭", color: "#20b2aa",
        cities: { jiaozhi: 10000, rinan: 2000, nanhai: 4000 },
        officers: ["사섭 @jiaozhi", "사휘 @jiaozhi", "사일 @jiaozhi", "사유 @rinan", "사무 @nanhai"],
      },
    ],
    // People of data/roster.js who serve a force in 200. Each starts in their
    // home city if the force holds it, else in the force's capital; those not
    // yet of age join the force when they turn 16.
    join: {
      yuanshao: "초촉 이부 관통 곽원 유부인 견초 견씨 왕문",
      caocao: "변씨 하후은 하후걸 하후덕 조충 조예 조우 조상 조희 하후상 하후무 하후위 하후혜 하후화 하후현 하후패 조절 " +
        "국연 하기 원환 장기 정의 유이 포훈 왕관",
      sunce: "손광 손정 손소(孫韶) 손랑 손환 손등 손교 손상향 오부인 서씨 대교 소교 송겸 오찬",
      liubiao: "방계 진취 등룡 채부인 채화 채중",
      liuzhang: "유모 유괴 영포 등현 양회 고패 이이 유순",
      zhanglu: "양임 두호",
      hansui: "성공영",
      gongsundu: "한충 공손황 공손연",
      shixie: "사광",
    },
    // Everyone else alive in the roster is out of office at home.
    freeRest: true,
    // Talent out of office, hidden until found with 탐색.
    free: [
      "장비 @runan",
      "제갈량 @xiangyang", "방통 @xiangyang", "서서 @xiangyang",
      "위연 @nanyang", "사마의 @henei", "사마부 @henei",
      "노숙 @lujiang", "제갈근 @wujun", "육손 @wujun",
      "감택 @kuaiji", "보즐 @kuaiji",
    ],
  };
  S.SCENARIOS = S.SCENARIOS || [];
  S.SCENARIOS.push(S.SCENARIO_200);
})(globalThis.SAM = globalThis.SAM || {});
