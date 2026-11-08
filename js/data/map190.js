// Map for 190: the thirteen provinces (州) of the Later Han and their
// commanderies (郡國), following the 續漢書 郡國志 list. Dependent states
// (屬國) are folded into their parent commandery. Each commandery is one city
// on the map, placed at its seat (治所) by approximate latitude/longitude.
//
// size (1-5) is a rough rank of registered population in the mid-2nd-century
// census; the far northwest was already much emptier by 190.
// gentry (0-100) is this game's estimate of the local great families' hold.
(function (S) {
  S.MAPS = S.MAPS || {};

  S.PROVINCES = {
    sili: "사례", yu: "예주", yan: "연주", ji: "기주", you: "유주", bing: "병주",
    liang: "량주", yi: "익주", jing: "형주", yang: "양주", xu: "서주", qing: "청주", jiao: "교주",
  };

  // id: [name, province, seat, lat, lon, size, gentry]
  const cities = {
    // 사례
    henan:      ["하남", "sili", "낙양", 34.68, 112.60, 4, 25],
    henei:      ["하내", "sili", "회", 35.15, 113.30, 4, 45],
    hedong:     ["하동", "sili", "안읍", 35.10, 111.25, 3, 45],
    hongnong:   ["홍농", "sili", "홍농", 34.62, 110.90, 2, 40],
    jingzhao:   ["경조", "sili", "장안", 34.28, 108.90, 4, 35],
    zuopingyi:  ["좌풍익", "sili", "고릉", 34.85, 109.70, 2, 35],
    youfufeng:  ["우부풍", "sili", "괴리", 34.40, 107.80, 2, 40],
    // 예주
    yingchuan:  ["영천", "yu", "양책", 34.15, 113.50, 5, 65],
    runan:      ["여남", "yu", "평여", 33.00, 114.40, 5, 70],
    liangguo:   ["양국", "yu", "수양", 34.42, 115.65, 3, 45],
    peiguo:     ["패국", "yu", "상", 33.85, 116.75, 2, 50],
    chenguo:    ["진국", "yu", "진", 33.70, 114.95, 4, 50],
    luguo:      ["노국", "yu", "노", 35.55, 117.25, 3, 50],
    // 연주
    chenliu:    ["진류", "yan", "진류", 34.65, 114.50, 4, 50],
    dongjun:    ["동군", "yan", "복양", 35.75, 115.00, 3, 45],
    dongping:   ["동평", "yan", "무염", 35.95, 116.30, 3, 45],
    rencheng:   ["임성", "yan", "임성", 35.40, 116.55, 2, 40],
    taishan:    ["태산", "yan", "봉고", 36.20, 117.15, 3, 55],
    jibei:      ["제북", "yan", "노", 36.55, 116.55, 2, 45],
    shanyang:   ["산양", "yan", "창읍", 35.05, 116.10, 3, 55],
    jiyin:      ["제음", "yan", "정도", 35.05, 115.45, 3, 45],
    // 기주
    weijun:     ["위군", "ji", "업", 36.30, 114.35, 4, 55],
    julu:       ["거록", "ji", "영도", 37.25, 114.85, 3, 50],
    changshan:  ["상산", "ji", "원씨", 37.95, 114.40, 3, 45],
    zhongshan:  ["중산", "ji", "노노", 38.55, 115.00, 3, 50],
    anping:     ["안평", "ji", "신도", 37.65, 115.55, 3, 50],
    hejian:     ["하간", "ji", "낙성", 38.35, 116.10, 3, 50],
    qinghe:     ["청하", "ji", "감릉", 36.95, 115.75, 4, 55],
    zhaoguo:    ["조국", "ji", "한단", 36.95, 114.25, 2, 45],
    bohai:      ["발해", "ji", "남피", 38.05, 116.75, 4, 55],
    // 유주
    zhuo:       ["탁군", "you", "탁", 39.45, 115.95, 3, 45],
    guangyang:  ["광양", "you", "계", 39.95, 116.45, 3, 40],
    daijun:     ["대군", "you", "고류", 40.05, 114.45, 1, 30],
    shanggu:    ["상곡", "you", "저양", 40.45, 115.40, 1, 30],
    yuyang:     ["어양", "you", "어양", 40.45, 116.85, 3, 35],
    youbeiping: ["우북평", "you", "토은", 39.90, 118.20, 2, 35],
    liaoxi:     ["요서", "you", "양락", 41.40, 120.90, 1, 30],
    liaodong:   ["요동", "you", "양평", 41.25, 123.15, 2, 35],
    xuantu:     ["현도", "you", "고구려", 41.90, 124.40, 1, 25],
    lelang:     ["낙랑", "you", "조선", 39.00, 125.75, 2, 30],
    // 병주
    shangdang:  ["상당", "bing", "장자", 36.15, 113.00, 2, 40],
    taiyuan:    ["태원", "bing", "진양", 37.80, 112.50, 3, 55],
    xihe:       ["서하", "bing", "이석", 37.50, 111.10, 1, 25],
    shangjun:   ["상군", "bing", "부시", 38.05, 109.90, 1, 20],
    wuyuan:     ["오원", "bing", "구원", 40.60, 109.80, 1, 20],
    yunzhong:   ["운중", "bing", "운중", 40.70, 111.30, 1, 20],
    dingxiang:  ["정양", "bing", "선무", 40.05, 112.30, 1, 20],
    yanmen:     ["안문", "bing", "음관", 39.15, 112.95, 2, 30],
    shuofang:   ["삭방", "bing", "임융", 40.40, 107.30, 1, 15],
    // 량주
    longxi:     ["롱서", "liang", "적도", 35.40, 103.90, 1, 40],
    hanyang:    ["한양", "liang", "기", 34.75, 105.50, 2, 45],
    wudu:       ["무도", "liang", "하변", 33.75, 105.70, 1, 30],
    jincheng:   ["금성", "liang", "윤오", 36.25, 103.35, 1, 35],
    anding:     ["안정", "liang", "임경", 35.55, 107.15, 1, 40],
    beidi:      ["북지", "liang", "부평", 36.45, 107.70, 1, 35],
    wuwei:      ["무위", "liang", "고장", 37.93, 102.63, 2, 40],
    zhangye:    ["장액", "liang", "득득", 38.93, 100.45, 1, 30],
    jiuquan:    ["주천", "liang", "녹복", 39.73, 98.50, 1, 35],
    dunhuang:   ["돈황", "liang", "돈황", 40.14, 94.66, 1, 45],
    // 익주
    hanzhong:   ["한중", "yi", "남정", 33.10, 107.00, 3, 40],
    bajun:      ["파군", "yi", "강주", 29.56, 106.55, 4, 55],
    guanghan:   ["광한", "yi", "낙", 31.25, 104.50, 3, 60],
    shujun:     ["촉군", "yi", "성도", 30.66, 104.06, 5, 70],
    qianwei:    ["건위", "yi", "무양", 29.90, 103.85, 3, 55],
    zangke:     ["장가", "yi", "고란", 26.60, 106.70, 2, 50],
    yuexi:      ["월수", "yi", "공도", 27.90, 102.25, 2, 40],
    yizhoujun:  ["익주군", "yi", "전지", 24.90, 102.65, 2, 55],
    yongchang:  ["영창", "yi", "불위", 25.10, 99.20, 2, 45],
    // 형주
    nanyang:    ["남양", "jing", "완", 33.00, 112.53, 5, 65],
    nanjun:     ["남군", "jing", "강릉", 30.35, 112.20, 4, 65],
    jiangxia:   ["강하", "jing", "서릉", 30.55, 114.85, 2, 50],
    changsha:   ["장사", "jing", "임상", 28.20, 112.95, 4, 50],
    wuling:     ["무릉", "jing", "임원", 29.05, 111.70, 2, 40],
    lingling:   ["영릉", "jing", "천릉", 26.20, 111.60, 3, 45],
    guiyang:    ["계양", "jing", "침", 25.80, 113.00, 2, 40],
    // 양주
    jiujiang:   ["구강", "yang", "음릉", 32.55, 117.45, 3, 50],
    danyang:    ["단양", "yang", "완릉", 30.95, 118.75, 3, 55],
    lujiang:    ["여강", "yang", "서", 31.15, 117.00, 3, 55],
    kuaiji:     ["회계", "yang", "산음", 30.00, 120.58, 3, 75],
    wujun:      ["오군", "yang", "오", 31.30, 120.60, 3, 80],
    yuzhang:    ["예장", "yang", "남창", 28.68, 115.90, 4, 50],
    // 서주
    donghai:    ["동해", "xu", "담", 34.75, 118.45, 3, 55],
    langya:     ["낭야", "xu", "개양", 35.50, 118.55, 3, 55],
    pengcheng:  ["팽성", "xu", "팽성", 34.26, 117.18, 3, 45],
    guangling:  ["광릉", "xu", "광릉", 32.40, 119.42, 3, 55],
    xiapi:      ["하비", "xu", "하비", 33.85, 118.25, 3, 55],
    // 청주
    qiguo:      ["제국", "qing", "임치", 36.85, 118.30, 3, 50],
    beihai:     ["북해", "qing", "극", 36.70, 119.20, 4, 45],
    donglai:    ["동래", "qing", "황", 37.55, 120.45, 3, 40],
    jinan:      ["제남", "qing", "동평릉", 36.80, 117.35, 3, 45],
    lean:       ["낙안", "qing", "임제", 37.25, 117.85, 3, 40],
    pingyuan:   ["평원", "qing", "평원", 37.20, 116.40, 4, 45],
    // 교주
    nanhai:     ["남해", "jiao", "번우", 23.12, 113.28, 2, 35],
    cangwu:     ["창오", "jiao", "광신", 23.48, 111.30, 2, 35],
    yulin:      ["울림", "jiao", "포산", 23.10, 109.60, 1, 30],
    hepu:       ["합포", "jiao", "합포", 21.65, 109.20, 1, 30],
    jiaozhi:    ["교지", "jiao", "용편", 21.04, 106.00, 2, 45],
    jiuzhen:    ["구진", "jiao", "서포", 19.80, 105.75, 1, 35],
    rinan:      ["일남", "jiao", "서권", 16.80, 107.10, 1, 30],
  };

  // Map projection. The far west and the far south are squeezed so the
  // contested heartland gets most of the space.
  S.MAP_SIZE = { w: 2060, h: 1840 };
  S.project = function (lat, lon) {
    const lo = lon >= 103 ? lon : 103 - (103 - lon) * 0.45;
    const la = lat >= 25 ? lat : 25 - (25 - lat) * 0.5;
    return [Math.round((lo - 98.5) * 72 + 40), Math.round((42.8 - la) * 80 + 40)];
  };

  // Rough land outline and islands, as [lat, lon] points.
  const land = [
    [45, 90], [45, 130], [34.3, 130], [34.4, 126.6], [35.0, 126.3], [36.0, 126.5], [37.6, 126.6], [37.9, 125.3],
    [38.7, 125.0], [39.6, 124.6], [39.85, 124.3], [39.9, 124.1], [39.3, 122.9], [38.8, 121.3], [39.5, 121.5],
    [40.6, 122.2], [40.9, 121.8], [40.9, 121.1], [40.0, 119.8], [39.9, 119.6], [39.0, 117.7], [38.4, 117.6],
    [37.7, 118.9], [37.2, 119.0], [37.6, 120.3], [37.8, 120.8], [37.5, 121.4], [37.5, 122.4], [37.1, 122.6],
    [36.1, 120.4], [35.4, 119.5], [34.7, 119.4], [33.8, 120.3], [31.9, 121.8], [31.2, 121.8], [30.7, 121.0],
    [30.0, 121.6], [29.9, 121.9], [28.6, 121.5], [28.0, 120.9], [26.1, 119.6], [24.5, 118.1], [23.4, 116.7],
    [22.8, 115.4], [22.3, 114.2], [22.2, 113.6], [21.2, 110.4], [20.3, 110.2], [21.5, 109.6], [21.5, 109.1],
    [21.6, 108.3], [21.0, 107.2], [20.8, 106.7], [20.0, 106.2], [19.8, 105.9], [18.7, 105.7], [17.5, 106.6],
    [16.5, 107.6], [15.5, 108.6], [13.0, 109.5], [13.0, 90],
  ];
  const islands = [
    [[20.1, 110.6], [20.0, 111.0], [19.2, 110.6], [18.3, 109.6], [18.6, 108.7], [19.6, 108.7], [20.1, 109.6]],
    [[25.3, 121.5], [24.0, 121.7], [22.0, 120.8], [23.0, 120.1], [24.6, 120.7]],
  ];
  // Yellow River (Later Han course), Wei, Han, Yangtze, Huai, Xiang, Gan, Min, Xi, Red, Liao.
  const rivers = [
    [[35.5, 102.5], [36.1, 103.8], [37.5, 105.2], [38.5, 106.3], [39.7, 106.8], [40.3, 107.0], [40.8, 108.5],
      [40.55, 110.0], [40.25, 111.2], [39.4, 111.2], [37.5, 110.6], [35.6, 110.4], [34.6, 110.3], [34.85, 111.5],
      [34.9, 112.9], [34.9, 113.6], [35.4, 114.6], [35.8, 115.1], [36.5, 115.9], [37.2, 117.0], [37.6, 118.2], [37.7, 118.9]],
    [[34.6, 105.7], [34.4, 107.2], [34.3, 108.9], [34.55, 110.2]],
    [[33.1, 106.7], [32.7, 109.0], [32.6, 110.8], [32.0, 112.1], [31.2, 112.6], [30.6, 114.3]],
    [[28.8, 104.6], [28.9, 105.4], [29.6, 106.6], [30.8, 108.4], [31.0, 109.5], [30.7, 111.3], [30.3, 112.2],
      [29.4, 113.1], [30.6, 114.3], [29.7, 116.0], [30.5, 117.0], [31.3, 118.4], [32.0, 118.8], [32.2, 119.4], [31.4, 121.6]],
    [[32.5, 113.5], [32.4, 115.0], [32.6, 116.5], [33.0, 117.5], [33.5, 118.7], [34.0, 119.8]],
    [[25.6, 111.0], [26.4, 111.6], [27.3, 112.7], [28.2, 112.9], [29.0, 112.9], [29.4, 113.1]],
    [[25.9, 114.9], [27.1, 115.0], [28.7, 115.9], [29.7, 116.0]],
    [[31.0, 103.6], [30.0, 103.9], [28.8, 104.6]],
    [[23.5, 109.0], [23.5, 111.3], [23.1, 112.5], [22.8, 113.5]],
    [[22.5, 103.9], [21.3, 105.4], [21.0, 105.9], [20.3, 106.5]],
    [[42.5, 123.5], [41.5, 122.8], [40.8, 122.2]],
  ];

  // Roads between neighbouring commanderies, including the main passes and
  // river routes (함곡·동관, 분수, 장강 삼협, 회수, 금우도·미창도, 음평도, 야랑도).
  const roads = [
    ["henan", "henei"], ["henan", "hedong"], ["henan", "yingchuan"], ["henan", "nanyang"], ["henei", "yingchuan"], ["henei", "chenliu"],
    ["henei", "dongjun"], ["henei", "weijun"], ["henei", "shangdang"], ["hedong", "hongnong"], ["hedong", "shangdang"], ["hedong", "xihe"],
    ["hedong", "taiyuan"], ["hongnong", "zuopingyi"], ["hongnong", "nanyang"], ["hongnong", "jingzhao"], ["jingzhao", "zuopingyi"], ["jingzhao", "youfufeng"],
    ["zuopingyi", "beidi"], ["youfufeng", "hanyang"], ["youfufeng", "anding"], ["youfufeng", "hanzhong"], ["yingchuan", "runan"], ["yingchuan", "chenguo"],
    ["yingchuan", "chenliu"], ["yingchuan", "nanyang"], ["runan", "chenguo"], ["runan", "nanyang"], ["runan", "jiangxia"], ["runan", "jiujiang"],
    ["liangguo", "peiguo"], ["liangguo", "chenguo"], ["liangguo", "chenliu"], ["liangguo", "shanyang"], ["liangguo", "jiyin"], ["peiguo", "shanyang"],
    ["peiguo", "jiujiang"], ["peiguo", "pengcheng"], ["chenguo", "chenliu"], ["luguo", "dongping"], ["luguo", "rencheng"], ["luguo", "taishan"],
    ["luguo", "langya"], ["chenliu", "dongjun"], ["chenliu", "jiyin"], ["dongjun", "dongping"], ["dongjun", "jiyin"], ["dongjun", "weijun"],
    ["dongjun", "qinghe"], ["dongping", "rencheng"], ["dongping", "taishan"], ["dongping", "jibei"], ["rencheng", "shanyang"], ["rencheng", "pengcheng"],
    ["taishan", "jibei"], ["taishan", "langya"], ["taishan", "jinan"], ["jibei", "qinghe"], ["jibei", "jinan"], ["jibei", "pingyuan"],
    ["shanyang", "jiyin"], ["shanyang", "pengcheng"], ["weijun", "zhaoguo"], ["weijun", "shangdang"], ["julu", "changshan"], ["julu", "anping"],
    ["julu", "qinghe"], ["julu", "zhaoguo"], ["changshan", "zhongshan"], ["changshan", "anping"], ["changshan", "taiyuan"], ["zhongshan", "anping"],
    ["zhongshan", "hejian"], ["zhongshan", "zhuo"], ["zhongshan", "daijun"], ["anping", "hejian"], ["anping", "qinghe"], ["anping", "pingyuan"],
    ["hejian", "bohai"], ["hejian", "zhuo"], ["qinghe", "pingyuan"], ["zhaoguo", "shangdang"], ["bohai", "youbeiping"], ["bohai", "lean"],
    ["bohai", "pingyuan"], ["zhuo", "guangyang"], ["zhuo", "shanggu"], ["guangyang", "shanggu"], ["guangyang", "yuyang"], ["daijun", "shanggu"],
    ["daijun", "yanmen"], ["yuyang", "youbeiping"], ["youbeiping", "liaoxi"], ["liaoxi", "liaodong"], ["liaodong", "xuantu"], ["liaodong", "lelang"],
    ["shangdang", "taiyuan"], ["taiyuan", "xihe"], ["taiyuan", "yanmen"], ["xihe", "shangjun"], ["shangjun", "wuyuan"], ["shangjun", "shuofang"],
    ["shangjun", "beidi"], ["wuyuan", "yunzhong"], ["wuyuan", "shuofang"], ["yunzhong", "dingxiang"], ["dingxiang", "yanmen"], ["longxi", "hanyang"],
    ["longxi", "jincheng"], ["hanyang", "wudu"], ["hanyang", "anding"], ["wudu", "hanzhong"], ["wudu", "guanghan"], ["jincheng", "wuwei"],
    ["anding", "beidi"], ["wuwei", "zhangye"], ["zhangye", "jiuquan"], ["jiuquan", "dunhuang"], ["hanzhong", "bajun"], ["hanzhong", "guanghan"],
    ["bajun", "guanghan"], ["bajun", "shujun"], ["bajun", "qianwei"], ["bajun", "zangke"], ["bajun", "nanjun"], ["guanghan", "shujun"],
    ["shujun", "qianwei"], ["qianwei", "yuexi"], ["zangke", "yizhoujun"], ["zangke", "yulin"], ["yuexi", "yizhoujun"], ["yuexi", "yongchang"],
    ["yizhoujun", "yongchang"], ["yizhoujun", "jiaozhi"], ["nanyang", "nanjun"], ["nanjun", "jiangxia"], ["nanjun", "wuling"], ["jiangxia", "changsha"],
    ["jiangxia", "lujiang"], ["jiangxia", "yuzhang"], ["changsha", "wuling"], ["changsha", "lingling"], ["changsha", "guiyang"], ["changsha", "yuzhang"],
    ["lingling", "guiyang"], ["lingling", "cangwu"], ["guiyang", "nanhai"], ["guiyang", "cangwu"], ["jiujiang", "danyang"], ["jiujiang", "lujiang"],
    ["jiujiang", "guangling"], ["jiujiang", "xiapi"], ["danyang", "lujiang"], ["danyang", "kuaiji"], ["danyang", "wujun"], ["danyang", "guangling"],
    ["lujiang", "yuzhang"], ["kuaiji", "wujun"], ["wujun", "guangling"], ["donghai", "langya"], ["donghai", "pengcheng"], ["donghai", "xiapi"],
    ["langya", "qiguo"], ["langya", "beihai"], ["pengcheng", "xiapi"], ["guangling", "xiapi"], ["qiguo", "beihai"], ["qiguo", "jinan"],
    ["qiguo", "lean"], ["beihai", "donglai"], ["jinan", "lean"], ["jinan", "pingyuan"], ["nanhai", "cangwu"], ["cangwu", "yulin"],
    ["yulin", "hepu"], ["hepu", "jiaozhi"], ["jiaozhi", "jiuzhen"], ["jiuzhen", "rinan"],
  ];

  const proj = (pts) => pts.map(([la, lo]) => S.project(la, lo));
  S.MAPS["190"] = {
    cities,
    land: proj(land),
    islands: islands.map(proj),
    rivers: rivers.map(proj),
    roads,
  };
})(globalThis.SAM = globalThis.SAM || {});
