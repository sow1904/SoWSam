// Scenario: 190년 군웅할거.
// Who held which city follows the historical situation around 190 with some
// simplification. All ability values are this game's own ratings.
(function (S) {
  // Officer line: "name lead war int pol @city". The first officer of a force is its ruler.
  S.SCENARIO_190 = {
    id: "190",
    title: "190년 군웅할거",
    desc: "동탁이 낙양을 장악하고 관동의 제후들이 저마다 군사를 일으켰다.",
    year: 190,
    month: 1,
    forces: [
      {
        id: "dongzhuo", name: "동탁", color: "#5b4a8a",
        cities: { luoyang: 30000, changan: 22000 },
        officers: [
          "동탁 86 85 60 38 @luoyang", "여포 88 100 30 14 @luoyang", "이유 42 26 88 76 @luoyang",
          "화웅 72 88 30 20 @luoyang", "서영 78 70 62 46 @luoyang", "호진 60 66 26 20 @luoyang",
          "장료 85 89 72 56 @luoyang", "고순 84 85 50 40 @luoyang",
          "이각 70 78 32 16 @changan", "곽사 66 74 28 12 @changan", "장제 72 70 54 46 @changan",
          "번조 62 72 26 20 @changan", "우보 55 62 36 30 @changan", "가후 80 40 97 82 @changan",
          "장수 74 80 58 42 @changan", "동민 40 46 30 26 @changan",
        ],
      },
      {
        id: "yuanshao", name: "원소", color: "#c9a227",
        cities: { nanpi: 12000 },
        officers: [
          "원소 82 70 72 76 @nanpi", "안량 80 92 30 30 @nanpi", "문추 78 91 26 22 @nanpi",
          "전풍 68 30 93 84 @nanpi", "봉기 50 40 78 70 @nanpi", "허유 40 25 82 56 @nanpi",
          "곽도 56 45 77 62 @nanpi", "순심 45 30 70 72 @nanpi", "고간 70 70 55 52 @nanpi",
          "원담 60 62 45 46 @nanpi",
        ],
      },
      {
        id: "hanfu", name: "한복", color: "#8a8f6a",
        cities: { ye: 14000 },
        officers: [
          "한복 40 32 45 56 @ye", "저수 85 42 92 86 @ye", "심배 66 45 80 78 @ye",
          "장합 88 87 68 52 @ye", "국의 82 80 45 30 @ye", "고람 74 78 40 30 @ye",
          "경무 30 36 50 56 @ye", "민순 30 30 56 60 @ye",
        ],
      },
      {
        id: "caocao", name: "조조", color: "#2f5fb3",
        cities: { chenliu: 8000 },
        officers: [
          "조조 96 72 92 92 @chenliu", "하후돈 88 89 58 64 @chenliu", "하후연 85 89 50 40 @chenliu",
          "조인 88 84 60 56 @chenliu", "조홍 72 78 40 36 @chenliu", "악진 80 83 50 38 @chenliu",
          "이전 76 75 75 70 @chenliu", "조순 76 70 56 56 @chenliu",
        ],
      },
      {
        id: "yuanshu", name: "원술", color: "#d2691e",
        cities: { wan: 14000, runan: 8000 },
        officers: [
          "원술 60 62 58 40 @wan", "기령 75 82 40 35 @wan", "장훈 68 65 55 46 @wan",
          "염상 30 25 75 70 @wan", "뇌박 60 65 30 25 @wan",
          "교유 58 60 40 35 @runan", "양홍 32 25 76 68 @runan", "진란 58 62 32 25 @runan",
        ],
      },
      {
        id: "sunjian", name: "손견", color: "#c0392b",
        cities: { changsha: 10000 },
        officers: [
          "손견 92 90 70 66 @changsha", "손책 86 91 70 70 @changsha", "정보 82 78 70 66 @changsha",
          "황개 80 82 62 58 @changsha", "한당 76 80 45 42 @changsha", "조무 66 72 40 35 @changsha",
          "오경 65 62 50 56 @changsha", "손정 55 50 56 62 @changsha",
        ],
      },
      {
        id: "liubiao", name: "유표", color: "#2e8b57",
        cities: { xiangyang: 12000, jiangling: 8000, jiangxia: 7000 },
        officers: [
          "유표 64 40 72 82 @xiangyang", "괴량 50 30 88 86 @xiangyang", "괴월 55 35 87 80 @xiangyang",
          "채모 74 68 62 56 @xiangyang", "왕위 70 70 66 56 @xiangyang", "장윤 60 55 50 50 @xiangyang",
          "문빙 82 82 62 58 @jiangling", "황충 86 93 60 50 @jiangling",
          "황조 70 70 45 40 @jiangxia",
        ],
      },
      {
        id: "gongsunzan", name: "공손찬", color: "#e8e8e8",
        cities: { beiping: 12000 },
        officers: [
          "공손찬 85 86 60 50 @beiping", "엄강 66 70 35 30 @beiping", "전해 62 66 35 30 @beiping",
          "공손범 60 60 40 40 @beiping", "공손월 55 60 35 35 @beiping", "관정 30 25 60 56 @beiping",
        ],
      },
      {
        id: "liuyu", name: "유우", color: "#7fb3d5",
        cities: { ji: 10000 },
        officers: [
          "유우 55 30 70 88 @ji", "선우보 66 62 50 46 @ji", "전주 76 74 74 66 @ji", "염유 70 66 50 40 @ji",
        ],
      },
      {
        id: "liubei", name: "유비", color: "#3cb371",
        cities: { pingyuan: 5000 },
        officers: [
          "유비 78 72 75 78 @pingyuan", "관우 95 97 75 62 @pingyuan", "장비 86 98 35 24 @pingyuan",
          "간옹 30 25 65 70 @pingyuan",
        ],
      },
      {
        id: "kongrong", name: "공융", color: "#a0522d",
        cities: { beihai: 7000 },
        officers: [
          "공융 40 25 76 70 @beihai", "무안국 62 80 25 20 @beihai", "손소 50 50 60 66 @beihai",
          "왕수 40 30 60 70 @beihai",
        ],
      },
      {
        id: "taoqian", name: "도겸", color: "#9370db",
        cities: { xiapi: 12000, xiaopei: 6000 },
        officers: [
          "도겸 55 40 60 70 @xiapi", "진규 40 25 82 80 @xiapi", "진등 74 60 86 80 @xiapi",
          "미축 35 30 65 86 @xiapi", "장패 76 80 50 45 @xiapi",
          "조표 58 66 30 25 @xiaopei", "미방 50 55 40 40 @xiaopei", "손관 60 64 38 32 @xiaopei",
        ],
      },
      {
        id: "liuyan", name: "유언", color: "#b8860b",
        cities: { chengdu: 16000, jiangzhou: 7000 },
        officers: [
          "유언 65 40 72 76 @chengdu", "유장 40 30 50 60 @chengdu", "장임 85 82 72 60 @chengdu",
          "황권 70 50 80 76 @chengdu", "장송 25 20 88 80 @chengdu", "조위 60 55 50 50 @chengdu",
          "엄안 80 82 60 50 @jiangzhou", "오의 72 68 60 55 @jiangzhou",
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
        cities: { wuwei: 9000, tianshui: 8000 },
        officers: [
          "마등 80 82 50 56 @wuwei", "마초 88 97 40 30 @wuwei", "마휴 55 60 30 25 @wuwei",
          "방덕 84 92 60 46 @tianshui", "마대 74 78 45 40 @tianshui", "마철 50 58 25 20 @tianshui",
        ],
      },
      {
        id: "hansui", name: "한수", color: "#daa520",
        cities: { anding: 9000 },
        officers: [
          "한수 76 72 74 66 @anding", "성의 64 74 30 25 @anding", "염행 72 85 50 40 @anding",
          "양추 60 66 35 30 @anding", "후선 56 62 30 28 @anding",
        ],
      },
      {
        id: "liuyao", name: "유요", color: "#4682b4",
        cities: { jianye: 10000 },
        officers: [
          "유요 55 40 55 66 @jianye", "착융 50 55 40 30 @jianye", "설례 52 50 40 46 @jianye",
          "장영 66 66 40 38 @jianye", "번능 60 65 30 28 @jianye", "우미 50 50 40 40 @jianye",
        ],
      },
      {
        id: "yanbaihu", name: "엄백호", color: "#6b8e23",
        cities: { wu: 8000 },
        officers: ["엄백호 62 70 35 30 @wu", "엄여 55 66 25 20 @wu", "허공 45 40 50 56 @wu"],
      },
      {
        id: "wanglang", name: "왕랑", color: "#20b2aa",
        cities: { kuaiji: 7000 },
        officers: ["왕랑 50 30 75 80 @kuaiji", "우번 50 55 82 70 @kuaiji"],
      },
    ],
    // Unaffiliated talent, hidden until found with 탐색.
    free: [
      "서황 87 90 70 50 @jinyang", "순욱 60 25 96 98 @xuchang", "곽가 70 30 98 80 @xuchang",
      "순유 80 35 94 85 @xuchang", "정욱 75 50 90 82 @puyang", "만총 70 60 82 80 @puyang",
      "진궁 75 50 88 80 @puyang", "우금 80 78 60 56 @puyang", "노숙 82 50 92 90 @shouchun",
      "주유 96 72 96 86 @lujiang", "조운 90 96 76 64 @ye", "감녕 86 94 70 40 @jiangzhou",
      "태사자 86 92 66 50 @beihai", "하제 80 78 66 60 @kuaiji", "전위 72 95 30 20 @chenliu",
      "허저 70 95 30 20 @runan", "위연 80 88 60 40 @wan", "법정 75 40 95 86 @chengdu",
    ],
  };
})(globalThis.SAM = globalThis.SAM || {});
