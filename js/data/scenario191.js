// Scenario: 191년 군웅할거.
// Summer 191. 동탁 has burned 낙양 and withdrawn to 장안, and the coalition
// against him has broken up. 원소 has just taken 기주 from 한복, and 조조 is
// about to become 동군태수. Who held which commandery follows the histories,
// with some simplification. Commanderies not listed under any force are held
// by local administrators and start neutral.
(function (S) {
  // Officer line: "name @city"; abilities are in data/abilities.js and birth
  // and death years in data/people.js. The first officer of a force is its
  // ruler. Officers who are still too young appear when they come of age,
  // joining the force they are listed under if it still exists.
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
          "동탁 @jingzhao", "여포 @jingzhao", "이유 @jingzhao",
          "장료 @jingzhao", "고순 @jingzhao", "이숙 @jingzhao",
          "채옹 @jingzhao", "왕윤 @jingzhao", "개훈 @jingzhao",
          "황보숭 @jingzhao", "동민 @jingzhao", "번조 @youfufeng",
          "우보 @hongnong", "이각 @hongnong", "곽사 @hongnong",
          "장제 @hongnong", "가후 @hongnong", "장수 @hongnong",
          "단외 @hongnong", "동월 @hongnong",
          "서영 @hedong", "호진 @hedong",
        ],
      },
      {
        id: "yuanshao", name: "원소", color: "#c9a227",
        cities: {
          weijun: 16000, bohai: 12000, julu: 6000, changshan: 5000, zhongshan: 6000,
          anping: 5000, hejian: 5000, qinghe: 6000, zhaoguo: 4000,
        },
        officers: [
          "원소 @weijun", "안량 @weijun", "문추 @weijun",
          "전풍 @weijun", "저수 @weijun", "심배 @weijun",
          "봉기 @weijun", "허유 @weijun", "곽도 @weijun",
          "순심 @weijun", "신평 @weijun", "신비 @weijun",
          "진림 @weijun",
          "원담 @bohai", "고간 @bohai", "원희 @bohai",
          "원상 @weijun",
          "장합 @hejian", "국의 @julu", "고람 @zhongshan",
        ],
      },
      {
        id: "caocao", name: "조조", color: "#2f5fb3",
        cities: { dongjun: 7000 },
        officers: [
          "조조 @dongjun", "하후돈 @dongjun", "하후연 @dongjun",
          "조인 @dongjun", "조홍 @dongjun", "악진 @dongjun",
          "이전 @dongjun", "조순 @dongjun", "사환 @dongjun",
          "순욱 @dongjun",
          "조휴 @dongjun", "조진 @dongjun", "조비 @dongjun",
          "조창 @dongjun", "조식 @dongjun",
        ],
      },
      {
        id: "zhangmiao", name: "장막", color: "#9aa0c8",
        cities: { chenliu: 9000 },
        officers: ["장막 @chenliu"],
      },
      {
        id: "liudai", name: "유대", color: "#b0a4d8",
        cities: { shanyang: 8000, jiyin: 5000, dongping: 5000 },
        officers: ["유대 @shanyang"],
      },
      {
        id: "baoxin", name: "포신", color: "#7b9e89",
        cities: { jibei: 7000 },
        officers: ["포신 @jibei", "우금 @jibei"],
      },
      {
        id: "zhangchao", name: "장초", color: "#a3785f",
        cities: { guangling: 8000 },
        officers: ["장초 @guangling", "장홍 @guangling"],
      },
      {
        id: "liuchong", name: "유총", color: "#e07b39",
        cities: { chenguo: 10000 },
        officers: ["유총 @chenguo", "낙준 @chenguo"],
      },
      {
        id: "yuanshu", name: "원술", color: "#d2691e",
        cities: { nanyang: 20000 },
        officers: [
          "원술 @nanyang", "기령 @nanyang", "장훈 @nanyang",
          "염상 @nanyang", "뇌박 @nanyang", "교유 @nanyang",
          "양홍 @nanyang", "진란 @nanyang", "원윤 @nanyang",
          "이풍 @nanyang", "진기 @nanyang", "유훈 @nanyang",
        ],
      },
      {
        id: "sunjian", name: "손견", color: "#c0392b",
        cities: { changsha: 11000 },
        officers: [
          "손견 @changsha", "손책 @changsha", "정보 @changsha",
          "황개 @changsha", "한당 @changsha", "조무 @changsha",
          "오경 @changsha", "손정 @changsha", "손분 @changsha",
          "주치 @changsha", "손하 @changsha", "서곤 @changsha",
          "손권 @changsha", "손익 @changsha",
        ],
      },
      {
        id: "liubiao", name: "유표", color: "#2e8b57",
        cities: { nanjun: 14000, jiangxia: 6000, wuling: 3000, lingling: 4000, guiyang: 3000 },
        officers: [
          "유표 @nanjun", "괴량 @nanjun", "괴월 @nanjun",
          "채모 @nanjun", "장윤 @nanjun", "문빙 @nanjun",
          "한숭 @nanjun", "유선 @nanjun", "부손 @nanjun",
          "유기 @nanjun", "유종 @nanjun",
          "황조 @jiangxia",
          "왕위 @wuling",
          "황충 @lingling", "유반 @guiyang",
        ],
      },
      {
        id: "gongsunzan", name: "공손찬", color: "#e8e8e8",
        cities: { youbeiping: 13000, liaoxi: 5000 },
        officers: [
          "공손찬 @youbeiping", "조운 @youbeiping", "엄강 @youbeiping",
          "전해 @youbeiping", "공손범 @youbeiping", "관정 @youbeiping",
          "단경 @youbeiping", "추단 @liaoxi", "공손속 @liaoxi",
        ],
      },
      {
        id: "liuyu", name: "유우", color: "#7fb3d5",
        cities: { guangyang: 10000, zhuo: 6000, yuyang: 6000, shanggu: 3000, daijun: 3000 },
        officers: [
          "유우 @guangyang", "선우보 @guangyang", "전주 @guangyang",
          "위유 @guangyang", "제주 @guangyang",
          "염유 @yuyang", "선우은 @zhuo",
        ],
      },
      {
        id: "gongsundu", name: "공손도", color: "#5f9ea0",
        cities: { liaodong: 9000, xuantu: 4000 },
        officers: [
          "공손도 @liaodong", "공손강 @liaodong", "공손공 @liaodong",
          "유의 @liaodong", "양의 @xuantu",
        ],
      },
      {
        id: "liubei", name: "유비", color: "#3cb371",
        cities: { pingyuan: 5000 },
        officers: [
          "유비 @pingyuan", "관우 @pingyuan", "장비 @pingyuan",
          "간옹 @pingyuan",
          "관평 @pingyuan", "장포 @pingyuan", "관흥 @pingyuan",
        ],
      },
      {
        id: "kongrong", name: "공융", color: "#a0522d",
        cities: { beihai: 7000 },
        officers: ["공융 @beihai", "손소 @beihai", "왕수 @beihai"],
      },
      {
        id: "taoqian", name: "도겸", color: "#9370db",
        cities: { donghai: 10000, langya: 6000, pengcheng: 6000, xiapi: 8000 },
        officers: [
          "도겸 @donghai", "미축 @donghai", "미방 @donghai",
          "조굉 @donghai", "왕랑 @donghai", "조욱 @donghai",
          "진규 @xiapi", "진등 @xiapi",
          "장패 @langya", "손관 @langya",
          "조표 @pengcheng", "착융 @pengcheng", "설례 @pengcheng",
        ],
      },
      {
        id: "liuyan", name: "유언", color: "#b8860b",
        cities: { guanghan: 10000, shujun: 12000, qianwei: 5000, bajun: 8000 },
        officers: [
          "유언 @guanghan", "유장 @guanghan", "오의 @guanghan",
          "방희 @guanghan",
          "장임 @shujun", "장송 @shujun", "조위 @shujun",
          "장숙 @shujun",
          "가룡 @qianwei", "임기 @qianwei",
          "황권 @bajun", "엄안 @bajun",
        ],
      },
      {
        id: "zhanglu", name: "장로", color: "#708090",
        cities: { hanzhong: 9000 },
        officers: [
          "장로 @hanzhong", "장위 @hanzhong", "염포 @hanzhong",
          "양송 @hanzhong", "양앙 @hanzhong", "양백 @hanzhong",
        ],
      },
      {
        id: "mateng", name: "마등", color: "#cd5c5c",
        cities: { hanyang: 9000, wuwei: 6000 },
        officers: [
          "마등 @hanyang", "방덕 @hanyang",
          "마초 @hanyang", "마휴 @hanyang",
          "마철 @wuwei", "마대 @wuwei",
        ],
      },
      {
        id: "hansui", name: "한수", color: "#daa520",
        cities: { jincheng: 9000, longxi: 5000 },
        officers: [
          "한수 @jincheng", "성의 @jincheng", "염행 @jincheng",
          "양추 @longxi", "후선 @longxi",
        ],
      },
      {
        id: "yanbaihu", name: "엄백호", color: "#6b8e23",
        cities: { wujun: 8000 },
        officers: ["엄백호 @wujun", "엄여 @wujun", "허공 @wujun"],
      },
      {
        id: "shixie", name: "사섭", color: "#20b2aa",
        cities: { jiaozhi: 7000, hepu: 3000, jiuzhen: 3000, nanhai: 5000 },
        officers: [
          "사섭 @jiaozhi", "사휘 @jiaozhi", "사일 @hepu",
          "사유 @jiuzhen", "사무 @nanhai",
        ],
      },
    ],
    // Unaffiliated talent, hidden until found with 탐색. Those not yet of age
    // appear in their home commandery when they turn 16.
    free: [
      "주준 @henan", "한호 @henei", "사마랑 @henei",
      "사마의 @henei", "사마부 @henei", "장양 @henei",
      "순유 @jingzhao", "종요 @jingzhao", "법정 @youfufeng",
      "서황 @hedong", "양봉 @hedong", "한섬 @hedong",
      "가규 @hedong",
      "곽가 @yingchuan", "희지재 @yingchuan", "서서 @yingchuan",
      "진군 @yingchuan", "종회 @yingchuan",
      "한복 @chenliu", "전위 @chenliu",
      "허저 @peiguo", "하후패 @peiguo",
      "정욱 @dongjun", "진궁 @dongjun", "반장 @dongjun",
      "만총 @shanyang",
      "장연 @changshan", "전예 @yuyang",
      "곽회 @taiyuan", "왕기 @taiyuan", "학소 @taiyuan",
      "태사자 @donglai", "유요 @donglai",
      "제갈근 @langya", "서성 @langya",
      "노숙 @xiapi", "보즐 @xiapi",
      "장소 @pengcheng", "장굉 @guangling",
      "여몽 @runan",
      "장흠 @jiujiang", "주태 @jiujiang", "주유 @lujiang",
      "진무 @lujiang", "장영 @danyang", "번능 @danyang",
      "우미 @danyang",
      "능조 @wujun", "능통 @wujun", "육손 @wujun",
      "주환 @wujun",
      "하제 @kuaiji", "우번 @kuaiji", "감택 @kuaiji",
      "위연 @nanyang", "화흠 @nanyang", "등애 @nanyang",
      "등지 @nanyang",
      "제갈량 @nanjun", "방통 @nanjun", "마량 @nanjun",
      "마속 @nanjun", "동윤 @nanjun",
      "비의 @jiangxia", "장완 @lingling", "유파 @lingling",
      "감녕 @bajun", "왕평 @bajun", "장억 @qianwei",
      "강유 @hanyang",
      "정은 @anding", "이감 @anding", "마완 @anding",
      "장횡 @beidi", "양흥 @beidi",
    ],
  };
})(globalThis.SAM = globalThis.SAM || {});
