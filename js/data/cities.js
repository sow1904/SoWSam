// City list and road network. Names and geography follow the historical
// record; positions are a schematic layout on a 1000x720 map.
(function (S) {
  // id: [name, x, y, size(1-5), gentry(0-100)]
  // gentry: strength of the local great families. High in Jiangdong, Jing and
  // Yi provinces and around the old Yingchuan/Runan clans; low where the land
  // was devastated (Luoyang) or held by frontier warlords.
  S.CITY_DEFS = {
    wuwei:     ["무위", 70, 150, 2, 35],
    tianshui:  ["천수", 165, 255, 3, 45],
    anding:    ["안정", 250, 195, 2, 35],
    changan:   ["장안", 335, 285, 5, 40],
    hanzhong:  ["한중", 265, 385, 3, 40],
    chengdu:   ["성도", 150, 515, 5, 70],
    jiangzhou: ["강주", 270, 560, 3, 55],
    jinyang:   ["진양", 445, 135, 3, 40],
    luoyang:   ["낙양", 455, 290, 5, 25],
    wan:       ["완", 470, 390, 4, 55],
    xuchang:   ["허창", 565, 335, 3, 60],
    chenliu:   ["진류", 610, 285, 3, 45],
    ye:        ["업", 570, 195, 4, 60],
    nanpi:     ["남피", 665, 135, 3, 55],
    ji:        ["계", 640, 55, 3, 40],
    beiping:   ["북평", 770, 55, 2, 35],
    pingyuan:  ["평원", 690, 200, 2, 40],
    puyang:    ["복양", 640, 245, 3, 45],
    beihai:    ["북해", 810, 215, 3, 45],
    xiaopei:   ["소패", 720, 320, 2, 40],
    xiapi:     ["하비", 800, 330, 4, 55],
    runan:     ["여남", 605, 395, 3, 65],
    shouchun:  ["수춘", 705, 405, 4, 50],
    xiangyang: ["양양", 470, 455, 4, 70],
    jiangling: ["강릉", 430, 525, 4, 60],
    jiangxia:  ["강하", 565, 500, 3, 55],
    changsha:  ["장사", 520, 605, 3, 50],
    wuling:    ["무릉", 410, 610, 2, 40],
    lujiang:   ["여강", 680, 470, 2, 55],
    jianye:    ["건업", 795, 445, 4, 70],
    wu:        ["오", 870, 480, 3, 80],
    kuaiji:    ["회계", 860, 570, 3, 75],
  };

  S.ROADS = [
    ["wuwei", "tianshui"], ["wuwei", "anding"], ["tianshui", "anding"],
    ["tianshui", "changan"], ["tianshui", "hanzhong"], ["anding", "changan"],
    ["changan", "hanzhong"], ["changan", "luoyang"], ["changan", "jinyang"],
    ["hanzhong", "chengdu"], ["chengdu", "jiangzhou"], ["jiangzhou", "jiangling"],
    ["jiangzhou", "wuling"], ["jinyang", "ye"], ["jinyang", "luoyang"],
    ["luoyang", "wan"], ["luoyang", "xuchang"], ["luoyang", "ye"],
    ["ye", "nanpi"], ["ye", "pingyuan"], ["ye", "puyang"],
    ["nanpi", "ji"], ["nanpi", "pingyuan"], ["ji", "beiping"],
    ["pingyuan", "beihai"], ["pingyuan", "puyang"], ["puyang", "chenliu"],
    ["chenliu", "xuchang"], ["chenliu", "xiaopei"], ["beihai", "xiapi"],
    ["xiaopei", "xiapi"], ["xiaopei", "shouchun"], ["xiapi", "jianye"],
    ["xiapi", "shouchun"], ["xuchang", "runan"], ["xuchang", "wan"],
    ["wan", "xiangyang"], ["wan", "runan"], ["runan", "shouchun"],
    ["runan", "jiangxia"], ["shouchun", "lujiang"], ["shouchun", "jianye"],
    ["xiangyang", "jiangling"], ["xiangyang", "jiangxia"], ["jiangling", "jiangxia"],
    ["jiangling", "wuling"], ["jiangling", "changsha"], ["wuling", "changsha"],
    ["changsha", "jiangxia"], ["jiangxia", "lujiang"], ["lujiang", "jianye"],
    ["jianye", "wu"], ["wu", "kuaiji"],
  ];

  // Decorative river polylines (Yellow River, Han, Yangtze).
  S.RIVERS = [
    [[120, 200], [230, 150], [330, 110], [400, 70], [420, 160], [400, 250], [470, 255], [560, 240], [640, 210], [730, 170], [830, 160]],
    [[200, 400], [300, 410], [400, 430], [470, 440], [520, 480], [565, 490]],
    [[110, 560], [210, 580], [330, 540], [430, 555], [520, 540], [600, 490], [680, 500], [760, 470], [830, 450], [900, 440]],
  ];
})(globalThis.SAM = globalThis.SAM || {});
