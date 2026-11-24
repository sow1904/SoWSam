# Credits

## City and stronghold icons (`assets/cities/`, `assets/forts/`)

- Made by the game's author with Gemini, for this game. The sheet (`assets_ver2.png`, 2400 x 1792) is kept out of the repository in `resources/`.
- Cut out with `tools/cut_assets.py`: the sheet's green ground is keyed out, and each icon is trimmed and halved in size.
- `cities/c1.png` to `cities/c5.png` (1-5단계 성) and `cities/c1_ruin.png` to `cities/c5_ruin.png` (파괴된 성), `cities/palace.png` (황궁), `cities/palace_ruin.png` (파괴된 황궁), `cities/port.png` (항구, not used yet), `forts/fort.png` (요새), `forts/fort_ruin.png` (파괴된 요새), `forts/pass.png` (관문), `forts/site.png` (성터).
- An earlier sheet by the author (`assets.png`) gave the icons used until this one. Its cavalry and fleet pictures were never used; armies on the map are drawn by the game itself.
- Until November 2026 the game used icons by CroN of the Naver cafe 「조조전 모드를 사랑하는 사람들의 모임」 (https://naver.me/Gahr0M8A, 전면 허용). They are no longer in the repository.

## Terrain maps (`assets/map/terrain_spring/summer/autumn/winter.jpg`, `assets/map/mini.jpg`)

- Made by the game's author with ChatGPT and Gemini, for this game: one map for each season, and a plainer one for the small maps. Saved as JPEG from the original 2048 x 2048 PNGs (`resources/map_*.png`, kept out of the repository; the generator's corner mark taken out in `resources/clean/`); the small map is scaled to 1024 x 1024.

## Second terrain maps (`assets/map2/terrain_spring/summer/autumn/winter.jpg`, `assets/map2/mini.jpg`)

- Made by the game's author for this game, a second painting of the map in a frame, to compare with the first (시스템 → 지도 그림). Saved as JPEG from the original 2048 x 2048 PNGs (`resources/map2_*.png`, kept out of the repository; the generator's corner mark taken out in `resources/clean2/` with `resources/clean/unmark3.js`); the small map is scaled to 1024 x 1024.

## Fourth terrain maps and icons (`assets/map4/`)

- Made by the game's author with Gemini over the plain latitude-longitude sketch of `tools/mapgen.js --geo`, in ink and colour: one map for each season, a small map, and a sheet of city and stronghold icons in the same style. Saved as JPEG from the original 2048 x 2048 PNGs (`resources/map4/`, kept out of the repository; the generator's corner mark taken out in `resources/clean4/`); icons cut from `resources/map4_assets.png` by `tools/cut_assets4.py` into `assets/map4/icons/`.

## Fallen city (`assets/ui/collapse.jpg`)

- Made by the game's author for this game; shown when a force falls. Saved as JPEG (1280 px wide) from the original PNG (`resources/img_collapse.png`, kept out of the repository), cropped at the right and bottom to leave out the generator's corner mark (`resources/clean/`).
