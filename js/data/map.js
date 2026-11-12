// The map: seventeen provinces and seventy-seven cities. Not every
// commandery of the Later Han is here: the list keeps the ones that mattered
// in the Three Kingdoms, about four to a province, so that no province is
// won with two cities (docs/city-plan.md). 요동, 남중, 형북 and 형남 are this
// game's own divisions.
//
// Names and provinces are given as of 220. Where a place was called
// something else, or belonged to another province, in an earlier or later
// year, `names` and `provs` below say so, and a scenario shows what was true
// in its own year.
//
// size (1-5) is a rough rank of registered population, raised a little where
// a city stands for neighbours that were left out.
// gentry (0-100) is this game's estimate of the local great families' hold.
(function (S) {
  S.MAPS = S.MAPS || {};

  S.PROVINCES = {
    sili: "사례", yu: "예주", yan: "연주", ji: "기주", you: "유주", liaodong: "요동", bing: "병주",
    xu: "서주", qing: "청주", yong: "옹주", liang: "량주", yi: "익주", nanzhong: "남중",
    jingbei: "형북", jingnan: "형남", yang: "양주", jiao: "교주",
  };

  // id: [name, province, seat, lat, lon, size, gentry]
  const cities = {
    // 사례
    henan:      ["낙양", "sili", "낙양", 34.68, 112.60, 4, 25],
    henei:      ["하내", "sili", "회", 35.15, 113.30, 4, 45],
    hedong:     ["하동", "sili", "안읍", 35.10, 111.25, 3, 45],
    hongnong:   ["홍농", "sili", "홍농", 34.62, 110.90, 2, 40],
    // 예주
    yingchuan:  ["허도", "yu", "허", 34.15, 113.50, 5, 65],
    runan:      ["여남", "yu", "평여", 33.00, 114.40, 5, 70],
    peiguo:     ["패국", "yu", "상", 33.85, 116.75, 3, 50],
    qiao:       ["초군", "yu", "초", 33.87, 115.77, 3, 55],
    // 연주
    chenliu:    ["진류", "yan", "진류", 34.65, 114.50, 4, 50],
    dongjun:    ["동군", "yan", "복양", 35.75, 115.00, 3, 45],
    shanyang:   ["산양", "yan", "창읍", 35.05, 116.10, 4, 55],
    taishan:    ["태산", "yan", "봉고", 36.20, 117.15, 4, 55],
    // 기주
    weijun:     ["업", "ji", "업", 36.30, 114.35, 4, 55],
    julu:       ["거록", "ji", "영도", 37.25, 114.85, 4, 50],
    changshan:  ["상산", "ji", "원씨", 37.95, 114.40, 4, 45],
    hejian:     ["하간", "ji", "낙성", 38.35, 116.10, 3, 50],
    bohai:      ["발해", "ji", "남피", 38.05, 116.75, 4, 55],
    pingyuan:   ["평원", "ji", "평원", 37.20, 116.40, 4, 45],
    // 유주
    zhuo:       ["탁군", "you", "탁", 39.45, 115.95, 3, 45],
    guangyang:  ["광양", "you", "계", 39.95, 116.45, 4, 40],
    daijun:     ["대군", "you", "고류", 40.05, 114.45, 2, 30],
    liaoxi:     ["요서", "you", "양락", 41.40, 120.90, 2, 30],
    // 요동
    liaodong:   ["요동", "liaodong", "양평", 41.25, 123.15, 3, 35],
    xuantu:     ["현도", "liaodong", "고구려", 41.90, 124.40, 1, 25],
    lelang:     ["낙랑", "liaodong", "조선", 39.00, 125.75, 2, 30],
    daifang:    ["대방", "liaodong", "대방", 38.50, 125.75, 1, 25],
    // 병주
    shangdang:  ["상당", "bing", "장자", 36.15, 113.00, 2, 40],
    taiyuan:    ["태원", "bing", "진양", 37.80, 112.50, 3, 55],
    yanmen:     ["안문", "bing", "음관", 39.15, 112.95, 2, 30],
    xihe:       ["서하", "bing", "이석", 37.50, 111.10, 1, 25],
    // 서주
    xiapi:      ["하비", "xu", "하비", 33.85, 118.25, 3, 55],
    pengcheng:  ["팽성", "xu", "팽성", 34.26, 117.18, 3, 45],
    guangling:  ["광릉", "xu", "광릉", 32.40, 119.42, 3, 55],
    donghai:    ["동해", "xu", "담", 34.75, 118.45, 4, 55],
    // 청주
    qiguo:      ["제국", "qing", "임치", 36.85, 118.30, 4, 50],
    beihai:     ["북해", "qing", "극", 36.70, 119.20, 4, 45],
    jinan:      ["제남", "qing", "동평릉", 36.80, 117.35, 3, 45],
    donglai:    ["동래", "qing", "황", 37.55, 120.45, 3, 40],
    // 옹주
    jingzhao:   ["장안", "yong", "장안", 34.28, 108.90, 4, 35],
    zuopingyi:  ["빙익", "yong", "고릉", 34.85, 109.70, 2, 35],
    youfufeng:  ["부풍", "yong", "괴리", 34.40, 107.80, 2, 40],
    hanyang:    ["천수", "yong", "기", 34.75, 105.50, 3, 45],
    longxi:     ["농서", "yong", "적도", 35.40, 103.90, 1, 40],
    // 량주
    wuwei:      ["무위", "liang", "고장", 37.93, 102.63, 2, 40],
    jincheng:   ["금성", "liang", "윤오", 36.25, 103.35, 1, 35],
    jiuquan:    ["주천", "liang", "녹복", 39.73, 98.50, 1, 35],
    zhangye:    ["장액", "liang", "득득", 38.93, 100.45, 1, 30],
    // 익주
    shujun:     ["성도", "yi", "성도", 30.66, 104.06, 5, 70],
    hanzhong:   ["한중", "yi", "남정", 33.10, 107.00, 3, 40],
    zitong:     ["자동", "yi", "자동", 31.63, 105.17, 2, 50],
    bajun:      ["파군", "yi", "강주", 29.56, 106.55, 4, 55],
    guanghan:   ["광한", "yi", "낙", 31.25, 104.50, 3, 60],
    badong:     ["파동", "yi", "어복", 31.05, 109.55, 2, 40],
    // 남중
    zangke:     ["장가", "nanzhong", "고란", 26.60, 106.70, 2, 50],
    yuexi:      ["월수", "nanzhong", "공도", 27.90, 102.25, 2, 40],
    yizhoujun:  ["익주군", "nanzhong", "전지", 24.90, 102.65, 2, 55],
    yongchang:  ["영창", "nanzhong", "불위", 25.10, 99.20, 2, 45],
    // 형북
    nanyang:    ["남양", "jingbei", "완", 33.00, 112.53, 5, 65],
    xiangyang:  ["양양", "jingbei", "양양", 32.01, 112.14, 4, 70],
    xincheng:   ["신성", "jingbei", "방릉", 32.06, 110.73, 1, 45],
    jiangxia:   ["강하", "jingbei", "안륙", 31.26, 113.68, 2, 50],
    // 형남
    nanjun:     ["강릉", "jingnan", "강릉", 30.35, 112.20, 4, 65],
    wuling:     ["무릉", "jingnan", "임원", 29.05, 111.70, 2, 40],
    lingling:   ["영릉", "jingnan", "천릉", 26.20, 111.60, 3, 45],
    changsha:   ["장사", "jingnan", "임상", 28.20, 112.95, 4, 50],
    guiyang:    ["계양", "jingnan", "침", 25.80, 113.00, 2, 40],
    wuchang:    ["무창", "jingnan", "악", 30.40, 114.88, 3, 45],
    // 양주
    jiujiang:   ["구강", "yang", "수춘", 32.55, 117.45, 3, 50],
    lujiang:    ["여강", "yang", "환", 31.15, 117.00, 3, 55],
    wujun:      ["오군", "yang", "오", 31.30, 120.60, 3, 80],
    kuaiji:     ["회계", "yang", "산음", 30.00, 120.58, 3, 75],
    danyang:    ["건업", "yang", "건업", 30.95, 118.75, 3, 55],
    yuzhang:    ["예장", "yang", "남창", 28.68, 115.90, 4, 50],
    // 교주
    nanhai:     ["남해", "jiao", "번우", 23.12, 113.28, 2, 35],
    cangwu:     ["창오", "jiao", "광신", 23.48, 111.30, 2, 35],
    jiaozhi:    ["교지", "jiao", "용편", 21.04, 106.00, 3, 45],
    rinan:      ["일남", "jiao", "서권", 16.80, 107.10, 1, 30],
  };

  // What a place was called from a given year on: [[year, name], ...],
  // earliest first. A place not listed kept one name throughout.
  const names = {
    yingchuan: [[0, "영천"], [196, "허도"], [221, "허창"]],
    zhuo:      [[0, "탁군"], [226, "범양"]],
    zuopingyi: [[0, "좌빙익"], [220, "빙익"]],
    youfufeng: [[0, "우부풍"], [220, "부풍"]],
    hanyang:   [[0, "한양"], [220, "천수"]],
    badong:    [[0, "어복"], [195, "고릉"], [201, "파동"]],
    xincheng:  [[0, "상용"], [220, "신성"]],
    wuchang:   [[0, "하구"], [214, "서릉"], [221, "무창"]],
    jiujiang:  [[0, "구강"], [197, "회남"], [199, "구강"], [221, "회남"]],
    danyang:   [[0, "단양"], [212, "건업"]],
  };
  // Which province a place belonged to from a given year on.
  // why: there was no 옹주 before 194, and the 옹주 of 194-213 was the far
  // side of the Yellow River (하서); 조조 folded 량주 into it in 213, and 조비
  // split them again in 220 with 옹주 as 관중 and 롱우. 평원 was 청주's under
  // the Han and 기주's under Wei.
  const provs = {
    jingzhao:  [[0, "sili"], [213, "yong"]],
    zuopingyi: [[0, "sili"], [213, "yong"]],
    youfufeng: [[0, "sili"], [213, "yong"]],
    hanyang:   [[0, "liang"], [213, "yong"]],
    longxi:    [[0, "liang"], [213, "yong"]],
    jincheng:  [[0, "liang"], [213, "yong"], [220, "liang"]],
    wuwei:     [[0, "liang"], [194, "yong"], [220, "liang"]],
    zhangye:   [[0, "liang"], [194, "yong"], [220, "liang"]],
    jiuquan:   [[0, "liang"], [194, "yong"], [220, "liang"]],
    pingyuan:  [[0, "qing"], [220, "ji"]],
  };
  const inYear = (list, year, fallback) => {
    let v = fallback;
    for (const [from, x] of list || []) if (year >= from) v = x;
    return v;
  };
  S.cityName = (id, year) => inYear(S.MAP.names[id], year, S.MAP.cities[id][0]);
  S.cityProv = (id, year) => inYear(S.MAP.provs[id], year, S.MAP.cities[id][1]);

  // Map projection. The far west and the far south are squeezed so the
  // contested heartland gets most of the space. Used for the drawn outline;
  // a map with a terrain picture is warped to fit the picture instead.
  S.MAP_SIZE = { w: 2060, h: 1840 };
  S.projectPlain = function (lat, lon) {
    const lo = lon >= 103 ? lon : 103 - (103 - lon) * 0.45;
    const la = lat >= 25 ? lat : 25 - (25 - lat) * 0.5;
    return [Math.round((lo - 98.5) * 72 + 40), Math.round((42.8 - la) * 80 + 40)];
  };
  S.project = function (lat, lon) {
    const t = S.MAP && S.MAP.terrain;
    if (!t) return S.projectPlain(lat, lon);
    if (!t.warp) t.warp = S.makeWarp(t.anchors);
    const [x, y] = t.warp(lat, lon);
    const sp = t.spread;
    const d = sp ? Math.hypot(x - sp.x, y - sp.y) : Infinity;
    if (d >= (sp ? sp.r : 0)) return [x, y];
    const f = 1 + (sp.k - 1) * (1 - d / sp.r);
    return [Math.round(sp.x + (x - sp.x) * f), Math.round(sp.y + (y - sp.y) * f)];
  };
  // Where a city or stronghold is drawn: set by hand, or projected.
  S.placeXY = (id, lat, lon) => (S.MAP && S.MAP.terrain && S.MAP.terrain.pos[id]) || S.project(lat, lon);

  // A thin-plate spline through anchor points, from (lat, lon) to picture
  // pixels. A little smoothing keeps a misplaced anchor from twisting the map.
  S.makeWarp = function (anchors, smooth = 0.3) {
    const pts = anchors.map((a) => [a[3], a[2]]);
    const n = pts.length;
    const U = (r2) => (r2 > 0 ? r2 * Math.log(r2) : 0);
    const solve = (M, b) => {
      const m = M.map((row, i) => [...row, b[i]]);
      for (let c = 0; c < m.length; c++) {
        let p = c;
        for (let r = c + 1; r < m.length; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
        [m[c], m[p]] = [m[p], m[c]];
        for (let r = 0; r < m.length; r++) {
          if (r === c) continue;
          const f = m[r][c] / m[c][c];
          for (let k = c; k <= m.length; k++) m[r][k] -= f * m[c][k];
        }
      }
      return m.map((row, i) => row[m.length] / row[i]);
    };
    const M = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
        row.push(U(dx * dx + dy * dy) + (i === j ? smooth : 0));
      }
      M.push([...row, 1, pts[i][0], pts[i][1]]);
    }
    for (let k = 0; k < 3; k++) M.push([...pts.map((p) => (k === 0 ? 1 : p[k - 1])), 0, 0, 0]);
    const wx = solve(M, [...anchors.map((a) => a[0]), 0, 0, 0]);
    const wy = solve(M, [...anchors.map((a) => a[1]), 0, 0, 0]);
    const at = (w, u, v) => {
      let s = w[n] + w[n + 1] * u + w[n + 2] * v;
      for (let i = 0; i < n; i++) { const dx = u - pts[i][0], dy = v - pts[i][1]; s += w[i] * U(dx * dx + dy * dy); }
      return s;
    };
    return (lat, lon) => [Math.round(at(wx, lon, lat)), Math.round(at(wy, lon, lat))];
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

  // Roads between neighbouring cities, including the main passes and river
  // routes. A road may stand for the way through a commandery that is not on
  // the map (하간-거록 runs through 안평, 광양-요서 through 어양 and 우북평).
  const roads = [
    // 사례, 옹주
    ["henan", "henei"], ["henan", "hedong"], ["henan", "hongnong"], ["henan", "chenliu"],
    ["henei", "weijun"], ["henei", "shangdang"],
    ["hedong", "hongnong"], ["hedong", "shangdang"], ["hedong", "xihe"], ["hedong", "taiyuan"], ["hedong", "zuopingyi"],
    ["hongnong", "zuopingyi"], ["hongnong", "nanyang"], ["hongnong", "jingzhao"],
    ["jingzhao", "youfufeng"], ["jingzhao", "zuopingyi"],
    ["youfufeng", "hanyang"], ["youfufeng", "hanzhong"],
    // 량주
    ["longxi", "hanyang"], ["longxi", "jincheng"], ["hanyang", "jincheng"], ["hanyang", "wuwei"],
    ["jincheng", "wuwei"], ["wuwei", "zhangye"], ["zhangye", "jiuquan"],
    ["hanyang", "hanzhong"], // 기산도, 양평관
    ["longxi", "guanghan"], // 음평도
    // 병주
    ["shangdang", "taiyuan"], ["taiyuan", "xihe"], ["taiyuan", "yanmen"], ["weijun", "shangdang"],
    ["changshan", "taiyuan"], // 정형
    ["daijun", "yanmen"],
    // 유주, 요동
    ["zhuo", "guangyang"], ["zhuo", "daijun"], ["guangyang", "daijun"],
    ["guangyang", "liaoxi"], // 노룡새
    ["liaoxi", "liaodong"], ["liaoxi", "xuantu"], ["liaodong", "xuantu"], ["liaodong", "lelang"], ["lelang", "daifang"],
    // 기주
    ["weijun", "julu"], ["weijun", "dongjun"], ["weijun", "pingyuan"],
    ["julu", "changshan"], ["julu", "hejian"], ["julu", "pingyuan"],
    ["changshan", "hejian"], ["changshan", "zhuo"], ["hejian", "zhuo"], ["hejian", "bohai"],
    ["bohai", "pingyuan"], ["dongjun", "pingyuan"],
    // 연주, 예주
    ["chenliu", "dongjun"], ["chenliu", "shanyang"], ["chenliu", "yingchuan"], ["chenliu", "qiao"],
    ["dongjun", "shanyang"], ["dongjun", "taishan"], ["shanyang", "taishan"], ["shanyang", "peiguo"], ["shanyang", "pengcheng"],
    ["yingchuan", "runan"], ["yingchuan", "nanyang"], ["yingchuan", "qiao"],
    ["runan", "qiao"], ["runan", "nanyang"], ["runan", "jiangxia"], ["runan", "jiujiang"],
    ["qiao", "peiguo"], ["peiguo", "pengcheng"], ["peiguo", "jiujiang"],
    // 서주, 청주
    ["pengcheng", "xiapi"], ["pengcheng", "donghai"], ["donghai", "xiapi"], ["donghai", "guangling"], ["donghai", "beihai"],
    ["xiapi", "guangling"], ["xiapi", "jiujiang"], ["guangling", "jiujiang"],
    ["taishan", "jinan"], ["jinan", "pingyuan"], ["jinan", "qiguo"], ["qiguo", "beihai"], ["qiguo", "bohai"], ["beihai", "donglai"],
    // 바닷길
    ["donglai", "liaodong"], ["donglai", "daifang"], ["donglai", "wujun"],
    // 형북, 형남
    ["nanyang", "xiangyang"], ["xiangyang", "nanjun"], ["xiangyang", "xincheng"], ["xiangyang", "jiangxia"],
    ["xincheng", "hanzhong"], ["jiangxia", "wuchang"],
    ["nanjun", "wuchang"], ["nanjun", "wuling"], ["nanjun", "changsha"], ["nanjun", "badong"],
    ["wuchang", "changsha"], ["wuchang", "lujiang"], ["wuchang", "yuzhang"],
    ["changsha", "wuling"], ["changsha", "lingling"], ["changsha", "guiyang"], ["changsha", "yuzhang"],
    ["wuling", "lingling"], ["lingling", "guiyang"], ["lingling", "cangwu"], ["guiyang", "nanhai"], ["guiyang", "cangwu"],
    // 양주
    ["jiujiang", "danyang"], ["jiujiang", "lujiang"], ["danyang", "lujiang"], ["danyang", "wujun"], ["danyang", "guangling"],
    ["lujiang", "yuzhang"], ["kuaiji", "wujun"], ["wujun", "guangling"],
    // 익주, 남중
    ["hanzhong", "zitong"], // 금우도: 가맹관, 검각
    ["zitong", "guanghan"], ["guanghan", "shujun"], ["bajun", "guanghan"], ["bajun", "shujun"], ["bajun", "badong"],
    ["bajun", "zangke"], ["shujun", "yuexi"], ["yuexi", "yizhoujun"], ["yuexi", "zangke"], ["zangke", "yizhoujun"],
    ["yizhoujun", "yongchang"], ["yizhoujun", "jiaozhi"], ["zangke", "cangwu"],
    // 교주
    ["nanhai", "cangwu"], ["cangwu", "jiaozhi"], ["jiaozhi", "rinan"],
    // Roads that end at a stronghold: the stronghold guards them as well.
    ["zuopingyi", "tongguan"], ["yingchuan", "hulao"], ["bajun", "jiameng"], ["danyang", "hefei"],
  ];

  // The painted terrain map (assets/map/terrain.jpg, 2048 x 2048). It is a
  // picture, not a survey, so places are fitted to it: these anchors tie
  // landmarks on the picture to their real latitude and longitude, and a
  // smooth warp through them places everything else. [x, y, lat, lon]
  const terrain = {
    image: "assets/map/terrain.jpg", w: 2048, h: 2048,
    anchors: [
      [1090, 180, 40.2, 111.2], // 황하 하투의 북동쪽 굽이
      [860, 140, 40.3, 107.0], // 하투의 북서쪽 굽이
      [1022, 628, 34.6, 110.3], // 동관, 위수가 황하에 드는 곳
      [1528, 388, 37.7, 118.9], // 황하 하구
      [1406, 500, 36.75, 117.0], // 황하 하류, 제남 북쪽
      [1290, 598, 35.75, 115.0], // 황하가 북동으로 꺾이는 곳 (복양 부근)
      [1150, 612, 34.9, 113.2], // 황하, 호로관 북쪽
      [1418, 215, 39.1, 117.7], // 발해 서쪽 해안
      [1805, 410, 37.4, 122.7], // 산동반도 끝
      [1840, 895, 31.4, 121.8], // 장강 하구
      [1690, 930, 31.2, 120.2], // 태호
      [1555, 760, 33.3, 118.7], // 홍택호
      [1300, 1010, 30.58, 114.28], // 한수가 장강에 드는 곳
      [1190, 1150, 29.3, 112.9], // 동정호
      [1450, 1130, 29.1, 116.3], // 파양호
      [740, 1090, 29.56, 106.55], // 가릉강이 장강에 드는 곳 (강주)
      [580, 980, 30.66, 104.06], // 성도 평원
      [780, 775, 33.07, 107.03], // 한중 분지
      [1385, 1585, 23.13, 113.26], // 주강 삼각주 머리 (번우)
      [1060, 1890, 19.2, 109.7], // 해남도
      [1080, 1790, 20.3, 110.2], // 뇌주반도 끝
      [1860, 1580, 23.7, 121.0], // 대만
      [660, 1800, 21.03, 105.85], // 홍하 삼각주
      [578, 500, 36.06, 103.83], // 금성 부근의 황하
    ],
    // The picture packs the north China plain tightly; spread places out
    // from its middle, most at the centre and not at all at the rim.
    spread: { x: 1300, y: 520, r: 380, k: 1.2 },
    // Where every city and stronghold is drawn, set by hand with tools/map-editor.html.
    // A place missing here falls back to the warp above.
    pos: {
      henan: [1136, 624], henei: [1200, 592], hedong: [1048, 590], hongnong: [1065, 638],
      yingchuan: [1244, 709], runan: [1290, 804], peiguo: [1442, 725], qiao: [1363, 727],
      chenliu: [1289, 652], dongjun: [1324, 570], shanyang: [1403, 619], taishan: [1442, 538],
      weijun: [1275, 504], julu: [1277, 425], changshan: [1227, 359], hejian: [1330, 350],
      bohai: [1412, 356], pingyuan: [1392, 439], zhuo: [1305, 264], guangyang: [1385, 240],
      daijun: [1240, 188], liaoxi: [1548, 187], liaodong: [1804, 126], xuantu: [1780, 63],
      lelang: [1993, 272], daifang: [1975, 342], shangdang: [1156, 509], taiyuan: [1125, 377],
      yanmen: [1160, 254], xihe: [1026, 443], xiapi: [1527, 718], pengcheng: [1484, 630],
      guangling: [1634, 747], donghai: [1581, 625], qiguo: [1518, 431], beihai: [1589, 452],
      jinan: [1446, 480], donglai: [1712, 406], jingzhao: [914, 676], zuopingyi: [978, 611],
      youfufeng: [853, 647], hanyang: [734, 582], longxi: [643, 572], wuwei: [596, 354],
      jincheng: [588, 476], jiuquan: [230, 172], zhangye: [366, 243], shujun: [546, 999],
      hanzhong: [792, 776], zitong: [652, 905], bajun: [740, 1090], guanghan: [618, 932],
      badong: [948, 968], zangke: [742, 1343], yuexi: [425, 1224], yizhoujun: [423, 1489],
      yongchang: [177, 1471], nanyang: [1130, 789], xiangyang: [1154, 911], xincheng: [989, 874],
      jiangxia: [1289, 919], nanjun: [1196, 1050], wuling: [1128, 1160], lingling: [1145, 1342],
      changsha: [1237, 1223], guiyang: [1260, 1387], wuchang: [1319, 1024], jiujiang: [1466, 823],
      lujiang: [1470, 983], wujun: [1725, 914], kuaiji: [1798, 980], danyang: [1601, 873],
      yuzhang: [1429, 1160], nanhai: [1418, 1610], cangwu: [1161, 1568], jiaozhi: [712, 1813],
      rinan: [774, 1997], hulao: [1175, 630], hangu: [1101, 627], tongguan: [1021, 642],
      chencang: [844, 675], yangping: [711, 761], jiameng: [703, 833], jiange: [673, 868],
      yiling: [1115, 1015], yijing: [1317, 306], hefei: [1475, 883],
    },
  };

  const proj = (pts) => pts.map(([la, lo]) => S.project(la, lo));
  S.MAPS["main"] = {
    cities,
    names,
    provs,
    land: proj(land),
    islands: islands.map(proj),
    rivers: rivers.map(proj),
    roads,
    terrain,
  };
})(globalThis.SAM = globalThis.SAM || {});
