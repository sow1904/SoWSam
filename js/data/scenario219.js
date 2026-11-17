// Scenario: 219년 삼국정립.
// June 219. 유비 has taken 한중 from 조조 (하후연 fell at 정군산 in the first
// month, and 조조 withdrew to 장안 in the fifth) and is about to call himself
// 한중왕. 관우 holds 강릉 and looks north at 조인 in 번성. 손권 has made his
// peace with 조조 for the moment and wants the rest of 형주.
//
// Three unequal powers: 조조 holds the whole north, about five cities in
// eight. Who held which commandery follows the histories, with the map's
// usual simplifications:
//   - 형주 after the division of 215: 유비 has 남군(강릉), 무릉 and 영릉; 손권
//     has 장사, 계양 and the 강하 south of the river (무창); 조조 has 남양,
//     번성(신야), 양양 and 문빙's 강하 north of it.
//   - 상용 (신성) is given to 유비: 맹달 and 유봉 took it in the summer of 219
//     (확인 필요: the month).
//   - 량주 is 조조's in name; the risings of 무위, 주천 and 장액 are left out.
//   - 교주: 보즐 governed 남해 and 창오 for 손권, and 사섭 kept 교지 as his
//     ally. He is a small force of his own here, allied to 손권.
//   - 요동 answers to 공손강, who kept on good terms with 조조.
//   - 남중 obeys 유비 for now; its great men are out of office at home.
// 유비 and 손권 are still allies, as they were in name: the alliance has a
// year to run and little goodwill left in it. 손권's turn against 관우 was a
// secret; here he is free to let the term run out.
// Held cities start better developed than in 191 (develop), so that the
// armies listed can be paid and fed, and officers the lists do not place by
// name are spread over their force's cities (spread).
// Troop numbers are this game's own, set so the three stand roughly as four
// to one to one.
(function (S) {
  S.SCENARIO_219 = {
    id: "219",
    map: "main",
    title: "219년 삼국정립",
    desc: "유비가 한중을 얻어 왕을 칭하려 한다. 관우는 강릉에서 번성을 노리고, 손권은 형주를 넘본다. 조조는 여전히 천하의 절반을 넘게 쥐고 있다.",
    year: 219,
    month: 6,
    // 헌제 was at 허도 under 조조, who had been 위왕 since 216.
    emperor: "yingchuan",
    hanFavor: 25,
    // Most had served their lords for many years by 219: added to every bond.
    bondBonus: 20,
    alliances: [["sunquan", "shixie"], ["liubei", "sunquan", 12]],
    develop: 0.75,
    spread: 5,
    relations: [
      // 조조 and 유비 had just fought two years over 한중.
      ["caocao", "liubei", 5],
      // 손권 submitted to 조조 in 217 after 유수; neither trusted the other.
      ["caocao", "sunquan", 40],
      // Allies in name: the quarrel over 형주 was only patched up in 215.
      ["liubei", "sunquan", 35],
      ["caocao", "gongsunkang", 65], ["sunquan", "shixie", 85],
      ["liubei", "shixie", 45], ["caocao", "shixie", 45],
      ["sunquan", "gongsunkang", 45], ["liubei", "gongsunkang", 40],
    ],
    cityState: {
      // 조조 moved the people of 한중 north before he left it.
      // The land between the 회 and the river was emptied by the wars.
      guangling: { pop: 50000 }, lujiang: { pop: 70000 },
      // 낙양 was rebuilt slowly; 업 was 조조's seat and 성도, 건업 the others'.
      henan: { pop: 120000, wall: 500 },
      weijun: { pop: 320000, wall: 900, gold: 5000 },
      // War chests where the great armies stand: they cost more than the city yields.
      jingzhao: { gold: 7000 }, hanzhong: { pop: 60000, farm: 150, trade: 100, gold: 9000 },
      yingchuan: { wall: 800 },
      shujun: { wall: 800 }, danyang: { pop: 220000, wall: 800, gold: 5000 },
      // The frontier cities had been fortified for years.
      xinye: { wall: 600, wallMax: 800, gold: 4500 }, xiangyang: { wall: 900 }, nanjun: { wall: 900, gold: 4000 }, jiujiang: { wall: 700, gold: 3500 },
    },
    // People who appear in the lists below or in the roster but were dead
    // by June: 하후연 at 정군산, 하후덕 with him in the novel.
    absent: "하후연 하후덕",
    forces: [
      {
        id: "caocao", name: "조조", color: "#2f5fb3", capital: "weijun",
        // why: thirty years of 둔전 and soldier households (병호) had put the
        // land and the armies in the state's hands: 중앙집권형.
        gentry: -25,
        tech: { spear: 2, sword: 2, bow: 2, horse: 2, siege: 2, irrigation: 2, census: 2 },
        cities: {
          // 사례
          henan: 12000, henei: 7000, hedong: 7000, hongnong: 8000,
          // 예주
          yingchuan: 20000, runan: 9000, peiguo: 6000, qiao: 7000,
          // 연주
          chenliu: 7000, dongjun: 6000, shanyang: 6000, taishan: 6000,
          // 기주
          weijun: 25000, julu: 6000, changshan: 6000, hejian: 5000, bohai: 7000, pingyuan: 6000,
          // 유주
          zhuo: 6000, guangyang: 8000, daijun: 5000, liaoxi: 5000,
          // 병주
          shangdang: 5000, taiyuan: 8000, yanmen: 5000, xihe: 4000,
          // 서주
          xiapi: 7000, pengcheng: 6000, guangling: 6000, donghai: 8000,
          // 청주
          qiguo: 7000, beihai: 6000, jinan: 5000, donglai: 5000,
          // 옹주
          jingzhao: 30000, zuopingyi: 6000, youfufeng: 14000, hanyang: 10000, longxi: 5000,
          // 량주
          wuwei: 5000, jincheng: 5000, jiuquan: 3000, zhangye: 3000,
          // 형북과 회남
          nanyang: 15000, xinye: 20000, xiangyang: 12000, jiangxia: 8000, jiujiang: 20000,
        },
        officers: [
          "조조 @jingzhao", "가후 @jingzhao", "사마의 @jingzhao",
          "허저 @jingzhao", "조홍 @jingzhao", "조휴 @jingzhao",
          "조창 @jingzhao", "우금 @jingzhao",
          "장합 @youfufeng", "곽회 @youfufeng", "조진 @youfufeng",
          "양추 @hanyang", "후선 @hanyang", "강유 @hanyang",
          "학소 @wuwei",
          "조인 @xinye", "방덕 @xinye", "만총 @xinye",
          "서황 @nanyang", "전예 @nanyang", "등애 @nanyang",
          "문빙 @jiangxia",
          "하후돈 @jiujiang", "장료 @jiujiang",
          "조비 @weijun", "조식 @weijun", "종요 @weijun",
          "왕랑 @weijun", "진군 @weijun", "정욱 @weijun",
          "사마부 @weijun", "신비 @weijun", "서서 @weijun",
          "채모 @weijun", "부손 @weijun", "염포 @weijun",
          "염행 @weijun", "장연 @weijun",
          "화흠 @yingchuan", "종회 @yingchuan",
          "가규 @hongnong", "하후패 @qiao",
          "장패 @donghai", "유종 @qiguo", "왕기 @donglai",
          // posts the histories give for these years (확인 필요: the exact year)
          "두기 @hedong", "양습 @taiyuan", "온회 @jiujiang", "장제(蔣濟) @jiujiang",
          "소칙 @jincheng", "양부 @hanyang", "조엄 @jingzhao", "장기 @jingzhao",
          "유엽 @jingzhao", "양수 @jingzhao", "여건 @taishan", "동소 @weijun",
        ],
      },
      {
        id: "liubei", name: "유비", color: "#3cb371", capital: "shujun",
        // why: 유비 rules through the 익주 and 형주 great families beside his own
        // old followers: a 호족연합형 still close to 부곡형.
        gentry: 5,
        // why: the men of 동주 (those who had come to 익주 with 유언) served
        // 유장 before 유비 and stood apart from the 익주 natives and from
        // 유비's own 형주 men.
        former: { 유장: "유장 이엄 오의 오반 맹달 허정 유파" },
        tech: { spear: 2, sword: 2, bow: 2, irrigation: 2 },
        cities: {
          hanzhong: 30000, shujun: 15000, guanghan: 6000, bajun: 7000, badong: 5000,
          nanjun: 25000, wuling: 5000, lingling: 5000, xincheng: 6000,
          zangke: 4000, yuexi: 4000, yizhoujun: 4000, yongchang: 3000,
        },
        officers: [
          "유비 @hanzhong", "법정 @hanzhong", "황충 @hanzhong",
          "조운 @hanzhong", "마초 @hanzhong", "위연 @hanzhong",
          "황권 @hanzhong", "오의 @hanzhong", "마대 @hanzhong",
          "왕평 @hanzhong",
          "제갈량 @shujun", "미축 @shujun", "유파 @shujun",
          "장완 @shujun", "비의 @shujun", "동윤 @shujun",
          "마속 @shujun",
          "등지 @guanghan",
          "장비 @bajun", "장포 @bajun", "장억 @bajun",
          "관우 @nanjun", "관평 @nanjun", "마량 @nanjun",
          "미방 @nanjun", "유장 @nanjun", "관흥 @nanjun",
          // people of the roster placed away from home
          "유봉 @xincheng", "맹달 @xincheng",
          "요화 @nanjun", "부사인 @nanjun", "반준 @nanjun",
          "이엄 @shujun", "유선 @shujun", "양의 @shujun",
          "허정 @shujun", "이적 @shujun", "진진 @shujun",
          "진도 @hanzhong", "오반 @hanzhong", "장익 @hanzhong",
          "풍습 @badong", "장남 @badong",
          "왕보 @nanjun", "조루 @nanjun", "양홍(楊洪) @shujun", "이회 @yizhoujun", "여개 @yongchang",
        ],
      },
      {
        id: "sunquan", name: "손권", color: "#c0392b", capital: "danyang",
        // why: the 강동 clans (고·육·주·장) and the generals' hereditary troops
        // (세병) carry the 손씨 state: 호족연합형, strongest in 강동 itself.
        gentry: { danyang: 85, wujun: 85, kuaiji: 85, yuzhang: 85 },
        tech: { sword: 2, bow: 2, navy: 2, logging: 2 },
        cities: {
          danyang: 25000, wujun: 8000, kuaiji: 8000, yuzhang: 8000, lujiang: 14000,
          wuchang: 14000, changsha: 10000, guiyang: 5000,
          nanhai: 6000, cangwu: 5000,
        },
        officers: [
          "손권 @danyang", "장소 @danyang", "육손 @danyang",
          "제갈근 @danyang", "우번 @danyang", "감택 @danyang",
          "손소 @danyang", "장흠 @danyang",
          "여몽 @wuchang", "반장 @wuchang",
          "주태 @lujiang", "서성 @lujiang", "감녕 @lujiang",
          "한당 @changsha",
          "주치 @wujun", "주환 @wujun",
          "하제 @kuaiji",
          "보즐 @nanhai", "여대 @cangwu",
          "주연 @wuchang", "손교 @wuchang", "고옹 @danyang", "여범 @danyang", "손소(孫韶) @danyang",
        ],
      },
      {
        id: "gongsunkang", name: "공손강", color: "#5f9ea0",
        cities: { liaodong: 12000, xuantu: 4000, lelang: 4000, daifang: 2000 },
        officers: ["공손강 @liaodong", "공손공 @liaodong"],
      },
      {
        id: "shixie", name: "사섭", color: "#20b2aa",
        cities: { jiaozhi: 12000, rinan: 3000 },
        officers: ["사섭 @jiaozhi", "사휘 @jiaozhi"],
      },
    ],
    // People of data/roster.js who serve a force in 219. Each starts in their
    // home city if the force holds it, else in the force's capital; those not
    // yet of age join the force when they turn 16.
    join: {
      caocao: "정혼 두습 서혁 하기 형옹 화흡 한기 위기 배잠 유방 손자 고당륭 고유 사마지 정의 양무 왕관 원환 유이 환계 포훈 진교 서선 왕숙 노육 환범 하안 등양 정밀 이승 위풍 마균 " +
        "조예 조우 조상 조희 하후상 하후무 하후위 하후혜 하후화 하후현 주령 왕충 오돈 윤례 손례 왕쌍 비요 대릉 견초 악침 장호 허의 전만 진랑 진태 왕창 왕릉 영호우 관구검 문흠 문앙 제갈탄 호준 호질 석포 주태(州泰) 등충 사찬 종육 제갈서 호열 호분 견홍 왕경 가충 " +
        "사마사 사마소 사마염 사마망 양호 두예 왕준 위관 배수 순의 장특 전속 방회 성공영 강서 윤봉 조앙(趙昂) 양표 이부 황화 방육 장공 창자 변씨 조절 하후씨 견씨 곽여왕 신헌영 장춘화 왕원희 장창포 양휘유 왕이 채염 한덕 최량 호반",
      liubei: "유염 향랑 향총 나헌 요립 곽익 고상 염우 부융 부첨 동궐 번건 호제 종예 범강 장달 유순 이이 주군 팽양 진밀 비시 정기 초주 극정 진지 황호 마충 구부 진식 황숭 조광 제갈첨 마막 장서 왕항 찬습 신탐 신의 황월영 관색 주창",
      sunquan: "여거 주적 전종 정봉 송겸 진표 엄준 정병 설종 호종 제갈각 제갈융 고담 육적 육항 육개 장온 장승 보천 주거 주이 당자 유찬 한종 손랑 손환 손등 손려 손화 손패 손휴 손준 손침 주방 주처 오찬 오언 종리목 낙통 위소 도황 장제(張悌) 손상향 손노반 손노육 서씨 대교 소교 보연사 시의 원요",
      gongsunkang: "공손연 공손황 비연 양조 윤직 가범 공손모 장창",
      shixie: "사광",
    },
    // Everyone else alive in the roster is out of office at home: the chiefs
    // of 남중 and 무릉, the men who rose in 량주 the next year, 가비능.
    freeRest: true,
    free: [],
  };
  S.SCENARIOS = S.SCENARIOS || [];
  S.SCENARIOS.push(S.SCENARIO_219);
})(globalThis.SAM = globalThis.SAM || {});
