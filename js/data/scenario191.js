// Scenario: 191년 군웅할거.
// Summer 191. 동탁 has burned 낙양 and withdrawn to 장안, and the coalition
// against him has broken up. 원소 has just taken 기주 from 한복, and 조조 is
// about to become 동군태수. Who held which commandery follows the histories,
// with some simplification. Commanderies not listed under any force are held
// by local administrators and start neutral.
// All ability values are this game's own ratings.
(function (S) {
  // Officer line: "name lead war int pol @city". The first officer of a force is
  // its ruler. Birth and death years come from data/people.js; officers who are
  // still too young appear when they come of age, joining the force they are
  // listed under if it still exists.
  S.SCENARIO_191 = {
    id: "191",
    map: "190",
    title: "191년 군웅할거",
    desc: "동탁이 낙양을 불태우고 장안으로 물러났다. 반동탁 연합은 흩어지고, 관동의 군웅은 서로의 땅을 노린다.",
    year: 191,
    month: 7,
    // 손견 fought as 원술's general, and 유비 served under 공손찬 as 평원상.
    // Both are kept as playable forces allied to their patrons.
    // 헌제 was held at 장안 by 동탁.
    emperor: "jingzhao",
    alliances: [["sunjian", "yuanshu"], ["liubei", "gongsunzan"]],
    // Cities whose starting state differs from the defaults.
    cityState: {
      // 낙양 was burned and its people driven west to 장안 in 190.
      henan: { pop: 30000, troops: 600, order: 5, consent: 5, farm: 40, trade: 20, wall: 120, gold: 50, food: 1500 },
    },
    forces: [
      {
        id: "dongzhuo", name: "동탁", color: "#5b4a8a",
        cities: { jingzhao: 32000, zuopingyi: 6000, youfufeng: 9000, hongnong: 14000, hedong: 10000 },
        officers: [
          "동탁 86 85 60 38 @jingzhao", "여포 88 100 30 14 @jingzhao", "이유 42 26 88 76 @jingzhao",
          "장료 85 89 72 56 @jingzhao", "고순 84 85 50 40 @jingzhao", "이숙 56 66 45 40 @jingzhao",
          "채옹 15 10 82 78 @jingzhao", "왕윤 45 35 82 84 @jingzhao", "개훈 62 55 70 74 @jingzhao",
          "황보숭 88 70 70 68 @jingzhao", "동민 40 46 30 26 @jingzhao", "번조 62 72 26 20 @youfufeng",
          "우보 60 64 30 26 @hongnong", "이각 70 78 32 16 @hongnong", "곽사 66 74 28 12 @hongnong",
          "장제 72 70 54 46 @hongnong", "가후 80 40 97 82 @hongnong", "장수 74 80 58 42 @hongnong",
          "단외 60 56 52 60 @hongnong", "동월 64 66 36 28 @hongnong",
          "서영 78 70 62 46 @hedong", "호진 60 66 26 20 @hedong",
        ],
      },
      {
        id: "yuanshao", name: "원소", color: "#c9a227",
        cities: {
          weijun: 16000, bohai: 12000, julu: 6000, changshan: 5000, zhongshan: 6000,
          anping: 5000, hejian: 5000, qinghe: 6000, zhaoguo: 4000,
        },
        officers: [
          "원소 82 70 72 76 @weijun", "안량 80 92 30 30 @weijun", "문추 78 91 26 22 @weijun",
          "전풍 68 30 93 84 @weijun", "저수 85 42 92 86 @weijun", "심배 66 45 80 78 @weijun",
          "봉기 50 40 78 70 @weijun", "허유 40 25 82 56 @weijun", "곽도 56 45 77 62 @weijun",
          "순심 45 30 70 72 @weijun", "신평 30 25 76 72 @weijun", "신비 35 30 82 78 @weijun",
          "진림 20 15 80 68 @weijun",
          "원담 60 62 45 46 @bohai", "고간 70 70 55 52 @bohai", "원희 60 60 55 55 @bohai",
          "원상 70 72 50 48 @weijun",
          "장합 88 87 68 52 @hejian", "국의 82 80 45 30 @julu", "고람 74 78 40 30 @zhongshan",
        ],
      },
      {
        id: "caocao", name: "조조", color: "#2f5fb3",
        cities: { dongjun: 7000 },
        officers: [
          "조조 96 72 92 92 @dongjun", "하후돈 88 89 58 64 @dongjun", "하후연 85 89 50 40 @dongjun",
          "조인 88 84 60 56 @dongjun", "조홍 72 78 40 36 @dongjun", "악진 80 83 50 38 @dongjun",
          "이전 76 75 75 70 @dongjun", "조순 76 70 56 56 @dongjun", "사환 66 66 40 38 @dongjun",
          "순욱 60 25 96 98 @dongjun",
          "조휴 78 72 56 50 @dongjun", "조진 82 74 62 60 @dongjun", "조비 72 70 76 82 @dongjun",
          "조창 80 90 30 25 @dongjun", "조식 25 22 85 70 @dongjun",
        ],
      },
      {
        id: "zhangmiao", name: "장막", color: "#9aa0c8",
        cities: { chenliu: 9000 },
        officers: ["장막 62 55 62 66 @chenliu"],
      },
      {
        id: "liudai", name: "유대", color: "#b0a4d8",
        cities: { shanyang: 8000, jiyin: 5000, dongping: 5000 },
        officers: ["유대 55 45 60 66 @shanyang"],
      },
      {
        id: "baoxin", name: "포신", color: "#7b9e89",
        cities: { jibei: 7000 },
        officers: ["포신 76 66 74 70 @jibei", "우금 80 78 60 56 @jibei"],
      },
      {
        id: "zhangchao", name: "장초", color: "#a3785f",
        cities: { guangling: 8000 },
        officers: ["장초 60 52 56 60 @guangling", "장홍 50 45 72 72 @guangling"],
      },
      {
        id: "liuchong", name: "유총", color: "#e07b39",
        cities: { chenguo: 10000 },
        officers: ["유총 72 74 50 56 @chenguo", "낙준 40 30 70 78 @chenguo"],
      },
      {
        id: "yuanshu", name: "원술", color: "#d2691e",
        cities: { nanyang: 20000 },
        officers: [
          "원술 60 62 58 40 @nanyang", "기령 75 82 40 35 @nanyang", "장훈 68 65 55 46 @nanyang",
          "염상 30 25 75 70 @nanyang", "뇌박 60 65 30 25 @nanyang", "교유 58 60 40 35 @nanyang",
          "양홍 32 25 76 68 @nanyang", "진란 58 62 32 25 @nanyang", "원윤 45 40 50 56 @nanyang",
          "이풍 58 60 40 36 @nanyang", "진기 66 66 45 40 @nanyang", "유훈 60 55 50 48 @nanyang",
        ],
      },
      {
        id: "sunjian", name: "손견", color: "#c0392b",
        cities: { changsha: 11000 },
        officers: [
          "손견 92 90 70 66 @changsha", "손책 86 91 70 70 @changsha", "정보 82 78 70 66 @changsha",
          "황개 80 82 62 58 @changsha", "한당 76 80 45 42 @changsha", "조무 66 72 40 35 @changsha",
          "오경 65 62 50 56 @changsha", "손정 55 50 56 62 @changsha", "손분 72 70 55 56 @changsha",
          "주치 70 60 66 72 @changsha", "손하 60 66 45 45 @changsha", "서곤 60 60 50 50 @changsha",
          "손권 82 66 80 86 @changsha", "손익 66 76 30 30 @changsha",
        ],
      },
      {
        id: "liubiao", name: "유표", color: "#2e8b57",
        cities: { nanjun: 14000, jiangxia: 6000, wuling: 3000, lingling: 4000, guiyang: 3000 },
        officers: [
          "유표 64 40 72 82 @nanjun", "괴량 50 30 88 86 @nanjun", "괴월 55 35 87 80 @nanjun",
          "채모 74 68 62 56 @nanjun", "장윤 60 55 50 50 @nanjun", "문빙 82 82 62 58 @nanjun",
          "한숭 30 20 76 76 @nanjun", "유선 30 20 72 74 @nanjun", "부손 25 20 76 66 @nanjun",
          "유기 40 35 60 66 @nanjun", "유종 30 25 55 60 @nanjun",
          "황조 70 70 45 40 @jiangxia",
          "왕위 70 70 66 56 @wuling",
          "황충 86 93 60 50 @lingling", "유반 70 72 40 36 @guiyang",
        ],
      },
      {
        id: "gongsunzan", name: "공손찬", color: "#e8e8e8",
        cities: { youbeiping: 13000, liaoxi: 5000 },
        officers: [
          "공손찬 85 86 60 50 @youbeiping", "조운 90 96 76 64 @youbeiping", "엄강 66 70 35 30 @youbeiping",
          "전해 62 66 35 30 @youbeiping", "공손범 60 60 40 40 @youbeiping", "관정 30 25 60 56 @youbeiping",
          "단경 66 64 40 38 @youbeiping", "추단 60 62 35 32 @liaoxi", "공손속 60 60 40 40 @liaoxi",
        ],
      },
      {
        id: "liuyu", name: "유우", color: "#7fb3d5",
        cities: { guangyang: 10000, zhuo: 6000, yuyang: 6000, shanggu: 3000, daijun: 3000 },
        officers: [
          "유우 55 30 70 88 @guangyang", "선우보 66 62 50 46 @guangyang", "전주 76 74 74 66 @guangyang",
          "위유 30 25 70 72 @guangyang", "제주 30 25 60 62 @guangyang",
          "염유 70 66 50 40 @yuyang", "선우은 62 64 40 36 @zhuo",
        ],
      },
      {
        id: "gongsundu", name: "공손도", color: "#5f9ea0",
        cities: { liaodong: 9000, xuantu: 4000 },
        officers: [
          "공손도 76 70 62 66 @liaodong", "공손강 70 66 60 60 @liaodong", "공손공 30 25 40 45 @liaodong",
          "유의 66 66 40 36 @liaodong", "양의 66 62 50 46 @xuantu",
        ],
      },
      {
        id: "liubei", name: "유비", color: "#3cb371",
        cities: { pingyuan: 5000 },
        officers: [
          "유비 78 72 75 78 @pingyuan", "관우 95 97 75 62 @pingyuan", "장비 86 98 35 24 @pingyuan",
          "간옹 30 25 65 70 @pingyuan",
          "관평 70 76 55 45 @pingyuan", "장포 66 76 35 30 @pingyuan", "관흥 66 74 55 45 @pingyuan",
        ],
      },
      {
        id: "kongrong", name: "공융", color: "#a0522d",
        cities: { beihai: 7000 },
        officers: ["공융 40 25 76 70 @beihai", "손소 50 50 60 66 @beihai", "왕수 40 30 60 70 @beihai"],
      },
      {
        id: "taoqian", name: "도겸", color: "#9370db",
        cities: { donghai: 10000, langya: 6000, pengcheng: 6000, xiapi: 8000 },
        officers: [
          "도겸 55 40 60 70 @donghai", "미축 35 30 65 86 @donghai", "미방 50 55 40 40 @donghai",
          "조굉 60 62 35 30 @donghai", "왕랑 50 30 75 80 @donghai", "조욱 40 30 70 76 @donghai",
          "진규 40 25 82 80 @xiapi", "진등 74 60 86 80 @xiapi",
          "장패 76 80 50 45 @langya", "손관 60 64 38 32 @langya",
          "조표 58 66 30 25 @pengcheng", "착융 50 55 40 30 @pengcheng", "설례 52 50 40 46 @pengcheng",
        ],
      },
      {
        id: "liuyan", name: "유언", color: "#b8860b",
        cities: { guanghan: 10000, shujun: 12000, qianwei: 5000, bajun: 8000 },
        officers: [
          "유언 65 40 72 76 @guanghan", "유장 40 30 50 60 @guanghan", "오의 72 68 60 55 @guanghan",
          "방희 60 50 60 60 @guanghan",
          "장임 85 82 72 60 @shujun", "장송 25 20 88 80 @shujun", "조위 60 55 50 50 @shujun",
          "장숙 30 20 66 66 @shujun",
          "가룡 66 62 50 50 @qianwei", "임기 55 55 45 50 @qianwei",
          "황권 70 50 80 76 @bajun", "엄안 80 82 60 50 @bajun",
        ],
      },
      {
        id: "zhanglu", name: "장로", color: "#708090",
        cities: { hanzhong: 9000 },
        officers: [
          "장로 62 50 74 80 @hanzhong", "장위 66 70 40 30 @hanzhong", "염포 40 20 80 82 @hanzhong",
          "양송 25 20 45 30 @hanzhong", "양앙 60 66 30 25 @hanzhong", "양백 58 60 32 30 @hanzhong",
        ],
      },
      {
        id: "mateng", name: "마등", color: "#cd5c5c",
        cities: { hanyang: 9000, wuwei: 6000 },
        officers: [
          "마등 80 82 50 56 @hanyang", "방덕 84 92 60 46 @hanyang",
          "마초 88 97 40 30 @hanyang", "마휴 55 60 30 25 @hanyang",
          "마철 50 58 25 20 @wuwei", "마대 74 78 45 40 @wuwei",
        ],
      },
      {
        id: "hansui", name: "한수", color: "#daa520",
        cities: { jincheng: 9000, longxi: 5000 },
        officers: [
          "한수 76 72 74 66 @jincheng", "성의 64 74 30 25 @jincheng", "염행 72 85 50 40 @jincheng",
          "양추 60 66 35 30 @longxi", "후선 56 62 30 28 @longxi",
        ],
      },
      {
        id: "yanbaihu", name: "엄백호", color: "#6b8e23",
        cities: { wujun: 8000 },
        officers: ["엄백호 62 70 35 30 @wujun", "엄여 55 66 25 20 @wujun", "허공 45 40 50 56 @wujun"],
      },
      {
        id: "shixie", name: "사섭", color: "#20b2aa",
        cities: { jiaozhi: 7000, hepu: 3000, jiuzhen: 3000, nanhai: 5000 },
        officers: [
          "사섭 50 30 74 86 @jiaozhi", "사휘 60 62 50 45 @jiaozhi", "사일 40 30 60 66 @hepu",
          "사유 40 35 55 60 @jiuzhen", "사무 45 40 55 60 @nanhai",
        ],
      },
    ],
    // Unaffiliated talent, hidden until found with 탐색. Those not yet of age
    // appear in their home commandery when they turn 16.
    free: [
      "주준 85 70 70 66 @henan", "한호 68 62 62 66 @henei", "사마랑 30 20 72 76 @henei",
      "사마의 96 60 97 90 @henei", "사마부 50 30 75 80 @henei", "장양 66 66 45 50 @henei",
      "순유 80 35 94 85 @jingzhao", "종요 30 20 80 86 @jingzhao", "법정 75 40 95 86 @youfufeng",
      "서황 87 90 70 50 @hedong", "양봉 60 66 30 30 @hedong", "한섬 55 62 25 20 @hedong",
      "가규 76 60 82 84 @hedong",
      "곽가 70 30 98 80 @yingchuan", "희지재 40 25 88 66 @yingchuan", "서서 70 60 88 76 @yingchuan",
      "진군 40 30 82 90 @yingchuan", "종회 80 60 92 76 @yingchuan",
      "한복 40 32 45 56 @chenliu", "전위 72 95 30 20 @chenliu",
      "허저 70 95 30 20 @peiguo", "하후패 76 82 50 36 @peiguo",
      "정욱 75 50 90 82 @dongjun", "진궁 75 50 88 80 @dongjun", "반장 74 80 40 30 @dongjun",
      "만총 70 60 82 80 @shanyang",
      "장연 72 74 50 46 @changshan", "전예 76 66 72 74 @yuyang",
      "곽회 86 74 76 70 @taiyuan", "왕기 74 60 72 76 @taiyuan", "학소 86 74 70 60 @taiyuan",
      "태사자 86 92 66 50 @donglai", "유요 55 40 55 66 @donglai",
      "제갈근 50 35 80 84 @langya", "서성 82 78 72 60 @langya",
      "노숙 82 50 92 90 @xiapi", "보즐 70 40 80 82 @xiapi",
      "장소 25 20 80 92 @pengcheng", "장굉 25 20 80 84 @guangling",
      "여몽 88 82 85 70 @runan",
      "장흠 72 75 50 40 @jiujiang", "주태 72 86 30 26 @jiujiang", "주유 96 72 96 86 @lujiang",
      "진무 66 80 35 30 @lujiang", "장영 66 66 40 38 @danyang", "번능 60 65 30 28 @danyang",
      "우미 50 50 40 40 @danyang",
      "능조 66 76 35 30 @wujun", "능통 76 84 50 40 @wujun", "육손 92 66 95 88 @wujun",
      "주환 85 80 70 50 @wujun",
      "하제 80 78 66 60 @kuaiji", "우번 50 55 82 70 @kuaiji", "감택 30 25 80 76 @kuaiji",
      "위연 80 88 60 40 @nanyang", "화흠 30 20 76 78 @nanyang", "등애 92 80 90 76 @nanyang",
      "등지 50 40 78 82 @nanyang",
      "제갈량 96 40 99 96 @nanjun", "방통 70 35 97 82 @nanjun", "마량 40 30 85 82 @nanjun",
      "마속 66 50 82 70 @nanjun", "동윤 40 25 80 84 @nanjun",
      "비의 40 30 85 88 @jiangxia", "장완 50 30 84 90 @lingling", "유파 30 25 82 84 @lingling",
      "감녕 86 94 70 40 @bajun", "왕평 80 76 60 40 @bajun", "장억 80 70 70 66 @qianwei",
      "강유 90 86 88 76 @hanyang",
      "정은 58 64 30 25 @anding", "이감 56 62 30 25 @anding", "마완 56 60 30 24 @anding",
      "장횡 58 64 28 22 @beidi", "양흥 60 66 30 24 @beidi",
    ],
  };
})(globalThis.SAM = globalThis.SAM || {});
