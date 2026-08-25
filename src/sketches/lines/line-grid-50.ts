import type p5 from "p5";

/**
 * 線的な表現の検証。
 *
 * 正方形のマスを grid で敷き詰め、各マスの中心に1本ずつ線を置く。
 * 「整列した枠 (grid) の中で、線の向き・色・影がばらけると何が起きるか」を見るためのもの。
 *
 * - 向き: マスごとにランダムか、grid の位置から一貫したルールで決めるか
 * - 色:   黒 / 複数色 / 明度違い。並びもランダムか一貫したルールか
 * - 影:   光源を1つ置いて、浮いている線の影を落とす
 */

// 線の向きの決め方
// - free / dir8 / dir4 / dir2: マスごとにランダム。選べる角度の刻みだけが違う
// - rotate: grid を斜めに進むほど少しずつ回る
// - swirl:  中心のまわりを回る向き (半径に対して直角)
// - zigzag: 基準の向きから + / - を交互に振る
// - noise:  ノイズによるなめらかな向きの流れ
type AngleMode =
  | "free"
  | "dir8"
  | "dir4"
  | "dir2"
  | "rotate"
  | "swirl"
  | "zigzag"
  | "noise";

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

// @types/p5 の createSelect は p5.Element を返すだけで select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

type Cell = {
  cx: number;
  cy: number;
  angle: number;
  color: p5.Color;
};

export const lineGrid50Sketch = (p: p5) => {
  const size = 1000;

  const settings = {
    // 1辺のマス数。canvas の大きさは変えずにマスを細かくする
    gridN: 30,
    angleMode: "free" as AngleMode,
    // rotate の1マスあたりの回転量 / zigzag の振れ幅 (度)
    angleStep: 6,
    palette: "mono" as PaletteMode,
    colorFlow: "random" as ColorFlow,
    shadow: "none" as ShadowMode,
    // マスの1辺に対する影のずれの長さ。point では光源から最も遠いマスでこの長さになる
    shadowRatio: 0.3,
    // マスの1辺に対する線の長さの比率。1 でマスの幅と同じ
    lengthRatio: 0.6,
    weight: 2,
  };

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

  // --- 向き ---------------------------------------------------------------

  // 一貫したパターンで使う基準の角度とノイズの位置。描くたびにランダムに決める
  let baseAngle = 0;
  let noiseSeed = 0;

  const angleAt = (col: number, row: number): number => {
    const step = p.radians(settings.angleStep);
    const last = settings.gridN - 1;

    switch (settings.angleMode) {
      case "dir2":
        return p.floor(p.random(2)) * (p.PI / 2);
      case "dir4":
        return p.floor(p.random(4)) * (p.PI / 4);
      case "dir8":
        return p.floor(p.random(8)) * (p.PI / 8);
      case "rotate":
        // 左上から右下へ進むほど回る。同じ向きの線が斜めの帯になって並ぶ
        return baseAngle + (col + row) * step;
      case "swirl": {
        // 中心から見た方向に対して直角 = 中心のまわりを回る向き
        const center = last / 2;
        return Math.atan2(row - center, col - center) + p.HALF_PI;
      }
      case "zigzag":
        // 市松に + / - へ振る。grid 全体では2方向だけになる
        return baseAngle + ((col + row) % 2 === 0 ? step : -step);
      case "noise":
        // 近いマスどうしの向きが繋がる、なめらかな流れ
        return (
          p.noise(noiseSeed + col * 0.08, noiseSeed + row * 0.08) * p.TWO_PI * 2
        );
      default:
        // 線に向きの区別はないので 0〜180度で足りる
        return p.random(p.PI);
    }
  };

  // --- 影 -----------------------------------------------------------------

  // 平行光の向き / 点光源の位置。どちらも描くたびにランダムに決める
  let lightAngle = 0;
  let lightX = 0;
  let lightY = 0;

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

  // 線と、ずらした先の線を四隅とする帯。線が浮いていて影が落ちているように見せる
  const drawShadow = (cell: Cell, half: number, cellSize: number) => {
    const dx = Math.cos(cell.angle) * half;
    const dy = Math.sin(cell.angle) * half;
    const { dx: ox, dy: oy } = shadowOffset(cell.cx, cell.cy, cellSize);

    p.quad(
      cell.cx - dx,
      cell.cy - dy,
      cell.cx + dx,
      cell.cy + dy,
      cell.cx + dx + ox,
      cell.cy + dy + oy,
      cell.cx - dx + ox,
      cell.cy - dy + oy,
    );
  };

  // --- 描画 ---------------------------------------------------------------

  const drawGrid = () => {
    const cellSize = size / settings.gridN;
    const half = (cellSize * settings.lengthRatio) / 2;

    baseAngle = p.random(p.PI);
    noiseSeed = p.random(1000);
    placeLight();

    const palette = buildPalette();
    const cells: Cell[] = [];
    for (let row = 0; row < settings.gridN; row++) {
      for (let col = 0; col < settings.gridN; col++) {
        cells.push({
          cx: (col + 0.5) * cellSize,
          cy: (row + 0.5) * cellSize,
          angle: angleAt(col, row),
          color: palette[colorIndexAt(col, row, palette.length)],
        });
      }
    }

    p.background(0, 0, 100);

    // 影は全マスぶんを先に敷く。あとから隣のマスの影が線の上に乗らないようにする
    if (settings.shadow !== "none") {
      p.noStroke();
      p.fill(0, 0, 60, 45);
      for (const cell of cells) drawShadow(cell, half, cellSize);
    }

    p.noFill();
    p.strokeWeight(settings.weight);
    // 線の端は直角にして、太さを変えても長さが変わらないようにする
    p.strokeCap(p.SQUARE);
    for (const cell of cells) {
      const dx = Math.cos(cell.angle) * half;
      const dy = Math.sin(cell.angle) * half;
      p.stroke(cell.color);
      p.line(cell.cx - dx, cell.cy - dy, cell.cx + dx, cell.cy + dy);
    }
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
        ["100 x 100", "100"],
      ],
      String(settings.gridN),
      (value) => {
        settings.gridN = Number(value);
        drawGrid();
      },
    );

    addSelect<AngleMode>(
      panel,
      "向き",
      [
        ["ランダム / 自由", "free"],
        ["ランダム / 8方向", "dir8"],
        ["ランダム / 4方向", "dir4"],
        ["ランダム / 縦横", "dir2"],
        ["一貫 / 少しずつ回転", "rotate"],
        ["一貫 / 中心まわりの渦", "swirl"],
        ["一貫 / +- を交互", "zigzag"],
        ["一貫 / ノイズの流れ", "noise"],
      ],
      settings.angleMode,
      (value) => {
        settings.angleMode = value;
        applyMode();
        drawGrid();
      },
    );

    // 回転 / 交互のときだけ効く、1マスあたりの角度
    const stepField = addSelect<string>(
      panel,
      "向きの変化量 (度)",
      numberOptions([2, 4, 6, 10, 20, 45]),
      String(settings.angleStep),
      (value) => {
        settings.angleStep = Number(value);
        drawGrid();
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
        applyMode();
        drawGrid();
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
        drawGrid();
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
        applyMode();
        drawGrid();
      },
    );

    const shadowField = addSelect<string>(
      panel,
      "影の長さ (マス比)",
      numberOptions([0.15, 0.3, 0.5, 0.8, 1.2]),
      String(settings.shadowRatio),
      (value) => {
        settings.shadowRatio = Number(value);
        drawGrid();
      },
    ).field;

    addSelect<string>(
      panel,
      "線の長さ (マス比)",
      numberOptions([0.4, 0.6, 0.8, 1, 1.2]),
      String(settings.lengthRatio),
      (value) => {
        settings.lengthRatio = Number(value);
        drawGrid();
      },
    );

    addSelect<string>(
      panel,
      "線の太さ",
      numberOptions([0.5, 1, 1.5, 2, 3, 5]),
      String(settings.weight),
      (value) => {
        settings.weight = Number(value);
        drawGrid();
      },
    );

    const applyMode = () => {
      const usesStep =
        settings.angleMode === "rotate" || settings.angleMode === "zigzag";
      stepField.style("display", usesStep ? "flex" : "none");
      flowField.style("display", settings.palette === "mono" ? "none" : "flex");
      shadowField.style("display", settings.shadow === "none" ? "none" : "flex");
    };
    applyMode();

    const hint = p.createDiv("canvas をクリックで再生成 / s キーで PNG 保存");
    hint.parent(panel);
    labelStyle(hint);
    hint.style("color", "#777");
    hint.style("margin-left", "auto");
  };
  // -----------------------------------------------------------------------

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    // canvas の下の設定パネルまでスクロールできるようにする
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    buildUI();
    drawGrid();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    drawGrid();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`line-grid-${settings.gridN}-${Date.now()}`, "png");
    }
  };
};
