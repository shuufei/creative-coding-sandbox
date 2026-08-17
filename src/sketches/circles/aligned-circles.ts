import type p5 from "p5";

// @types/p5 の createSelect は p5.Element を返すだけで、select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

type PaletteMode =
  | "color2"
  | "color1"
  | "white2"
  | "white1"
  | "gray2"
  | "gray3"
  | "whiteGray2"
  | "whiteGray3";
type ShiftMode =
  | "random"
  | "clockwise"
  | "diagonal"
  | "horizontal"
  | "spreadX"
  | "radial"
  | "line";
type BackMode = "gray" | "color";

// color は前面の円、back は背後の円のパレット番号
// 明度は手前用・背後用で別に決めるので、パレットは色相と彩度だけを持つ
// bright を持つのは明度だけを変えたグレー。それ以外は明度を前後で振り分ける
type Swatch = { hue: number; sat: number; bright?: number };

type Cell = {
  x: number;
  y: number;
  shiftX: number;
  shiftY: number;
  color: number;
  back: number;
};

export const alignedCirclesSketch = (p: p5) => {
  const size = 1000;
  const margin = 20;

  // ---- 設定 -------------------------------------------------------------
  let paletteMode: PaletteMode = "color2";
  let shiftMode: ShiftMode = "clockwise";
  let backMode: BackMode = "gray";
  let gridN = 30;

  // 背後の円をずらす距離。直径に対する比率で持つ
  const shiftRatio = 0.4;
  // 「時計回り」で左端の円が向く向き = 左上。
  // y 軸が下向きなので、角度が増える = 画面上では時計回り
  const startAngle = (Math.PI * 5) / 4;
  // 「時計回り」で左端から右端までに何周させるか
  const turns = 1;
  // 「左下から右上の直線」の本数と太さ。太さは 0 なら対角線上のマスだけ
  const lineCount = 3;
  const lineBand = 0;

  // 背後の円は手前より暗くするので、グレーも明度を落とす
  const gray = () => p.color(0, 0, 55);

  let cells: Cell[] = [];
  // palette は手前の円用(明度が高い)、backPalette は同じ色相の背後用(明度が低い)
  let palette: p5.Color[] = [];
  let backPalette: p5.Color[] = [];
  // パレットが1色しかないときに、背後の円だけに使う色
  let backColor: p5.Color | null = null;

  // グリッド数に応じて変わる寸法
  const cellSize = () => (size - margin * 2) / gridN;
  // ずらした円がマスからはみ出す幅は diameter / 2 + shift。
  // 隣のマスの円と衝突しない条件は diameter + 2 * shift <= cellSize。
  // shift = diameter * shiftRatio なので、直径の上限は
  // cellSize / (1 + 2 * shiftRatio) = cellSize * 0.555。
  // ここはさらに小さくして、マスの間に余白が見えるようにしている
  const diameter = () => cellSize() * 0.5;
  const shiftLength = () => diameter() * shiftRatio;

  // ---- 配置 -------------------------------------------------------------
  // 列の位置 col から、背後の円をずらすベクトルを決める。
  // radial と line 以外は列だけで決まるので、同じ列は同じずらし方になり縦の筋として読める
  const shiftOf = (col: number, row: number): { x: number; y: number } => {
    const len = shiftLength();
    // 回転用。右端が左端と重ならないよう gridN で割る
    const turnT = col / gridN;
    // 直線移動用。左端(上端)で -1、中央で 0、右端(下端)で +1 になるようにする
    const spread = (i: number) => (gridN > 1 ? (i / (gridN - 1)) * 2 - 1 : 0);
    const lerpT = spread(col);

    switch (shiftMode) {
      case "random": {
        const angle = p.random(p.TWO_PI);
        const r = p.random(len);
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      }
      case "diagonal": {
        // 左上から右下へ。斜めなので、長さが len を超えないよう成分を 1/√2 にする
        const d = (len / Math.SQRT2) * lerpT;
        return { x: d, y: d };
      }
      case "horizontal":
      // 中央でずれ0、左半分は左へ、右半分は右へ。horizontal と同じ計算になる
      case "spreadX":
        return { x: len * lerpT, y: 0 };
      case "radial": {
        // 中央から外向き。四隅で長さが len を超えないよう成分を 1/√2 にする
        const unit = len / Math.SQRT2;
        return { x: unit * lerpT, y: unit * spread(row) };
      }
      case "line": {
        // 左下から右上へ引いた対角線は col + row が一定。
        // その取りうる範囲 0 〜 2 * last に、線を等間隔で並べる
        const last = gridN - 1;
        const sum = col + row;
        const center = [...Array(lineCount)].findIndex((_, k) => {
          const target = Math.round((2 * last * (k + 1)) / (lineCount + 1));
          return Math.abs(sum - target) <= lineBand;
        });
        // 線から外れたマスはずらさない = 背後の円が完全に隠れて見えなくなる
        if (center < 0) return { x: 0, y: 0 };

        // 線ごとに長さが違うので、その線の左下の端で 0、右上の端で最大になるよう正規化する
        const target = Math.round((2 * last * (center + 1)) / (lineCount + 1));
        const colMin = Math.max(0, target - last);
        const colMax = Math.min(last, target);
        const t = colMax > colMin ? (col - colMin) / (colMax - colMin) : 1;
        // 向きは左下 (x: -, y: +) 固定。斜めなので成分は 1/√2
        const d = (len / Math.SQRT2) * t;
        return { x: -d, y: d };
      }
      default: {
        const angle = startAngle + turnT * p.TWO_PI * turns;
        return { x: Math.cos(angle) * len, y: Math.sin(angle) * len };
      }
    }
  };

  const build = () => {
    const step = cellSize();
    cells = [];
    for (let row = 0; row < gridN; row++) {
      for (let col = 0; col < gridN; col++) {
        const s = shiftOf(col, row);
        cells.push({
          x: margin + step * (col + 0.5),
          y: margin + step * (row + 0.5),
          shiftX: s.x,
          shiftY: s.y,
          color: 0,
          back: 0,
        });
      }
    }
  };

  // ---- 色 ---------------------------------------------------------------
  // 手前の円は明度を高く、背後の円は明度を低くする。
  // 同じ色相でも前後が読み取れるので、色相と彩度だけをパレットとして持ち、
  // 明度は手前用・背後用で別に与える
  const frontBrightness = () => p.random(85, 98);
  const backBrightness = () => p.random(38, 55);

  const toFront = (s: Swatch) => {
    // 明度を指定されたグレーは、その明度がそのまま見せたい色になる
    if (s.bright !== undefined) return p.color(0, 0, s.bright);
    // 白はそのまま白にする。明度を振ると白に見えなくなる
    return s.sat === 0 ? p.color(0, 0, 100) : p.color(s.hue, s.sat, frontBrightness());
  };
  const toBack = (s: Swatch) =>
    // グレーも手前より暗くする。明度の差はそのまま残るので前後を読み取れる
    s.bright !== undefined
      ? p.color(0, 0, s.bright * 0.55)
      : p.color(s.hue, s.sat, backBrightness());

  // 明度だけを変えたグレー。範囲を等分した位置から少しずらす。
  // いちばん明るいものでも白い背景からは離しておく
  const grayScale = (count: number): Swatch[] => {
    const low = 40;
    const high = 85;
    const step = (high - low) / (count - 1);
    return [...Array(count)].map((_, i) => ({
      hue: 0,
      sat: 0,
      bright: low + step * i + p.random(-step * 0.15, step * 0.15),
    }));
  };

  // 2色のときは色相を離して、どちらの色か判別できるようにする
  const generateSwatches = (): Swatch[] => {
    const white: Swatch = { hue: 0, sat: 0 };
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    const pick = (hue: number): Swatch => ({ hue, sat: p.random(60, 90) });

    switch (paletteMode) {
      case "color1":
        return [pick(hue1)];
      case "white2":
        return [white, pick(hue1), pick(hue2)];
      case "white1":
        return [white, pick(hue1)];
      case "gray2":
        return grayScale(2);
      case "gray3":
        return grayScale(3);
      case "whiteGray2":
        return [white, ...grayScale(2)];
      case "whiteGray3":
        return [white, ...grayScale(3)];
      default:
        return [pick(hue1), pick(hue2)];
    }
  };

  const recolor = () => {
    const swatches = generateSwatches();
    palette = swatches.map(toFront);
    backPalette = swatches.map(toBack);

    // パレットが1色だと「前面と違う色」を選べないので、背後専用の色を1つ引く。
    // 前面の色と色相を離して、重なりが見えるようにする
    backColor =
      swatches.length > 1
        ? null
        : toBack({
            hue: (swatches[0].hue + p.random(90, 270)) % 360,
            sat: p.random(60, 90),
          });

    for (const cell of cells) {
      cell.color = p.floor(p.random(palette.length));
      // 背後は前面と違う色にする。前面の色を除いた中から選ぶ
      const others = palette
        .map((_, i) => i)
        .filter((i) => i !== cell.color);
      cell.back = others.length
        ? others[p.floor(p.random(others.length))]
        : cell.color;
    }
  };

  // 背後の円の塗り。ランダムな色のときは、前面と違う色の暗いほうを使う
  const backFill = (cell: Cell) => {
    if (backMode === "gray") return gray();
    return backColor ?? backPalette[cell.back];
  };

  // ---- 描画 -------------------------------------------------------------
  const render = () => {
    const d = diameter();

    p.background(0, 0, 100);
    p.noStroke();

    // 背後の円は隣のマスにはみ出すので、先に全部まとめて敷く。
    // マスごとに交互に描くと、後のマスの背後の円が前のマスの色を隠してしまう
    for (const cell of cells) {
      p.fill(backFill(cell));
      p.circle(cell.x + cell.shiftX, cell.y + cell.shiftY, d);
    }

    for (const cell of cells) {
      p.fill(palette[cell.color]);
      p.circle(cell.x, cell.y, d);
    }
  };

  const regenerate = () => {
    build();
    recolor();
    render();
  };

  // ---- 設定 UI ----------------------------------------------------------
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
  };

  const buildUI = () => {
    const panel = p.createDiv();
    panel.style("width", `${size}px`);
    panel.style("box-sizing", "border-box");
    panel.style("padding", "20px 24px 28px");
    panel.style("display", "flex");
    panel.style("gap", "28px");
    panel.style("align-items", "flex-end");
    panel.style("flex-wrap", "wrap");
    panel.style("background", "#111");

    addSelect<PaletteMode>(
      panel,
      "塗る色",
      [
        ["ランダムな2色", "color2"],
        ["ランダムな1色", "color1"],
        ["白 + ランダムな2色", "white2"],
        ["白 + ランダムな1色", "white1"],
        ["明度の異なるグレー2つ", "gray2"],
        ["明度の異なるグレー3つ", "gray3"],
        ["白 + 明度の異なるグレー2つ", "whiteGray2"],
        ["白 + 明度の異なるグレー3つ", "whiteGray3"],
      ],
      paletteMode,
      (value) => {
        // 配置は保ったまま塗り分けだけをやり直す
        paletteMode = value;
        recolor();
        render();
      },
    );

    addSelect<ShiftMode>(
      panel,
      "円のずらしかた",
      [
        ["ランダム", "random"],
        ["左上から時計回り", "clockwise"],
        ["左上から右下へ", "diagonal"],
        ["左から右へ", "horizontal"],
        ["中央から左右へ", "spreadX"],
        ["中央から放射状に", "radial"],
        ["左下から右上の直線", "line"],
      ],
      shiftMode,
      (value) => {
        // 色はそのままに、ずらし方だけを引き直す
        shiftMode = value;
        const previous = cells.map((cell) => cell.color);
        build();
        cells.forEach((cell, i) => (cell.color = previous[i]));
        render();
      },
    );

    addSelect<BackMode>(
      panel,
      "背後の円の色",
      [
        ["薄いグレー", "gray"],
        ["ランダムな色", "color"],
      ],
      backMode,
      (value) => {
        // 塗り分けは recolor 済みなので、描き直すだけでよい
        backMode = value;
        render();
      },
    );

    addSelect<string>(
      panel,
      "グリッドの数",
      [
        ["30 x 30", "30"],
        ["50 x 50", "50"],
        ["100 x 100", "100"],
      ],
      String(gridN),
      (value) => {
        gridN = Number(value);
        regenerate();
      },
    );

    const hint = p.createDiv("canvas をクリックで再生成 / s キーで PNG 保存");
    hint.parent(panel);
    labelStyle(hint);
    hint.style("color", "#777");
    hint.style("margin-left", "auto");
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    // canvas の下の設定パネルまでスクロールできるようにする
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    buildUI();
    regenerate();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    regenerate();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`aligned-circles-${gridN}-${Date.now()}`, "png");
    }
  };
};
