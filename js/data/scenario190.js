// Scenario: 190년 반동탁 연합.
// Who held which commandery follows the situation in early 190 as recorded in
// the histories, with some simplification. Commanderies not listed under any
// force are held by local administrators and start neutral.
// All ability values are this game's own ratings.
(function (S) {
  // Officer line: "name lead war int pol @city". The first officer of a force is its ruler.
  S.SCENARIO_190 = {
    id: "190",
    map: "190",
    title: "190년 반동탁 연합",
    desc: "동탁이 낙양을 장악하고 관동의 주목·태수들이 저마다 군사를 일으켰다.",
    year: 190,
    month: 1,
    forces: [
      {
        id: "dongzhuo", name: "동탁", color: "#5b4a8a",
        cities: { henan: 30000, jingzhao: 18000, hongnong: 8000, hedong: 12000, zuopingyi: 5000, youfufeng: 9000 },
        officers: [
          "동탁 86 85 60 38 @henan", "여포 88 100 30 14 @henan", "이유 42 26 88 76 @henan",
          "화웅 72 88 30 20 @henan", "서영 78 70 62 46 @henan", "호진 60 66 26 20 @henan",
          "장료 85 89 72 56 @henan", "고순 84 85 50 40 @henan", "이숙 56 66 45 40 @henan",
          "채옹 15 10 82 78 @henan",
          "우보 60 64 30 26 @hedong", "이각 70 78 32 16 @hedong", "곽사 66 74 28 12 @hedong",
          "장제 72 70 54 46 @hedong", "가후 80 40 97 82 @hedong", "장수 74 80 58 42 @hedong",
          "단외 60 56 52 60 @hongnong", "동월 64 66 36 28 @hongnong",
          "동민 40 46 30 26 @jingzhao", "번조 62 72 26 20 @jingzhao", "왕윤 45 35 82 84 @jingzhao",
          "개훈 62 55 70 74 @jingzhao",
          "황보숭 88 70 70 68 @youfufeng",
        ],
      },
      {
        id: "yuanshao", name: "원소", color: "#c9a227",
        cities: { bohai: 13000 },
        officers: [
          "원소 82 70 72 76 @bohai", "안량 80 92 30 30 @bohai", "문추 78 91 26 22 @bohai",
          "전풍 68 30 93 84 @bohai", "봉기 50 40 78 70 @bohai", "허유 40 25 82 56 @bohai",
          "곽도 56 45 77 62 @bohai", "순심 45 30 70 72 @bohai", "고간 70 70 55 52 @bohai",
          "원담 60 62 45 46 @bohai", "진림 20 15 80 68 @bohai",
        ],
      },
      {
        id: "wangkuang", name: "왕광", color: "#8fbc8f",
        cities: { henei: 9000 },
        officers: ["왕광 60 55 58 64 @henei", "한호 68 62 62 66 @henei"],
      },
      {
        id: "hanfu", name: "한복", color: "#8a8f6a",
        cities: { weijun: 14000, julu: 6000, changshan: 5000, zhongshan: 6000, anping: 5000, hejian: 5000, qinghe: 6000, zhaoguo: 4000 },
        officers: [
          "한복 40 32 45 56 @weijun", "저수 85 42 92 86 @weijun", "심배 66 45 80 78 @weijun",
          "경무 30 36 50 56 @weijun", "민순 30 30 56 60 @weijun", "신평 30 25 76 72 @weijun",
          "신비 35 30 82 78 @weijun", "조부 52 54 40 40 @weijun", "정환 50 52 40 42 @weijun",
          "장합 88 87 68 52 @hejian", "국의 82 80 45 30 @julu", "고람 74 78 40 30 @zhongshan",
        ],
      },
      {
        id: "caocao", name: "조조", color: "#2f5fb3",
        cities: { chenliu: 8000 },
        officers: [
          "조조 96 72 92 92 @chenliu", "하후돈 88 89 58 64 @chenliu", "하후연 85 89 50 40 @chenliu",
          "조인 88 84 60 56 @chenliu", "조홍 72 78 40 36 @chenliu", "악진 80 83 50 38 @chenliu",
          "이전 76 75 75 70 @chenliu", "조순 76 70 56 56 @chenliu", "위자 55 50 62 68 @chenliu",
          "사환 66 66 40 38 @chenliu",
        ],
      },
      {
        id: "liudai", name: "유대", color: "#b0a4d8",
        cities: { shanyang: 8000 },
        officers: ["유대 55 45 60 66 @shanyang"],
      },
      {
        id: "qiaomao", name: "교모", color: "#c3b091",
        cities: { dongjun: 6000 },
        officers: ["교모 50 40 60 66 @dongjun"],
      },
      {
        id: "baoxin", name: "포신", color: "#7b9e89",
        cities: { jibei: 7000 },
        officers: ["포신 76 66 74 70 @jibei", "포도 60 66 40 40 @jibei", "우금 80 78 60 56 @jibei"],
      },
      {
        id: "zhangchao", name: "장초", color: "#a3785f",
        cities: { guangling: 8000 },
        officers: ["장초 60 52 56 60 @guangling", "장홍 50 45 72 72 @guangling"],
      },
      {
        id: "kongzhou", name: "공주", color: "#d4a5a5",
        cities: { yingchuan: 8000 },
        officers: ["공주 30 20 66 70 @yingchuan"],
      },
      {
        id: "liuchong", name: "유총", color: "#e07b39",
        cities: { chenguo: 10000 },
        officers: ["유총 72 74 50 56 @chenguo", "낙준 40 30 70 78 @chenguo"],
      },
      {
        id: "yuanshu", name: "원술", color: "#d2691e",
        cities: { nanyang: 18000 },
        officers: [
          "원술 60 62 58 40 @nanyang", "기령 75 82 40 35 @nanyang", "장훈 68 65 55 46 @nanyang",
          "염상 30 25 75 70 @nanyang", "뇌박 60 65 30 25 @nanyang", "교유 58 60 40 35 @nanyang",
          "양홍 32 25 76 68 @nanyang", "진란 58 62 32 25 @nanyang", "원윤 45 40 50 56 @nanyang",
          "이풍 58 60 40 36 @nanyang", "진기 66 66 45 40 @nanyang", "유훈 60 55 50 48 @nanyang",
        ],
      },
      {
        id: "sunjian", name: "손견", color: "#c0392b",
        cities: { changsha: 10000 },
        officers: [
          "손견 92 90 70 66 @changsha", "손책 86 91 70 70 @changsha", "정보 82 78 70 66 @changsha",
          "황개 80 82 62 58 @changsha", "한당 76 80 45 42 @changsha", "조무 66 72 40 35 @changsha",
          "오경 65 62 50 56 @changsha", "손정 55 50 56 62 @changsha", "손분 72 70 55 56 @changsha",
          "주치 70 60 66 72 @changsha", "손하 60 66 45 45 @changsha", "서곤 60 60 50 50 @changsha",
        ],
      },
      {
        id: "liubiao", name: "유표", color: "#2e8b57",
        cities: { nanjun: 12000, jiangxia: 6000 },
        officers: [
          "유표 64 40 72 82 @nanjun", "괴량 50 30 88 86 @nanjun", "괴월 55 35 87 80 @nanjun",
          "채모 74 68 62 56 @nanjun", "왕위 70 70 66 56 @nanjun", "장윤 60 55 50 50 @nanjun",
          "문빙 82 82 62 58 @nanjun", "황충 86 93 60 50 @nanjun", "유반 70 72 40 36 @nanjun",
          "한숭 30 20 76 76 @nanjun", "유선 30 20 72 74 @nanjun", "부손 25 20 76 66 @nanjun",
          "황조 70 70 45 40 @jiangxia",
        ],
      },
      {
        id: "gongsunzan", name: "공손찬", color: "#e8e8e8",
        cities: { youbeiping: 12000, liaoxi: 5000 },
        officers: [
          "공손찬 85 86 60 50 @youbeiping", "엄강 66 70 35 30 @youbeiping", "전해 62 66 35 30 @youbeiping",
          "공손범 60 60 40 40 @youbeiping", "공손월 55 60 35 35 @youbeiping", "관정 30 25 60 56 @youbeiping",
          "단경 66 64 40 38 @youbeiping", "추단 60 62 35 32 @liaoxi", "공손속 60 60 40 40 @liaoxi",
        ],
      },
      {
        id: "liuyu", name: "유우", color: "#7fb3d5",
        cities: { guangyang: 10000, zhuo: 6000, yuyang: 6000, shanggu: 3000, daijun: 3000 },
        officers: [
          "유우 55 30 70 88 @guangyang", "선우보 66 62 50 46 @guangyang", "전주 76 74 74 66 @guangyang",
          "염유 70 66 50 40 @yuyang", "위유 30 25 70 72 @guangyang", "선우은 62 64 40 36 @zhuo",
          "제주 30 25 60 62 @guangyang",
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
          "마등 80 82 50 56 @hanyang", "마초 88 97 40 30 @hanyang", "마휴 55 60 30 25 @hanyang",
          "방덕 84 92 60 46 @hanyang", "마철 50 58 25 20 @wuwei", "마대 74 78 45 40 @wuwei",
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
    // Unaffiliated talent, hidden until found with 탐색.
    free: [
      "주준 85 70 70 66 @henan", "순유 80 35 94 85 @jingzhao", "종요 30 20 80 86 @jingzhao",
      "법정 75 40 95 86 @youfufeng", "서황 87 90 70 50 @hedong", "양봉 60 66 30 30 @hedong",
      "한섬 55 62 25 20 @hedong", "사마랑 30 20 72 76 @henei", "장양 66 66 45 50 @shangdang",
      "순욱 60 25 96 98 @yingchuan", "곽가 70 30 98 80 @yingchuan", "희지재 40 25 88 66 @yingchuan",
      "전위 72 95 30 20 @chenliu", "장막 62 55 62 66 @chenliu", "허저 70 95 30 20 @peiguo",
      "정욱 75 50 90 82 @dongjun", "진궁 75 50 88 80 @dongjun", "만총 70 60 82 80 @shanyang",
      "조운 90 96 76 64 @changshan", "장연 72 74 50 46 @changshan", "전예 76 66 72 74 @yuyang",
      "태사자 86 92 66 50 @donglai", "유요 55 40 55 66 @donglai",
      "노숙 82 50 92 90 @xiapi", "장소 25 20 80 92 @pengcheng", "장굉 25 20 80 84 @guangling",
      "장흠 72 75 50 40 @jiujiang", "주태 72 86 30 26 @jiujiang", "주유 96 72 96 86 @lujiang",
      "진무 66 80 35 30 @lujiang", "장영 66 66 40 38 @danyang", "번능 60 65 30 28 @danyang",
      "우미 50 50 40 40 @danyang", "능조 66 76 35 30 @wujun", "하제 80 78 66 60 @kuaiji",
      "우번 50 55 82 70 @kuaiji", "위연 80 88 60 40 @nanyang", "화흠 30 20 76 78 @nanyang",
      "감녕 86 94 70 40 @bajun", "정은 58 64 30 25 @anding", "이감 56 62 30 25 @anding",
      "장횡 58 64 28 22 @beidi", "양흥 60 66 30 24 @beidi", "마완 56 60 30 24 @anding",
    ],
  };
})(globalThis.SAM = globalThis.SAM || {});
