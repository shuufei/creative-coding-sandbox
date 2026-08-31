import type p5 from "p5";

/**
 * 線的な表現の検証。
 *
 * 正方形のマスを grid で敷き詰め、各マスの中心に線を置く。
 * 「整列した枠 (grid) の中で、線の向き・色・影がばらけると何が起きるか」と、
 * 「その向きが時間で変わると何が起きるか」を続けて見るためのもの。
 *
 * 線の角度は 2つの足し算でできている。
 *
 *   角度 = 向き(col, row) + 動き(col, row, t)
 *
 * - 向き: 静止したときの角度の配置。grid の位置から決まる
 * - 動き: そこに時間で足される角度。「なし」を選べば完全に静止する
 *
 * この2つは独立して選べるので、たとえば「ランダム4方向 x 一律回転」のように
 * 元は別々だった見え方を組み合わせられる。
 */

// 線の向き (静止したときの角度の配置)
// - free / dir8 / dir4 / dir2: マスごとにランダム。選べる角度の刻みだけが違う
// - uniform: 全マスが同じ向き
// - rotate:  grid を斜めに進むほど少しずつ回る
// - zigzag:  基準の向きから + / - を交互に振る
// - swirl:   中心のまわりを回る向き (半径に対して直角)
// - radial:  中心から外へ向かう向き
// - noise:   ノイズによるなめらかな向きの流れ
// - pointer: 1点を向く。マウスが canvas の中にあればマウス、外なら決まった点
//
// rotate / zigzag / swirl / radial は「変化量」を使う。
// swirl / radial では、中心から1マス離れるごとに足される角度 = ねじれになる
type Pattern =
  | "free"
  | "dir8"
  | "dir4"
  | "dir2"
  | "uniform"
  | "rotate"
  | "zigzag"
  | "swirl"
  | "radial"
  | "noise"
  | "pointer";

// 向きに時間で足される角度
// - none:   なし。静止画になる (このとき canvas は描きっぱなしで再描画しない)
// - spin:   全マスに同じ角度を足す。向きの配置を保ったまま全体が時計回りに回る
// - wave:   斜めに進む平行な波で + / - に振る
// - ripple: 中心から広がる同心円の波で + / - に振る
// - wobble: ノイズでなめらかに + / - に振る。
//           向きが noise のときだけは足し算ではなく、ノイズの場そのものを流す
//           (3次元ノイズの z 軸に時間を入れる = 模様の形自体がゆっくり変わる)
type Motion = "none" | "spin" | "wave" | "ripple" | "wobble";

// 線の色。shade5 系は色相を変えずに明度だけを5段に振る
// - mono:     黒1色
// - color2 / color3 / color4: 色相を離した2〜4色
// - shade5:   1色の明度違い5段
// - shade5x2: 2色 x 明度違い5段 = 10色
type PaletteMode =
  | "mono"
  | "color2"
  | "color3"
  | "color4"
  | "shade5"
  | "shade5x2";

// パレットのどの色を使うかの決め方
// - random:   マスごとにランダム
// - diagonal: 左上から右下へパレット順に (明度違いならグラデーションになる)
// - column:   列ごとにパレット順を繰り返す縦じま
// - radial:   中心からの距離でパレット順に
type ColorFlow = "random" | "diagonal" | "column" | "radial";

// 影の落とし方
// - none:     影なし
// - parallel: 平行光。すべてのマスで影の向きと長さが同じ
// - point:    点光源。光源から離れたマスほど影が長く、向きも放射状になる
type ShadowMode = "none" | "parallel" | "point";

// 前のフレームをどれだけ残すか。動かしているときだけ効く
type TrailMode = "none" | "soft" | "strong";

// @types/p5 の createSelect は p5.Element を返すだけで select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

export const lineGridSketch = (p: p5) => {
  const size = 1000;

  const settings = {
    // 1辺のマス数。canvas の大きさは変えずにマスを細かくする
    gridN: 30,
    // 1マスに重ねる線の本数。2本以上のときは、線ごとに場をずらして別々の流れにする
    linesPerCell: 1,
    pattern: "free" as Pattern,
    // rotate の1マスあたりの回転量 / zigzag の振れ幅 / swirl・radial のねじれ (度)
    angleStep: 6,
    motion: "none" as Motion,
    // 時間の進む速さ。1 でおよそ 1 秒に 1 ラジアン進む
    speed: 1,
    // wave / ripple / wobble での角度の振れ幅 (度)
    amplitude: 90,
    // 空間の細かさ。大きいほどノイズや波の模様が細かくなる
    scale: 0.06,
    palette: "mono" as PaletteMode,
    colorFlow: "random" as ColorFlow,
    shadow: "none" as ShadowMode,
    // マスの1辺に対する影のずれの長さ。point では光源から最も遠いマスでこの長さになる
    shadowRatio: 0.3,
    // マスの1辺に対する線の長さの比率。1 でマスの幅と同じ
    lengthRatio: 0.6,
    weight: 2,
    trail: "none" as TrailMode,
  };

  // 描くたび (再生成のたび) に決まる、パターンの向きや位置
  let baseAngle = 0;
  let waveAngle = 0;
  let noiseSeed = 0;
  let lightAngle = 0;
  let lightX = 0;
  let lightY = 0;
  let paletteColors: p5.Color[] = [];
  // マスごとの色は時間で変わらないので、再生成と設定変更のときだけ作り直す
  let cellColors: p5.Color[] = [];
  // ランダム系の向きのもとになる 0〜1。毎フレーム引き直すと動かしたときにちらつくので、
  // ここに固定しておいて「静止した配置」として扱う
  let randomBase: number[] = [];
  let paused = false;
  // 一時停止をまたいでも時間が飛ばないように、経過時間は自前で足す
  let time = 0;
  let lastMillis = 0;

  const slotCount = () =>
    settings.gridN * settings.gridN * settings.linesPerCell;

  // --- 色 -----------------------------------------------------------------

  // 明度だけを5段に振る。白地なので暗いほうに寄せて、いちばん明るい段も線として見えるようにする
  const shadesOf = (hue: number, saturation: number): p5.Color[] =>
    [0, 1, 2, 3, 4].map((i) => p.color(hue, saturation, 25 + i * 11));

  const buildPalette = (): p5.Color[] => {
    const hue1 = p.random(360);
    // 2色目は色相を離して、どの色か判別できるようにする
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    const saturation = () => p.random(60, 90);
    const brightness = () => p.random(45, 75);

    switch (settings.palette) {
      case "color2":
        return [
          p.color(hue1, saturation(), brightness()),
          p.color(hue2, saturation(), brightness()),
        ];
      case "color3":
      case "color4": {
        const count = settings.palette === "color3" ? 3 : 4;
        // 色相を等間隔に割って、隣どうしが似すぎないようにする
        return Array.from({ length: count }, (_, i) =>
          p.color((hue1 + (360 / count) * i) % 360, saturation(), brightness()),
        );
      }
      case "shade5":
        return shadesOf(hue1, saturation());
      case "shade5x2":
        // 前半は暗 -> 明、後半は明 -> 暗。一貫した並びのときに段が繋がって見えるようにする
        return [
          ...shadesOf(hue1, saturation()),
          ...shadesOf(hue2, saturation()).reverse(),
        ];
      default:
        return [p.color(0, 0, 0)];
    }
  };

  // パレットの何番を使うか。ランダム以外は grid の位置から決める
  const colorIndexAt = (col: number, row: number, count: number): number => {
    if (count === 1) return 0;
    const last = settings.gridN - 1;

    switch (settings.colorFlow) {
      case "diagonal": {
        // 左上 0 / 右下 1 の比率をパレット全体に引き伸ばす
        const t = (col + row) / (last * 2);
        return p.constrain(p.floor(t * count), 0, count - 1);
      }
      case "column":
        return col % count;
      case "radial": {
        const center = last / 2;
        const t = p.dist(col, row, center, center) / p.dist(0, 0, center, center);
        return p.constrain(p.floor(t * count), 0, count - 1);
      }
      default:
        return p.floor(p.random(count));
    }
  };

  const rebuildColors = () => {
    cellColors = [];
    for (let row = 0; row < settings.gridN; row++) {
      for (let col = 0; col < settings.gridN; col++) {
        cellColors.push(
          paletteColors[colorIndexAt(col, row, paletteColors.length)],
        );
      }
    }
  };

  // --- 向き ---------------------------------------------------------------

  // pointer が向く先を線の本数ぶん。1本目だけはマウスが canvas の中にあればそこを向く。
  // 残りはノイズで決まる別々の点なので、本数を増やすとその数だけ引きつける先ができる
  const targetPoints = (t: number) => {
    const inside =
      p.mouseX >= 0 && p.mouseX <= size && p.mouseY >= 0 && p.mouseY <= size;
    return Array.from({ length: settings.linesPerCell }, (_, layer) => {
      if (layer === 0 && inside) return { x: p.mouseX, y: p.mouseY };
      return {
        x: p.noise(noiseSeed + 10 + layer * 37, t * 0.1) * size,
        y: p.noise(noiseSeed + 20 + layer * 37, t * 0.1) * size,
      };
    });
  };

  const rebuildRandomBase = () => {
    const total = slotCount();
    randomBase = new Array(total);
    for (let i = 0; i < total; i++) randomBase[i] = p.random();
  };

  // 1マスに複数の線を置くとき、同じ式のままだと全部が重なって1本にしか見えない。
  // 層ごとに「場」をずらして、線の本数ぶんの流れが同じ grid の上で交差するようにする
  // - turn: 基準の向きを回す (層どうしが違う方向を向く)
  // - jump: ノイズ空間の遠い場所へ飛ばす (層どうしが無関係な模様になる)
  // ランダム系の向きは randomBase が層ごとに違うので、どちらも要らない
  const turnOf = (layer: number) => layer * (p.PI / 3);
  const jumpOf = (layer: number) => layer * 37;

  const patternAt = (
    col: number,
    row: number,
    slot: number,
    t: number,
    targets: { x: number; y: number }[],
    cellSize: number,
    layer: number,
  ): number => {
    const step = p.radians(settings.angleStep);
    const k = settings.scale;
    const center = (settings.gridN - 1) / 2;
    const turn = turnOf(layer);
    const r = randomBase[slot];

    switch (settings.pattern) {
      case "dir2":
        return Math.floor(r * 2) * p.HALF_PI;
      case "dir4":
        return Math.floor(r * 4) * (p.PI / 4);
      case "dir8":
        return Math.floor(r * 8) * (p.PI / 8);
      case "uniform":
        return baseAngle + turn;
      case "rotate":
        // 左上から右下へ進むほど回る。同じ向きの線が斜めの帯になって並ぶ
        return baseAngle + turn + (col + row) * step;
      case "zigzag":
        // 市松に + / - へ振る。grid 全体では2方向だけになる
        return baseAngle + turn + ((col + row) % 2 === 0 ? step : -step);
      case "swirl": {
        // 中心から見た方向に対して直角 = 中心のまわりを回る向き。
        // 変化量を上げると、中心から離れるほどねじれてうずまきになる
        const d = Math.hypot(col - center, row - center);
        return (
          Math.atan2(row - center, col - center) + p.HALF_PI + turn + d * step
        );
      }
      case "radial": {
        const d = Math.hypot(col - center, row - center);
        return Math.atan2(row - center, col - center) + turn + d * step;
      }
      case "noise": {
        // 動きが wobble のときだけ、時間をノイズの z 軸に入れる。
        // 断面がずれていくので、隣どうしの繋がりを保ったまま模様の形自体が変わる
        const z = settings.motion === "wobble" ? t * 0.15 : 0;
        const jump = jumpOf(layer);
        return (
          p.noise(noiseSeed + jump + col * k, noiseSeed + jump + row * k, z) *
          p.TWO_PI *
          2
        );
      }
      case "pointer": {
        const target = targets[layer];
        return Math.atan2(
          target.y - (row + 0.5) * cellSize,
          target.x - (col + 0.5) * cellSize,
        );
      }
      default:
        // 線に向きの区別はないので 0〜180度で足りる
        return r * p.PI;
    }
  };

  const motionAt = (
    col: number,
    row: number,
    t: number,
    layer: number,
  ): number => {
    const amp = p.radians(settings.amplitude);
    const k = settings.scale;
    const center = (settings.gridN - 1) / 2;
    const turn = turnOf(layer);
    // 層ごとに波の位相をずらして、線どうしがすれ違うようにする
    const phase = layer * (p.TWO_PI / 3);

    switch (settings.motion) {
      case "spin":
        // 全マスに同じ角度を足すだけ。マスどうしの角度差が変わらないので
        // 向きの配置はそのまま保たれる
        // (canvas は y 軸が下向きなので、角度を足すと時計回り)
        return t;
      case "wave": {
        // 波の進む向きに射影した距離が同じマスは、同じだけ振れる。
        // 層ごとに進む向きも変えるので、2本以上だと波が斜めに交差する
        const dir = waveAngle + turn;
        const along = col * Math.cos(dir) + row * Math.sin(dir);
        return amp * Math.sin(along * k * 2 - t + phase);
      }
      case "ripple": {
        const d = Math.hypot(col - center, row - center);
        return amp * Math.sin(d * k * 2 - t + phase);
      }
      case "wobble": {
        // 向きが noise のときは、足すのではなくノイズの場そのものを流している
        if (settings.pattern === "noise") return 0;
        const jump = jumpOf(layer);
        return (
          amp *
          (p.noise(
            noiseSeed + jump + col * k,
            noiseSeed + jump + row * k,
            t * 0.3,
          ) *
            2 -
            1)
        );
      }
      default:
        return 0;
    }
  };

  // --- 影 -----------------------------------------------------------------

  const placeLight = () => {
    lightAngle = p.random(p.TWO_PI);
    // 光源は canvas の外まで含めた範囲に置く。画面の中に入ると影の放射がきつくなりすぎる
    lightX = p.random(-size * 0.6, size * 1.6);
    lightY = p.random(-size * 0.6, size * 1.6);
  };

  // そのマスの影のずれ (光源と反対を向くベクトル)
  const shadowOffset = (cx: number, cy: number, cellSize: number) => {
    const max = cellSize * settings.shadowRatio;
    if (settings.shadow === "parallel") {
      return { dx: Math.cos(lightAngle) * max, dy: Math.sin(lightAngle) * max };
    }
    // 点光源。光源から遠いマスほど影が長い
    const vx = cx - lightX;
    const vy = cy - lightY;
    const d = Math.hypot(vx, vy) || 1;
    // canvas の対角より少し長い距離を基準にした 0〜1
    const t = p.constrain(d / (size * 1.4), 0, 1);
    return { dx: (vx / d) * max * t, dy: (vy / d) * max * t };
  };

  // --- 描画 ---------------------------------------------------------------

  // 再生成 (パターンの向き・光源・色・ランダムの引き直し)
  const reseed = () => {
    baseAngle = p.random(p.PI);
    waveAngle = p.random(p.TWO_PI);
    noiseSeed = p.random(1000);
    placeLight();
    paletteColors = buildPalette();
    rebuildColors();
    rebuildRandomBase();
  };

  const drawFrame = () => {
    const n = settings.gridN;
    const count = settings.linesPerCell;
    const cellSize = size / n;
    const half = (cellSize * settings.lengthRatio) / 2;
    const t = time;
    const targets = targetPoints(t);

    if (settings.motion === "none" || settings.trail === "none") {
      p.background(0, 0, 100);
    } else {
      // 半透明の白を重ねて、前のフレームを少しずつ消す = 残像
      p.noStroke();
      p.fill(0, 0, 100, settings.trail === "soft" ? 12 : 30);
      p.rect(0, 0, size, size);
    }

    // 影は全マスぶんを先に敷くので、線の向きだけ先に配列へ出しておく。
    // 1マスに複数本あるときは (マス番号 * 本数 + 層) の順に詰める
    const total = n * n * count;
    const dx: number[] = new Array(total);
    const dy: number[] = new Array(total);

    let i = 0;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        for (let layer = 0; layer < count; layer++, i++) {
          const angle =
            patternAt(col, row, i, t, targets, cellSize, layer) +
            motionAt(col, row, t, layer);
          dx[i] = Math.cos(angle) * half;
          dy[i] = Math.sin(angle) * half;
        }
      }
    }

    // 線は本数にかかわらずマスの中心を通す。向きが揃った瞬間だけ1本に見える
    const centerX = (index: number) =>
      ((Math.floor(index / count) % n) + 0.5) * cellSize;
    const centerY = (index: number) =>
      (Math.floor(Math.floor(index / count) / n) + 0.5) * cellSize;

    // 影は全マスぶんを先に敷く。あとから隣のマスの影が線の上に乗らないようにする
    // (beginShape(QUADS) で 10000 個を1つのパスにまとめると、重なりの解決で
    //  かえって桁違いに遅くなるので、1本ずつ塗る)
    if (settings.shadow !== "none") {
      p.noStroke();
      p.fill(0, 0, 60, 45);
      for (let j = 0; j < total; j++) {
        const cx = centerX(j);
        const cy = centerY(j);
        const { dx: ox, dy: oy } = shadowOffset(cx, cy, cellSize);
        p.quad(
          cx - dx[j],
          cy - dy[j],
          cx + dx[j],
          cy + dy[j],
          cx + dx[j] + ox,
          cy + dy[j] + oy,
          cx - dx[j] + ox,
          cy - dy[j] + oy,
        );
      }
    }

    p.noFill();
    p.strokeWeight(settings.weight);
    // 線の端は直角にして、太さを変えても長さが変わらないようにする
    p.strokeCap(p.SQUARE);

    const mono = paletteColors.length === 1;
    if (mono) p.stroke(paletteColors[0]);
    for (let j = 0; j < total; j++) {
      // 同じマスの線はどの層も同じ色にする。色はマスの単位で決めているため
      if (!mono) p.stroke(cellColors[Math.floor(j / count)]);
      const cx = centerX(j);
      const cy = centerY(j);
      p.line(cx - dx[j], cy - dy[j], cx + dx[j], cy + dy[j]);
    }
  };

  // 動かさない設定のときは描きっぱなしにして、変更があったときだけ描き直す
  const applyLoop = () => {
    if (settings.motion === "none") {
      p.noLoop();
      p.redraw();
    } else {
      lastMillis = p.millis();
      p.loop();
    }
  };

  // 設定を変えたときの描き直し。動いているなら次のフレームで反映される
  const refresh = () => {
    if (settings.motion === "none") p.redraw();
  };

  // --- 設定 UI ------------------------------------------------------------
  const labelStyle = (el: p5.Element) => {
    el.style("color", "#ddd");
    el.style("font", "13px/1.6 sans-serif");
    el.style("letter-spacing", "0.04em");
  };

  const addSelect = <T extends string>(
    parent: p5.Element,
    title: string,
    options: [string, T][],
    current: T,
    onChange: (value: T) => void,
  ) => {
    const field = p.createDiv();
    field.parent(parent);
    field.style("display", "flex");
    field.style("flex-direction", "column");
    field.style("gap", "6px");

    const label = p.createDiv(title);
    label.parent(field);
    labelStyle(label);

    const select = p.createSelect() as SelectElement;
    select.parent(field);
    select.style("padding", "6px 8px");
    select.style("font", "13px sans-serif");
    select.style("background", "#1c1c1c");
    select.style("color", "#eee");
    select.style("border", "1px solid #444");
    select.style("border-radius", "4px");
    for (const [text] of options) select.option(text);
    select.selected(options.find(([, value]) => value === current)![0]);
    select.changed(() => {
      const picked = options.find(([text]) => text === select.value());
      if (picked) onChange(picked[1]);
    });
    return { field, label };
  };

  const numberOptions = (values: number[]) =>
    values.map((n) => [String(n), String(n)] as [string, string]);

  const buildUI = () => {
    const panel = p.createDiv();
    panel.style("width", `${size}px`);
    panel.style("box-sizing", "border-box");
    panel.style("padding", "20px 24px 28px");
    panel.style("display", "flex");
    panel.style("gap", "24px");
    panel.style("align-items", "flex-end");
    panel.style("flex-wrap", "wrap");
    panel.style("background", "#111");

    addSelect<string>(
      panel,
      "マス数",
      [
        ["20 x 20", "20"],
        ["30 x 30", "30"],
        ["50 x 50", "50"],
        ["60 x 60", "60"],
        ["100 x 100", "100"],
      ],
      String(settings.gridN),
      (value) => {
        settings.gridN = Number(value);
        rebuildColors();
        rebuildRandomBase();
        refresh();
      },
    );

    addSelect<string>(
      panel,
      "1マスの線の本数",
      numberOptions([1, 2, 3]),
      String(settings.linesPerCell),
      (value) => {
        settings.linesPerCell = Number(value);
        rebuildRandomBase();
        refresh();
      },
    );

    addSelect<Pattern>(
      panel,
      "向き",
      [
        ["ランダム / 自由", "free"],
        ["ランダム / 8方向", "dir8"],
        ["ランダム / 4方向", "dir4"],
        ["ランダム / 縦横", "dir2"],
        ["一定 / 全部同じ向き", "uniform"],
        ["一貫 / 少しずつ回転", "rotate"],
        ["一貫 / +- を交互", "zigzag"],
        ["一貫 / 中心まわりの渦", "swirl"],
        ["一貫 / 中心から放射", "radial"],
        ["一貫 / ノイズの流れ", "noise"],
        ["一貫 / 1点を向く", "pointer"],
      ],
      settings.pattern,
      (value) => {
        settings.pattern = value;
        applyFields();
        refresh();
      },
    );

    // 回転 / 交互 / 渦 / 放射のときだけ効く、1マスあたりの角度
    const stepField = addSelect<string>(
      panel,
      "向きの変化量 (度)",
      numberOptions([0, 2, 4, 6, 10, 20, 45]),
      String(settings.angleStep),
      (value) => {
        settings.angleStep = Number(value);
        refresh();
      },
    ).field;

    addSelect<Motion>(
      panel,
      "動き",
      [
        ["なし (静止)", "none"],
        ["一律回転", "spin"],
        ["波が通り抜ける", "wave"],
        ["中心から広がる波", "ripple"],
        ["ノイズでゆらぐ", "wobble"],
      ],
      settings.motion,
      (value) => {
        settings.motion = value;
        applyFields();
        applyLoop();
      },
    );

    const speedField = addSelect<string>(
      panel,
      "速さ",
      numberOptions([0.2, 0.5, 1, 2, 4]),
      String(settings.speed),
      (value) => {
        settings.speed = Number(value);
      },
    ).field;

    const ampField = addSelect<string>(
      panel,
      "振れ幅 (度)",
      numberOptions([15, 30, 45, 90, 180]),
      String(settings.amplitude),
      (value) => {
        settings.amplitude = Number(value);
      },
    ).field;

    const scaleField = addSelect<string>(
      panel,
      "細かさ",
      numberOptions([0.02, 0.04, 0.06, 0.12, 0.25]),
      String(settings.scale),
      (value) => {
        settings.scale = Number(value);
        refresh();
      },
    ).field;

    addSelect<PaletteMode>(
      panel,
      "色",
      [
        ["黒1色", "mono"],
        ["2色", "color2"],
        ["3色", "color3"],
        ["4色", "color4"],
        ["明度違い5段", "shade5"],
        ["明度違い5段 x 2色", "shade5x2"],
      ],
      settings.palette,
      (value) => {
        settings.palette = value;
        paletteColors = buildPalette();
        rebuildColors();
        applyFields();
        refresh();
      },
    );

    // 黒1色のときは色の並べ方に意味がないので隠す
    const flowField = addSelect<ColorFlow>(
      panel,
      "色の並び",
      [
        ["ランダム", "random"],
        ["一貫 / 左上から右下へ", "diagonal"],
        ["一貫 / 縦じま", "column"],
        ["一貫 / 中心から外へ", "radial"],
      ],
      settings.colorFlow,
      (value) => {
        settings.colorFlow = value;
        rebuildColors();
        refresh();
      },
    ).field;

    addSelect<ShadowMode>(
      panel,
      "影",
      [
        ["なし", "none"],
        ["平行光", "parallel"],
        ["点光源", "point"],
      ],
      settings.shadow,
      (value) => {
        settings.shadow = value;
        applyFields();
        refresh();
      },
    );

    const shadowField = addSelect<string>(
      panel,
      "影の長さ (マス比)",
      numberOptions([0.15, 0.3, 0.5, 0.8, 1.2]),
      String(settings.shadowRatio),
      (value) => {
        settings.shadowRatio = Number(value);
        refresh();
      },
    ).field;

    addSelect<string>(
      panel,
      "線の長さ (マス比)",
      numberOptions([0.4, 0.6, 0.8, 1, 1.2]),
      String(settings.lengthRatio),
      (value) => {
        settings.lengthRatio = Number(value);
        refresh();
      },
    );

    addSelect<string>(
      panel,
      "線の太さ",
      numberOptions([0.5, 1, 1.5, 2, 3, 5]),
      String(settings.weight),
      (value) => {
        settings.weight = Number(value);
        refresh();
      },
    );

    const trailField = addSelect<TrailMode>(
      panel,
      "残像",
      [
        ["なし", "none"],
        ["弱", "soft"],
        ["強", "strong"],
      ],
      settings.trail,
      (value) => {
        settings.trail = value;
      },
    ).field;

    // 効かない設定は隠す
    const applyFields = () => {
      const usesStep =
        settings.pattern === "rotate" ||
        settings.pattern === "zigzag" ||
        settings.pattern === "swirl" ||
        settings.pattern === "radial";
      const usesAmp =
        settings.motion === "wave" ||
        settings.motion === "ripple" ||
        (settings.motion === "wobble" && settings.pattern !== "noise");
      const usesScale = settings.pattern === "noise" || usesAmp;
      const moving = settings.motion !== "none";

      stepField.style("display", usesStep ? "flex" : "none");
      speedField.style("display", moving ? "flex" : "none");
      ampField.style("display", usesAmp ? "flex" : "none");
      scaleField.style("display", usesScale ? "flex" : "none");
      trailField.style("display", moving ? "flex" : "none");
      flowField.style("display", settings.palette === "mono" ? "none" : "flex");
      shadowField.style("display", settings.shadow === "none" ? "none" : "flex");
    };
    applyFields();

    const hint = p.createDiv(
      "canvas をクリックで再生成 / スペースで一時停止 / s キーで PNG 保存",
    );
    hint.parent(panel);
    labelStyle(hint);
    hint.style("color", "#777");
    hint.style("margin-left", "auto");
  };
  // -----------------------------------------------------------------------

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.frameRate(60);
    // canvas の下の設定パネルまでスクロールできるようにする
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    buildUI();
    reseed();
    lastMillis = p.millis();
    applyLoop();
  };

  p.draw = () => {
    const now = p.millis();
    const delta = (now - lastMillis) / 1000;
    lastMillis = now;
    if (settings.motion !== "none" && !paused) time += delta * settings.speed;
    drawFrame();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    reseed();
    refresh();
  };

  p.keyPressed = () => {
    if (p.key === " ") paused = !paused;
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`line-grid-${settings.gridN}-${Date.now()}`, "png");
    }
  };
};
