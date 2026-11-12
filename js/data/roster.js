// More people: one line each, with everything about them in one place.
//
//   이름 born died  무력 용병 군략 언변 모략 지략 정치  한조  home  [marks]
//
// born and died are as in data/people.js (~ an estimate, x a violent death).
// home is the city they come from or were living in around 190; a scenario
// places them there unless it says otherwise.
// Marks, in any order: 연 (a figure of 삼국지연의 or of legend, not of the
// histories), 여 (a woman), personality traits and specialties.
//
// Ratings are this game's own, from the histories (정사 and 배송지 주석) and,
// for those marked 연, from the novel. The scale: 95 and up for the handful
// who defined the age, 85-94 outstanding, 70-84 able, 50-69 ordinary, below
// 50 weak. Women with little on record are set a little under the middle;
// those the histories praise for something are rated for it.
//
// Two people may share a name in Hangul. The less famous one then carries
// the hanja: 유선 is 劉禪, 유선(劉先) the man of 형주.
(function (S) {
  const LINES = `
  # ----- 조조와 위 -----
  모개 ~155 216  25 40 70 72 50 80 88 U chenliu 의리
  최염 ~163 216x  55 50 60 80 45 80 86 H pingyuan 의리
  동소 156 236  25 45 82 85 88 86 82 U shanyang
  유엽 ~170 234  30 50 90 80 86 92 78 U jiujiang
  장제(蔣濟) ~188 249  35 66 86 80 78 88 84 U jiujiang
  임준 ~160 204  30 55 60 60 45 72 90 U henan
  조지 ~150 ~196  30 50 62 55 45 72 88 U yingchuan
  두기 ~163 224  45 62 68 72 55 78 92 U jingzhao
  정혼 ~165 ~230  25 35 55 62 45 72 88 U henan
  양습 ~165 230  50 70 72 66 55 74 88 U qiao
  장기 ~165 223  40 68 80 82 72 82 90 U zuopingyi
  소칙 ~170 223  66 72 72 70 55 74 84 H youfufeng
  유복 ~160 208  40 66 70 70 50 76 92 U peiguo
  온회 178 223  35 55 70 72 55 78 86 U taiyuan
  여건 ~165 ~225  72 76 68 50 50 62 72 U shanyang
  이통 168 209  80 78 62 45 40 55 55 U jiangxia 의리
  조엄 171 245  35 70 78 82 66 82 86 U yingchuan
  두습 ~170 ~230  40 62 72 80 60 80 82 U yingchuan
  서혁 ~165 219  25 40 58 70 45 76 84 U donghai
  하기 ~160 ~221  35 50 62 70 50 76 84 U qiao
  형옹 ~165 223  25 35 58 76 45 78 82 H hejian
  화흡 ~165 ~230  20 30 60 76 50 80 82 U runan
  한기 159 238  25 40 62 66 50 80 88 U nanyang
  위기 ~155 229  20 30 62 76 50 82 86 H hedong
  배잠 ~170 244  35 62 74 76 60 80 86 U hedong
  유방 ~180 250  25 35 70 80 76 80 82 U zhuo
  손자 ~180 251  25 40 74 80 76 82 82 U taiyuan
  고당륭 ~170 237  30 30 55 80 40 84 78 H taishan
  고유 174 263  30 45 62 76 55 82 86 U chenliu
  사마지 ~170 ~235  30 40 58 70 45 78 86 U henei
  왕찬 177 217  15 15 45 90 50 88 74 U shanyang
  완우 ~165 212  12 12 40 88 45 80 66 U chenliu
  양수 175 219x  20 20 60 90 66 92 74 U hongnong
  정의 ~180 220x  20 20 50 84 72 80 68 U peiguo
  누규 ~155 ~212x  45 66 84 70 80 82 62 N nanyang
  미형 173 198x  15 10 30 92 30 86 40 N pingyuan
  병원 ~158 ~217  30 25 45 80 35 84 76 H liaodong
  국연 ~165 ~215  25 40 60 72 50 78 88 U liaodong
  양무 ~160 ~220  25 35 55 74 45 78 84 U shanyang
  왕관 ~170 260  25 35 55 72 45 76 84 U dongjun
  원환 ~160 ~219  25 35 55 82 45 80 84 H qiao
  장범 ~160 212  20 20 45 74 35 78 74 H henei 무욕
  유이 180 221  20 25 58 80 50 82 78 U nanyang
  환계 ~165 ~222  25 35 62 80 62 78 82 U changsha
  포훈 ~170 226x  30 35 50 78 40 76 80 H taishan 의리
  진교 ~170 237  30 50 66 82 60 80 86 U guangling
  서선 ~170 236  35 50 60 74 50 76 82 U guangling
  왕필 ~155 218  55 55 50 50 45 55 58 U chenliu 의리
  왕숙 195 256  15 20 50 86 50 88 80 U donghai
  노육 183 257  20 30 55 80 45 84 86 H zhuo
  환범 ~180 249x  30 45 84 76 80 86 70 U peiguo
  하안 ~195 249x  15 15 40 90 66 84 60 N nanyang
  등양 ~195 249x  20 25 45 78 70 66 50 N nanyang 야심
  정밀 ~195 249x  25 30 50 66 78 70 50 N peiguo 야심
  이승 ~195 249x  30 40 50 72 62 66 60 N nanyang
  위풍 ~185 219x  40 40 55 88 76 70 50 N peiguo 야심
  마균 ~200 ~265  15 20 50 30 40 90 62 N youfufeng
  조앙 ~177 197x  66 66 58 62 45 62 62 U qiao 의리
  조안민 ~175 197x  60 55 45 40 40 45 45 U qiao
  조충 196 208  15 20 60 80 55 94 76 U qiao
  조예 205 239  55 70 82 80 76 84 78 N qiao
  조우 ~200 ~278  45 50 55 60 45 62 66 U qiao 무욕
  조상 ~200 249x  55 50 40 55 45 45 50 N qiao 야심
  조희 ~205 249x  50 50 62 62 55 70 62 U qiao
  하후상 ~185 226  76 84 82 62 70 74 66 U qiao
  하후무 ~190 ~235  45 40 30 50 35 40 50 U qiao
  하후위 ~200 ~250  72 74 66 55 55 62 60 U qiao
  하후혜 ~205 ~241  30 40 66 82 60 80 76 U qiao
  하후화 ~210 ~265  40 55 70 80 66 78 78 U qiao
  하후현 209 254x  35 62 78 88 60 86 82 U qiao
  주령 ~160 ~228  78 82 70 45 50 60 50 U pingyuan
  노초 ~160 ~215  66 66 50 35 36 42 40 U chenliu
  채양 ~155 201x  70 62 45 30 30 38 35 U qiao
  차주 ~155 199x  62 60 50 45 45 50 55 U xiapi
  유연 ~160 ~210  60 66 55 45 40 52 58 U dongjun
  왕충 ~160 ~240  66 62 45 30 30 40 40 N youfufeng
  오돈 ~160 ~225  70 66 50 30 35 42 38 N taishan
  윤례 ~160 222x  70 66 50 30 35 42 38 N taishan
  창희 ~160 206x  74 70 52 30 45 44 30 N donghai 변심
  손례 ~185 250  82 82 72 55 50 68 74 U zhuo 의리
  왕쌍 ~185 228x  86 70 40 20 20 30 20 U longxi 과감
  비요 ~180 ~235  68 76 68 45 50 60 55 U youfufeng
  대릉 ~185 ~240  66 68 55 40 40 50 48 U henan
  견초 ~165 ~231  76 84 76 70 60 72 74 U julu 의리
  악침 ~195 257x  70 72 55 40 40 50 50 U dongjun
  장호 ~195 ~250  74 70 55 40 40 50 45 U yanmen
  허의 ~200 263x  74 62 40 25 25 35 30 U qiao
  전만 ~185 ~240  70 60 40 25 25 35 35 U chenliu
  진랑 ~200 ~238  62 66 50 45 40 50 45 N yanmen
  진태 ~200 260  66 86 88 70 70 84 80 U yingchuan 신중
  왕창 ~195 259  55 82 86 74 70 84 84 U taiyuan
  왕릉 172 251x  66 80 76 70 66 74 80 U taiyuan
  영호우 ~190 249  50 60 70 70 76 72 66 U taiyuan 야심
  관구검 ~195 255x  72 84 80 72 62 76 76 U hedong
  문흠 ~195 257x  84 74 50 35 40 45 30 N qiao 과감 변심
  문앙 238 291x  96 82 55 35 35 50 35 N qiao 과감 야전
  제갈탄 ~195 258x  66 78 70 76 60 72 78 U donghai 야심
  호준 ~195 256  70 80 72 55 55 66 62 U youfufeng
  호질 ~180 250  50 74 76 72 62 78 86 U jiujiang
  석포 ~205 273  72 84 78 62 62 74 78 N bohai
  주태(州泰) ~195 261  66 82 80 55 60 74 70 U nanyang
  등충 ~225 264x  80 70 50 35 35 45 35 N nanyang
  사찬 ~215 264x  66 62 55 40 45 50 45 N nanyang
  종육 ~210 263  30 50 70 82 62 82 82 U yingchuan
  제갈서 ~200 ~270  55 62 55 55 45 58 62 U donghai
  호열 ~220 270x  74 76 66 45 50 60 55 U youfufeng
  호분 ~215 288  76 80 70 50 50 64 62 U youfufeng
  견홍 ~215 271x  76 74 55 40 40 50 50 U julu
  왕경 ~205 260x  45 55 60 66 50 68 74 H pingyuan 의리
  가충 217 282  40 66 80 78 88 82 84 N hedong 야심
  사마사 208 255  66 86 90 78 88 88 86 N henei 야심 신중
  사마소 211 265  62 82 88 80 86 86 88 N henei 야심
  사마염 236 290  60 66 74 80 70 76 80 N henei
  사마망 205 271  62 76 74 62 55 72 74 U henei
  양호 221 278  62 88 92 86 72 90 90 U taishan 의리 신중
  두예 222 285  30 86 95 80 80 94 90 U jingzhao
  왕준 206 286  66 86 84 66 66 80 78 U hongnong 수전
  위관 220 291x  35 62 78 78 84 84 82 U hedong
  배수 224 271  20 35 66 80 55 88 88 U hedong
  순의 ~205 274  20 30 55 78 55 78 78 U yingchuan
  장특 ~200 ~260  66 78 72 50 76 68 55 U zhuo 수성
  전속 ~215 ~270  66 62 50 35 45 48 40 N guangyang
  방회 ~205 ~270  78 72 55 40 40 50 45 U hanyang
  성공영 ~165 ~222  60 66 80 70 72 78 62 N jincheng 의리
  양부 ~170 ~235  60 76 84 80 76 84 80 H hanyang 의리
  강서 ~165 ~225  70 72 62 50 50 60 55 H hanyang
  윤봉 ~170 ~230  60 62 58 55 50 62 68 H hanyang
  조앙(趙昂) ~165 ~220  62 70 62 55 50 62 66 H hanyang
  위강 ~160 212x  30 45 50 70 40 72 80 H jingzhao
  곽원 ~160 202x  76 70 50 30 35 40 30 N yingchuan

  # ----- 조정과 동탁, 여포 -----
  노식 139 192  62 86 84 80 60 88 82 H zhuo 의리
  양표 142 225  20 30 50 80 50 82 82 H hongnong 의리
  사손서 129 195x  30 40 66 76 76 80 80 H youfufeng
  황완 141 192x  25 35 55 78 50 80 80 H jiangxia
  정태 ~151 ~192  30 40 72 86 72 80 72 H henan
  마일제 ~130 194  20 25 45 76 40 82 76 H youfufeng
  동승 ~155 200x  66 62 50 55 62 55 55 H hejian
  복완 ~150 209  35 40 45 60 45 62 66 H donghai
  종집 ~160 200x  55 50 50 55 60 55 50 H henan
  오자란 ~160 200x  60 55 45 45 50 50 45 H henan
  왕자복 ~160 200x  58 55 48 50 52 52 48 H henan
  금상 ~150 ~197x  25 30 45 70 40 70 68 H jingzhao 의리
  양정 ~150 ~196  66 62 45 30 35 40 30 N wuwei
  이몽 ~155 ~195x  66 60 42 25 30 35 25 N wuwei
  왕방 ~155 ~195x  66 60 42 25 30 35 25 N wuwei
  호차아 ~160 ~200  80 60 40 25 45 40 20 N wuwei
  성렴 ~160 195x  76 68 45 25 25 35 28 N xihe
  위속 ~160 ~199  70 62 45 30 40 40 30 N yanmen 변심
  송헌 ~160 200x  70 62 45 30 40 40 30 N yanmen 변심
  후성 ~160 ~200  72 64 46 30 40 40 30 N yanmen 변심
  조성 ~160 ~198  74 62 42 25 30 36 26 N xihe
  학맹 ~160 196x  72 62 45 28 45 40 28 N henei 변심
  허사 ~160 ~200  30 35 55 76 70 62 55 N chenliu
  왕해 ~160 ~200  30 35 55 74 68 62 55 N chenliu

  # ----- 원소, 공손찬, 하북 -----
  순우경 ~150 200x  70 70 50 40 35 45 40 U yingchuan
  초촉 ~160 ~207x  72 66 50 30 50 42 30 U guangyang 변심
  마연 ~160 ~208x  66 62 48 30 35 40 35 U weijun
  장의 ~160 ~208  66 62 48 30 35 40 35 U weijun
  한맹 ~160 ~205  78 64 40 25 25 32 25 U weijun 과감
  여광 ~160 ~215  70 62 45 30 35 40 35 U weijun
  여상 ~160 ~215  68 62 45 30 35 40 35 U weijun
  이부 ~165 ~225  45 50 76 82 80 78 70 U julu
  관통 ~160 ~205  45 55 55 55 45 60 62 U qiguo 의리
  저곡 ~175 ~205x  55 60 62 50 50 60 55 U julu
  왕문 ~160 ~200  66 64 48 30 40 40 30 N zhuo 변심
  공손월 ~160 192x  68 64 48 35 35 42 38 N liaoxi
  왕광 ~150 ~192x  55 60 50 55 45 55 60 H henei
  원유 ~150 ~192x  30 40 55 76 45 80 72 H runan
  수고 ~155 199x  70 64 45 28 40 40 28 N henei
  우독 ~155 193x  72 66 48 28 35 40 25 N changshan
  호재 ~155 ~196x  66 60 42 25 30 35 28 N hedong
  이락 ~155 ~197  66 60 42 25 30 35 28 N hedong
  백요 ~155 ~195  68 60 42 25 30 36 25 N shangdang
  곽온 ~150 ~205  45 55 55 55 45 60 66 H yanmen
  사마구 ~160 206x  70 62 42 25 30 36 25 N qiguo
  서화 ~160 207x  70 62 42 25 30 36 25 N jinan
  박호 ~160 ~220  66 60 40 30 30 38 35 N badong
  신탐 ~165 ~230  62 64 50 45 50 50 52 N xincheng 변심
  신의 ~170 ~235  60 62 50 45 55 50 50 N xincheng 변심
  어부라 ~150 195  78 74 50 35 40 44 40 N xihe
  호주천 ~155 ~215  72 70 50 40 40 46 45 N xihe
  거비 ~155 ~220  70 66 50 45 40 48 46 N xihe
  답돈 ~160 207x  86 80 55 40 45 50 45 N liaoxi 과감
  소복연 ~160 207x  72 68 45 35 35 42 38 N liaoxi
  누반 ~180 207x  66 60 40 30 30 38 35 N liaoxi
  오연 ~160 207x  70 66 45 32 35 40 36 N liaoxi
  가비능 ~170 235x  84 84 70 55 62 66 62 N daijun 야심
  보도근 ~170 233x  74 72 55 45 45 52 50 N daijun
  정현 127 200  10 10 30 78 20 96 62 H beihai 무욕
  관해 ~155 ~193x  84 68 45 25 25 34 20 N beihai 과감
  손건 ~165 ~214  25 30 60 88 55 76 74 H beihai
  시의 ~165 ~245  20 30 55 76 45 78 84 H beihai 무욕

  # ----- 요동 -----
  공손연 ~195 238x  72 70 58 55 62 55 50 N liaodong 야심 변심
  공손황 ~190 238x  40 45 60 62 50 66 60 U liaodong
  비연 ~190 238x  76 70 50 30 35 42 35 N liaodong
  양조 ~190 ~240  72 68 50 32 35 42 36 N liaodong
  한충 ~160 ~215  50 55 55 70 50 58 58 N liaodong
  윤직 ~185 237x  30 35 60 70 45 72 66 N liaodong 의리
  가범 ~185 237x  30 35 60 68 45 70 64 N liaodong 의리
  공손모 ~175 ~230  62 66 55 45 45 52 55 N lelang
  장창 ~175 ~230  60 64 52 45 45 50 55 N daifang

  # ----- 서주, 예주, 원술 -----
  허탐 ~160 ~200  62 58 45 30 40 40 35 N danyang
  장개 ~155 ~195  66 55 40 25 55 38 20 N xiapi 변심
  악취 ~160 197x  68 62 45 28 30 38 30 N runan
  양강 ~160 197x  66 60 44 28 30 38 30 N runan
  한윤 ~160 197x  20 25 45 70 50 55 55 N runan
  원요 ~180 ~230  30 35 45 55 40 55 58 N runan
  장형 ~160 ~199  15 15 40 62 55 60 50 N jiujiang
  이업 ~160 ~199  20 25 45 62 50 55 52 N jiujiang
  서구 ~140 ~205  30 45 55 70 45 74 76 H guangling 의리
  허소 ~150 195  12 12 40 86 45 90 62 H runan
  허정 ~150 222  15 15 40 86 40 82 72 H runan
  유벽 ~155 ~201x  70 66 50 35 40 44 35 N runan
  공도 ~160 ~208x  68 62 46 30 35 40 30 N runan
  하의 ~155 196x  70 62 44 28 30 38 28 N runan
  황소 ~155 196x  72 62 44 28 30 38 28 N runan
  진도 ~170 ~230  84 82 62 40 40 56 45 H runan 의리
  유염 ~165 234x  20 20 35 78 35 60 50 N shanyang

  # ----- 유표와 형주 -----
  이적 ~160 ~226  25 30 62 88 60 80 78 H shanyang
  방계 ~150 ~205  20 25 55 82 62 70 66 N xiangyang
  송충 ~150 ~215  10 10 35 76 35 84 66 N nanyang
  사마휘 ~150 208  10 10 60 80 50 94 60 N xiangyang 무욕
  소비 ~160 ~215  62 66 55 55 45 58 55 N jiangxia
  진취 ~160 208x  66 62 45 30 30 40 35 N jiangxia
  등룡 ~160 207x  66 60 42 28 28 38 30 N jiangxia
  진생 ~160 ~200  66 60 40 25 40 36 25 N jiangxia
  한현 ~155 ~209  45 50 40 40 40 42 50 N changsha
  유도 ~155 ~215  30 40 45 55 40 55 62 N lingling
  조범 ~165 ~215  35 45 45 62 55 55 60 N guiyang 변심
  금선 ~160 209x  40 45 40 50 40 50 58 N wuling
  사마가 ~180 222x  88 66 35 20 20 30 20 N wuling 과감
  향랑 ~167 247  25 40 55 72 45 80 80 H xiangyang
  향총 ~195 240x  62 78 72 60 50 72 70 H xiangyang
  요화 ~185 264  78 76 62 45 45 58 50 H xiangyang 의리
  양의 ~185 235x  30 55 76 70 72 80 82 N xiangyang 야심
  나헌 ~218 270  72 86 78 66 55 76 74 H xiangyang 수성 의리
  반준 ~175 239  45 70 76 76 60 80 86 N wuling
  요립 ~180 ~240  30 45 76 76 66 80 72 N wuling 야심
  곽준 177 216  72 82 72 50 55 66 60 H nanjun 수성 의리
  곽익 ~205 ~271  66 78 72 62 55 72 76 H nanjun
  풍습 ~175 222x  72 70 50 35 35 45 40 N nanjun
  장남 ~175 222x  70 68 50 35 35 45 40 N nanjun
  조루 ~175 220x  62 66 62 50 45 60 60 H nanjun 의리
  고상 ~180 ~240  72 74 62 45 45 56 50 N nanjun
  염우 ~210 ~265  62 68 60 55 55 62 66 N nanjun
  부융 ~175 222x  78 72 55 40 35 50 45 H jiangxia 의리
  부첨 ~215 263x  82 74 58 40 40 52 45 H jiangxia 의리
  동궐 ~205 ~270  50 66 66 66 50 70 76 H jiangxia
  번건 ~205 ~270  30 40 58 76 45 72 76 H jiangxia
  호제 ~200 ~260  62 68 60 55 50 62 62 H jiangxia
  비관 ~180 ~216  55 62 62 70 55 68 70 N jiangxia
  종예 ~180 264  55 62 66 86 55 76 72 H nanyang
  진진 ~170 235  25 30 55 82 50 76 78 H nanyang
  이엄 ~170 234  76 82 76 72 70 78 82 N nanyang 야심
  유봉 ~190 220x  80 74 55 40 40 48 42 N changsha 과감
  유선 207 271  20 25 30 50 30 45 50 N nanyang 무욕
  부사인 ~170 ~225  62 60 45 35 40 42 40 N guangyang 변심
  범강 ~180 ~225  55 40 30 25 50 30 20 N zhuo 변심
  장달 ~180 ~225  55 40 30 25 50 30 20 N zhuo 변심

  # ----- 익주와 촉 -----
  유모 ~165 ~208  45 45 45 50 40 50 50 N shujun
  유순 ~185 ~240  62 70 58 45 40 55 52 N shujun
  동부 ~135 ~195  15 15 45 76 50 80 66 N guanghan
  유괴 ~165 ~214x  68 68 55 40 40 50 48 N shujun
  영포 ~165 ~213x  74 68 50 35 35 45 40 N guanghan
  등현 ~165 ~214  68 66 50 35 35 45 40 N guanghan
  양회 ~165 212x  72 66 50 35 40 46 40 N zitong
  고패 ~165 212x  70 64 48 35 40 44 40 N zitong
  이이 ~165 ~225  70 66 50 30 50 44 35 N bajun 변심
  정도 ~160 ~215  20 30 80 66 70 78 66 N guanghan
  왕루 ~160 211x  20 20 50 70 40 70 68 N guanghan 의리
  장유 ~165 219x  15 15 50 72 50 84 60 N shujun
  주군 ~165 ~222  12 12 45 62 40 84 60 N bajun
  팽양 ~184 220x  30 40 72 80 78 80 66 N guanghan 야심
  진밀 ~170 226  15 15 45 92 45 88 72 N guanghan
  비시 ~175 ~235  30 30 55 82 45 76 70 H shujun
  왕보 ~180 222x  30 45 66 72 55 76 74 H guanghan
  정기 ~165 222x  55 62 60 60 50 64 66 H bajun 의리
  양홍(楊洪) ~175 228  30 50 76 76 62 80 86 H shujun
  초주 199 270  12 12 45 80 40 88 70 N bajun
  극정 ~215 278  15 15 45 82 40 84 72 H shujun
  진지 ~210 258  25 30 50 78 72 72 70 N shujun
  황호 ~215 ~265  15 10 30 70 84 55 30 N shujun 야심 변심
  장익 ~190 264x  76 82 74 55 50 68 66 H shujun
  마충 ~185 249  72 84 76 70 55 74 80 H bajun
  구부 ~190 ~250  82 78 60 40 40 54 45 H bajun
  오반 ~175 ~240  76 74 58 45 40 52 50 N chenliu
  오란 ~170 218x  76 70 50 35 35 45 40 N bajun
  뇌동 ~170 218x  78 70 50 35 35 45 40 N bajun
  진식 ~180 ~230  72 70 55 35 40 48 42 N bajun
  황숭 ~215 263x  70 70 66 50 50 62 55 H bajun 의리
  조광 ~215 ~263x  72 66 50 40 35 48 45 H shujun
  제갈첨 227 263x  60 62 60 70 50 70 72 H shujun 의리
  마막 ~210 ~265  45 45 40 45 45 40 45 N youfufeng 변심
  장서 ~215 ~265  62 55 45 35 55 42 35 N hanzhong 변심
  맹달 ~175 228x  74 78 74 80 76 76 70 N youfufeng 변심 야심
  양임 ~170 215x  76 72 55 35 40 48 42 N hanzhong
  두호 ~160 ~220  68 62 40 30 30 38 35 N bajun
  이회 ~175 231  62 76 76 84 66 78 76 N yizhoujun
  맹획 ~185 ~250  86 76 45 50 35 45 50 N yizhoujun 과감
  옹개 ~170 225x  66 66 50 55 62 52 50 N yizhoujun 야심
  찬습 ~180 ~240  55 60 55 55 50 60 66 N yizhoujun
  고정 ~175 225x  72 68 48 40 45 46 42 N yuexi
  주포 ~175 225x  66 62 50 45 55 50 45 N zangke
  여개 ~180 ~230x  40 60 70 82 60 78 80 H yongchang 의리
  왕항 ~180 ~235  50 66 62 62 50 66 72 H yongchang

  # ----- 서량 -----
  송건 ~150 214x  62 62 45 45 45 46 45 N longxi 야심
  미당 ~190 ~260  76 68 45 35 35 42 38 N longxi
  양천만 ~165 ~220  74 68 45 30 35 40 36 N hanyang
  국연(麴演) ~165 220x  66 64 50 40 55 46 40 N jincheng 변심
  안준 ~165 219x  62 58 45 40 45 44 40 N wuwei
  장진 ~170 220x  60 58 45 40 45 44 42 N zhangye
  황화 ~170 ~230  60 60 48 45 45 48 46 N jiuquan
  방육 ~170 ~225  76 62 55 60 45 62 62 H jiuquan 의리
  장공 ~160 ~225  50 66 66 66 50 70 76 H jiuquan
  창자 ~175 ~232  30 50 55 66 40 72 86 H jiujiang

  # ----- 손씨와 오 -----
  여범 ~165 228  62 78 78 76 70 78 84 N runan
  여거 ~200 256x  74 78 66 45 50 60 55 N runan
  주연 182 249  76 88 82 60 70 78 70 N danyang 과감 수전 수성
  주적 ~205 270  70 80 74 55 55 68 66 N danyang
  여대 161 256  70 86 80 66 66 76 84 N guangling
  전종 198 249  76 86 82 62 66 76 72 N wujun 수전
  정봉 ~195 271  86 86 78 50 66 72 55 N lujiang 과감 수전
  동습 ~170 213  82 76 55 40 35 50 45 N kuaiji 과감 수전
  송겸 ~165 ~225  70 66 50 35 35 45 40 N wujun
  진표 204 237  66 72 60 55 45 62 66 N lujiang
  엄준 ~175 ~250  15 15 45 80 40 84 76 N pengcheng 무욕
  정병 ~170 ~230  15 15 40 78 40 82 72 N runan
  설종 ~180 243  20 25 55 86 55 84 80 N peiguo
  호종 183 243  20 30 55 88 60 80 74 N runan
  제갈현 ~150 197x  30 40 50 66 40 66 70 H yuzhang
  제갈각 203 253x  50 72 82 92 80 90 80 N donghai 야심 과감
  제갈융 ~208 253x  55 60 55 62 45 60 60 N donghai
  고옹 168 243  15 30 62 78 55 86 96 N wujun 신중
  고소 ~184 ~215  15 20 50 84 45 80 82 N wujun
  고담 ~205 ~246  15 25 55 78 50 82 84 N wujun
  육적 188 219  15 15 50 82 45 88 74 H wujun
  육항 226 274  62 92 94 80 80 92 88 N wujun 신중 수전 수성
  육개 198 269  55 76 72 76 55 80 84 N wujun 의리
  장온 193 230  15 20 50 90 50 82 78 N wujun
  장승 178 244  55 72 70 70 55 76 78 N pengcheng
  보천 ~215 272x  62 68 55 50 55 56 55 N guangling 변심
  주거 194 250x  66 72 62 70 50 70 76 N wujun 의리
  주이 ~200 257x  78 80 70 45 55 62 50 N wujun
  당자 ~195 ~265  68 72 60 45 50 56 50 N donghai
  유찬 183 255x  82 80 66 40 45 58 45 N kuaiji 과감
  한종 ~185 252x  66 60 45 35 50 42 30 N liaoxi 변심
  손보 ~172 ~202  70 72 58 45 50 55 50 N wujun 변심
  손유 177 215  66 78 70 70 50 72 74 N wujun
  손교 ~183 219  70 80 72 66 55 70 72 N wujun
  손광 ~186 ~208  50 50 50 55 45 55 55 N wujun
  손소(孫韶) 188 241  78 84 72 55 55 68 66 N wujun
  손랑 ~190 ~250  55 50 40 40 40 42 40 N wujun
  손환 198 ~223  74 82 74 60 55 70 66 N wujun
  손등 209 241  45 55 62 80 45 78 82 N wujun 의리
  손려 213 232  60 66 62 62 50 68 66 N wujun
  손화 224 253x  30 35 50 72 40 72 70 N wujun
  손패 ~228 250x  40 40 45 55 55 50 45 N wujun 야심
  손휴 235 264  30 40 55 70 50 72 70 N wujun
  손준 219 256  66 62 55 50 76 60 45 N wujun 야심
  손침 231 258x  62 58 50 40 66 50 35 N wujun 야심
  주방 ~185 ~240  55 72 82 76 88 80 76 N wujun
  주처 236 297x  88 78 66 60 50 70 70 N wujun 의리 과감
  오찬 ~180 245x  45 62 62 70 50 72 76 N wujun 의리
  오언 ~230 ~300  84 80 62 45 40 58 60 N wujun
  종리목 ~195 ~265  70 80 74 55 55 68 70 N kuaiji
  낙통 193 228  55 70 70 74 50 76 80 N kuaiji
  주흔 ~150 196x  55 66 62 60 50 66 70 H kuaiji
  위소 204 273x  12 12 40 78 35 86 72 N danyang
  도황 ~225 ~290  66 84 80 60 62 74 78 N danyang
  장제(張悌) ~225 280x  55 66 66 70 50 72 76 N xiangyang 의리
  조랑 ~165 ~205  78 70 50 30 40 44 30 N danyang
  비잔 ~180 ~220x  70 60 40 25 35 36 25 N danyang

  # ----- 교주 -----
  사광 ~170 ~230  50 55 50 62 45 58 60 N jiaozhi
  오거 ~160 211x  70 66 50 40 45 46 42 N cangwu
  뇌공 ~160 ~225  30 40 50 66 40 66 72 H cangwu
  구경 ~165 ~215  72 62 42 28 50 38 28 N nanhai 변심
  구련 ~165 ~220  74 68 50 45 50 50 50 N rinan 야심

  # ----- 연의의 인물 -----
  하후은 ~170 208x  62 50 35 30 30 35 30 U qiao 연
  하후걸 ~175 208  50 40 30 30 30 30 30 U qiao 연
  하후덕 ~170 219x  68 62 45 30 30 40 35 U qiao 연
  한덕 ~170 228x  80 66 40 25 25 35 30 U hanyang 연
  최량 ~180 ~240  45 55 62 66 62 62 62 U hanyang 연
  호반 ~170 ~230  62 50 40 45 40 46 45 H henan 연
  무안국 ~155 ~200  78 55 30 20 20 26 20 U beihai 연
  종보 ~155 193x  68 50 30 20 20 26 20 U beihai 연
  배원소 ~165 200x  74 60 40 28 28 35 25 N runan 연
  주창 ~170 220x  82 60 35 25 20 30 25 H youfufeng 연 의리
  관색 ~200 ~235  82 70 50 40 35 48 40 H nanyang 연
  채화 ~170 208x  55 50 40 45 55 40 35 N xiangyang 연
  채중 ~170 208x  55 50 40 45 55 40 35 N xiangyang 연
  유현 ~185 ~230  62 55 40 40 35 42 40 N lingling 연
  형도영 ~170 208x  82 60 30 20 20 26 20 N lingling 연 과감
  진응 ~170 208x  70 55 35 25 25 30 25 N guiyang 연
  포륭 ~170 208x  72 55 32 22 22 28 22 N guiyang 연
  공지 ~170 ~220  50 50 55 62 60 60 60 N wuling 연
  양령 ~165 208x  70 55 35 25 25 30 25 N changsha 연
  아하소과 ~180 ~240  82 62 40 25 30 35 25 N jincheng 연
  맹우 ~190 ~250  76 62 40 40 35 40 35 N yizhoujun 연
  대래동주 ~195 ~250  72 62 50 45 50 50 40 N yizhoujun 연
  타사대왕 ~180 225x  70 66 50 30 62 50 30 N yizhoujun 연
  올돌골 ~180 225x  92 62 30 15 15 20 15 N yongchang 연 과감
  목록대왕 ~180 225x  78 70 45 25 50 40 25 N yongchang 연
  악환 ~185 ~240  84 66 40 25 25 35 30 N yuexi 연
  금환삼결 ~180 225x  76 60 35 20 20 30 20 N zangke 연
  동도나 ~180 ~225x  72 62 40 30 30 38 35 N zangke 연
  아회남 ~180 ~225x  72 60 40 30 30 38 35 N zangke 연

  # ----- 여성 -----
  채염 ~177 ~249  10 10 35 86 40 90 70 H chenliu 여
  변씨 160 230  10 12 40 66 40 72 74 U donghai 여
  조절 ~197 260  15 15 45 68 40 70 66 H qiao 여 의리
  하후씨 ~187 ~240  15 15 35 58 30 55 55 U qiao 여
  견씨 183 221x  12 12 40 70 40 76 70 N changshan 여
  곽여왕 184 235  10 12 55 68 78 76 66 N julu 여
  신헌영 191 269  12 15 76 78 66 92 74 U yingchuan 여 신중
  장춘화 189 247  15 15 62 62 76 78 66 N henei 여
  왕원희 217 268  10 12 60 66 55 86 76 U donghai 여
  장창포 199 257  10 10 50 66 45 84 70 U taiyuan 여
  양휘유 214 278  10 12 55 66 50 82 74 U taishan 여
  유부인 ~160 ~204  12 12 35 55 66 48 45 N weijun 여
  왕이 ~175 ~230  66 62 76 70 78 76 62 H hanyang 여 의리
  황월영 ~185 ~235  15 15 60 62 50 88 76 H xiangyang 여
  채부인 ~165 ~215  12 15 50 68 76 60 55 N xiangyang 여 야심
  감부인 ~170 ~210  10 10 35 62 30 62 58 H peiguo 여
  미부인 ~172 ~208  10 10 35 60 30 58 56 H donghai 여
  오부인 ~155 202  15 20 60 72 55 76 74 N wujun 여
  손상향 ~189 ~250  76 66 50 62 45 58 50 N wujun 여 과감
  손노반 ~200 ~260  15 15 50 70 84 62 50 N wujun 여 야심
  손노육 ~205 255x  12 12 40 62 45 60 55 N wujun 여
  서씨 ~185 ~240  20 25 66 70 84 78 60 N wujun 여 의리
  대교 ~180 ~230  10 10 35 62 35 60 55 N lujiang 여
  소교 ~182 ~235  10 10 35 64 35 62 55 N lujiang 여
  보연사 ~185 238  10 10 35 70 40 62 60 N guangling 여
  초선 ~175 ~230  20 15 50 86 84 70 50 H jingzhao 여 연
  추씨 ~165 ~210  10 10 30 66 45 50 45 N wuwei 여 연
  축융 ~195 ~255  84 66 45 40 35 45 35 N yizhoujun 여 연 과감
  `;

  // Families: kin joined to a clan of data/people.js (by any member's name),
  // or a new clan when the first name has none.
  const KIN = `
  조조 조앙 조충 조예 조우 조상 조희 조안민 하후상 하후무 하후위 하후혜 하후화 하후현 변씨 조절 하후씨
  원소 원유 유부인|원술 원요|손견 손보 손유 손교 손광 손소(孫韶) 손랑 손환 손등 손려 손화 손패 손휴 손준 손침 오부인 손상향 손노반 손노육
  유표 채부인|유언 유모 유순|유비 유선 유봉 감부인 미부인|관우 관색|공손찬 공손월|공손도 공손연 공손황
  사마랑 사마사 사마소 사마염 사마망 장춘화 왕원희|제갈근 제갈각 제갈융 제갈첨 제갈현|육손 육항 육개 육적
  종요 종육 종회|진군 진태|신비 신헌영|채옹 채염|황권 황숭|조운 조광|여범 여거|주연 주적|고옹 고소 고담
  장소 장승|진무 진표|맹획 맹우 축융|사섭 사광|왕랑 왕숙|노식 노육|장료 장호|악진 악침|허저 허의|전위 전만
  등애 등충|문흠 문앙|곽준 곽익|부융 부첨|오의 오반|양호 양휘유|조앙(趙昂) 왕이
  `;

  const TRAITS = new Set([].concat(...Object.values(S.TRAIT_AXES)));
  const SKILLS = new Set(Object.keys(S.SKILL_HELP));
  for (const raw of LINES.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+) (~?)(\d+) (~?)(\d+)(x?)\s+((?:\d+ ){7})([HUN]) (\w+)(.*)$/);
    if (!m) throw new Error("bad roster line: " + line);
    const name = m[1];
    if (S.PEOPLE[name] || S.ABILITIES[name]) throw new Error("duplicate person: " + name);
    const marks = m[10].trim().split(/\s+/).filter(Boolean);
    const p = { born: +m[3], bornEst: !!m[2], died: +m[5], diedEst: !!m[4], violent: !!m[6], home: m[9] };
    const a = { han: m[8] };
    m[7].trim().split(" ").forEach((v, i) => { a[S.ABILITY_KEYS[i]] = +v; });
    for (const k of marks) {
      if (k === "연") p.fiction = true;
      else if (k === "여") p.female = true;
      else if (TRAITS.has(k)) (S.TRAITS[name] = S.TRAITS[name] || []).push(k);
      else if (SKILLS.has(k)) (S.SKILLS[name] = S.SKILLS[name] || []).push(k);
      else throw new Error("unknown mark " + k + " for " + name);
    }
    S.PEOPLE[name] = p;
    S.ABILITIES[name] = a;
  }

  let clans = Math.max(-1, ...Object.values(S.CLAN).map((k) => k.clan)) + 1;
  for (const group of KIN.split(/[|\n]/).map((t) => t.trim()).filter(Boolean)) {
    const names = group.split(/\s+/);
    const known = names.map((n) => S.CLAN[n]).find(Boolean);
    const clan = known ? known.clan : clans++;
    let rank = Math.max(-1, ...Object.values(S.CLAN).filter((k) => k.clan === clan).map((k) => k.rank)) + 1;
    for (const n of names) {
      if (!S.PEOPLE[n]) throw new Error("unknown kin: " + n);
      if (!S.CLAN[n]) S.CLAN[n] = { clan, rank: rank++ };
    }
  }
})(globalThis.SAM = globalThis.SAM || {});
