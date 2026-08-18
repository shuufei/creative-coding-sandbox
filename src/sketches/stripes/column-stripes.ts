import type p5 from "p5";

// @types/p5 の createSelect は p5.Element を返すだけで、select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

// 縦の区切り位置の決め方
type SplitMode = "even" | "random";
// 帯 = 同じ区切り位置と配色を共有する連続した列。
// single は列ごとに独立、band は幅をランダムに振った帯でまとめる
type RunMode = "band" | "single";
// セクションへの色の割り当て方。permutation は全色をちょうど1回ずつ使う
type ColorMode = "random" | "permutation";
// 縦の分割数を帯ごとに変える方法。alternate 系は帯の順番で2つの値を切り替える
type SectionVariation = "fixed" | "random" | "half" | "two";
// 列の塗り方。blocks 系は列の片側だけをブロックで刻み、残りをベタ塗りする
type FillMode = "sections" | "topBlocks" | "bottomBlocks";
// 塗る色の作り方
type PaletteMode =
  | "random2"
  | "random3"
  | "near2far1"
  | "whiteGray2"
  | "whiteGray3"
  | "mono5"
  | "mono10"
  | "mono30"
  | "mono5x2"
  | "mono5x3";

const GRID_OPTIONS = [50, 100, 500];
const SECTION_OPTIONS = [2, 3, 5, 10];

const PALETTE_OPTIONS: [string, PaletteMode][] = [
  ["ランダムな2色", "random2"],
  ["ランダムな3色", "random3"],
  ["近い2色 + 遠い1色", "near2far1"],
  ["白 + グレー2色", "whiteGray2"],
  ["白 + グレー3色", "whiteGray3"],
  ["1色の明度違い5色", "mono5"],
  ["1色の明度違い10色", "mono10"],
  ["1色の明度違い30色", "mono30"],
  ["明度違い5色を2色で", "mono5x2"],
  ["明度違い5色を3色で", "mono5x3"],
];

const PALETTE_COUNTS: Record<PaletteMode, number> = {
  random2: 2,
  random3: 3,
  near2far1: 3,
  whiteGray2: 3,
  whiteGray3: 4,
  mono5: 5,
  mono10: 10,
  mono30: 30,
  mono5x2: 10,
  mono5x3: 15,
};

// 複数色相の明度違いパレットで、1色相あたりに作る明度の段数
const MONO_STEPS = 5;

// 有彩色の彩度・明度
const CHROMA_SAT = 72;
const CHROMA_BRI = 90;
// 白と組み合わせるグレーの明度の範囲
const GRAY_LOW = 40;
const GRAY_HIGH = 85;
// 明度違いのパレットで使う明度の範囲
const MONO_LOW = 30;
const MONO_HIGH = 95;

// セル数で決めている値は BASE_GRID 基準。
// 他のグリッド数でも同じ見た目になるよう比率で換算する
const BASE_GRID = 500;
// 帯モードで同じ配色が連続する列数(=帯の幅)の範囲
const MIN_RUN = 1;
const MAX_RUN = 24;
// ランダム区切りのとき、どのセクションにも等分割時の高さのこの割合は必ず確保する
const MIN_SECTION_RATIO = 0.3;

// ブロック塗りで、ブロックが列を占める割合の範囲
const TOP_FILL_MIN = 0.3;
const TOP_FILL_MAX = 0.8;
// ブロックに使う明度の段数。残り1色がベタ塗りの色になる
const TOP_BLOCK_STEPS = 5;

export const columnStripesSketch = (p: p5) => {
  const size = 500;

  // 1フレームで塗る列数(左から右へ1列ずつ塗り進める)
  const columnsPerFrame = 3;

  let gridN = 500;
  let sections = 5;
  let splitMode: SplitMode = "even";
  let fillMode: FillMode = "sections";
  let paletteMode: PaletteMode = "random3";
  let colorMode: ColorMode = "random";
  let variation: SectionVariation = "fixed";
  let runMode: RunMode = "band";

  const cellSize = () => size / gridN;

  const colorCount = () => PALETTE_COUNTS[paletteMode];

  const isBlockFill = () => fillMode !== "sections";

  // BASE_GRID 基準のセル数を、いまのグリッド数に合わせて換算する
  const scaled = (cells: number) => p.max(1, p.round((cells * gridN) / BASE_GRID));

  // 交互モードのもう一方の分割数。半分にしても2分割は下回らない
  const halfSections = () => p.max(2, p.round(sections / 2));

  // 帯ごとの縦の分割数
  const sectionCountFor = (bandIndex: number) => {
    switch (variation) {
      case "random":
        return SECTION_OPTIONS[p.floor(p.random(SECTION_OPTIONS.length))];
      case "half":
        return bandIndex % 2 === 0 ? sections : halfSections();
      case "two":
        return bandIndex % 2 === 0 ? sections : 2;
      default:
        return sections;
    }
  };

  // いまの設定で使われうる分割数
  const sectionValues = () => {
    switch (variation) {
      case "random":
        return SECTION_OPTIONS;
      case "half":
        return [sections, halfSections()];
      case "two":
        return [sections, 2];
      default:
        return [sections];
    }
  };

  // 全色を1回ずつ使えるのは、セクション数と色数が同じ帯だけ
  const canPermutate = () => sectionValues().includes(colorCount());

  // bounds は分割数 + 1 個の区切り位置(先頭は0、末尾は gridN)
  type Band = { bounds: number[]; colors: number[] };

  let palette: p5.Color[] = [];
  // 列ごとの帯情報。同じ帯に属する列は同じオブジェクトを共有する
  let columnBands: Band[] = [];
  let drawnColumns = 0;

  // 等分割は同じ高さで割るだけ。
  // ランダム分割は各セクションに最低高さを配り、残りをランダムな比率で分配する
  const makeBounds = (count: number) => {
    if (splitMode === "even") {
      const height = gridN / count;
      return Array.from({ length: count + 1 }, (_, s) => s * height);
    }

    const minHeight = p.max(1, p.floor((gridN / count) * MIN_SECTION_RATIO));
    const slack = gridN - count * minHeight;
    const weights = Array.from({ length: count }, () => p.random());
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const bounds = [0];
    let y = 0;
    for (let s = 0; s < count - 1; s++) {
      y += minHeight + p.floor((slack * weights[s]) / weightSum);
      bounds.push(y);
    }
    bounds.push(gridN);
    return bounds;
  };

  // ブロック塗りの帯。1ブロックの高さは分割数から決め、
  // 列の 3〜8 割に達するまで明度違いの色をランダムに積み、残りをベタ塗りにする。
  // まず上から積む形で作り、下部ブロックのときは上下を反転する
  const makeBlockBand = (count: number): Band => {
    const limit = gridN * p.random(TOP_FILL_MIN, TOP_FILL_MAX);
    const unit = gridN / count;

    const bounds = [0];
    const colors: number[] = [];
    let y = 0;
    while (y < limit) {
      const height =
        splitMode === "even"
          ? unit
          : unit * p.random(MIN_SECTION_RATIO, 2 - MIN_SECTION_RATIO);
      y = p.min(y + height, limit);
      bounds.push(y);
      colors.push(p.floor(p.random(TOP_BLOCK_STEPS)));
    }

    // パレットの最後の色でベタ塗り
    bounds.push(gridN);
    colors.push(TOP_BLOCK_STEPS);

    if (fillMode === "bottomBlocks") {
      return {
        bounds: bounds.map((edge) => gridN - edge).reverse(),
        colors: [...colors].reverse(),
      };
    }
    return { bounds, colors };
  };

  const makeColors = (count: number) => {
    // 全色を1回ずつ使えるのは、その帯の分割数が色数と一致するときだけ
    if (colorMode === "permutation" && count === colorCount()) {
      return p.shuffle(Array.from({ length: count }, (_, i) => i));
    }
    return Array.from({ length: count }, () => p.floor(p.random(colorCount())));
  };

  // 色相と彩度は固定して、明度だけを low〜high に等間隔で振った count 色
  const brightnessScale = (count: number, hue: number, sat: number, low: number, high: number) =>
    Array.from({ length: count }, (_, i) =>
      p.color(hue, sat, count === 1 ? high : low + ((high - low) * i) / (count - 1)),
    );

  const makePalette = (): p5.Color[] => {
    const white = p.color(0, 0, 100);
    const count = colorCount();

    // ブロック塗りは「1色の明度違い5色 + ベタ塗り用の1色」で固定
    if (isBlockFill()) {
      const hue = p.random(360);
      const solidHue = (hue + p.random(80, 140)) % 360;
      return [
        ...brightnessScale(TOP_BLOCK_STEPS, hue, CHROMA_SAT, MONO_LOW, MONO_HIGH),
        p.color(solidHue, CHROMA_SAT, CHROMA_BRI),
      ];
    }

    switch (paletteMode) {
      case "whiteGray2":
      case "whiteGray3":
        // 白のぶんを除いた数だけグレーを作る
        return [white, ...brightnessScale(count - 1, 0, 0, GRAY_LOW, GRAY_HIGH)];

      case "mono5":
      case "mono10":
      case "mono30":
        return brightnessScale(count, p.random(360), CHROMA_SAT, MONO_LOW, MONO_HIGH);

      case "mono5x2":
      case "mono5x3": {
        // 互いに離れた色相をとり、それぞれを明度違い MONO_STEPS 色に展開する
        let hue = p.random(360);
        const colors: p5.Color[] = [];
        for (let i = 0; i < count / MONO_STEPS; i++) {
          if (i > 0) hue = (hue + p.random(80, 140)) % 360;
          colors.push(
            ...brightnessScale(MONO_STEPS, hue, CHROMA_SAT, MONO_LOW, MONO_HIGH),
          );
        }
        return colors;
      }

      case "near2far1": {
        // 近い2色は色相を少しだけずらし、残る1色はその2色から十分に離す
        const base = p.random(360);
        const near = (base + p.random(15, 40) * (p.random() < 0.5 ? -1 : 1) + 360) % 360;
        const far = (base + p.random(140, 220)) % 360;
        return [base, near, far].map((hue) => p.color(hue, CHROMA_SAT, CHROMA_BRI));
      }

      default: {
        // 互いに離れた色相を取り、どの2色も判別できるようにする
        let hue = p.random(360);
        const colors = [p.color(hue, CHROMA_SAT, CHROMA_BRI)];
        for (let i = 1; i < count; i++) {
          hue = (hue + p.random(80, 140)) % 360;
          colors.push(p.color(hue, CHROMA_SAT, CHROMA_BRI));
        }
        return colors;
      }
    }
  };

  const generatePattern = () => {
    palette = makePalette();

    // 帯を左から敷き詰める。帯の中は区切り位置と配色を共有する
    // (1列ごとモードでは幅1の帯 = 列ごとに独立した配色になる)
    columnBands = new Array(gridN);
    let col = 0;
    let bandIndex = 0;
    while (col < gridN) {
      const width =
        runMode === "single"
          ? 1
          : p.floor(p.random(scaled(MIN_RUN), scaled(MAX_RUN) + 1));
      const bandSections = sectionCountFor(bandIndex);
      const band: Band = isBlockFill()
        ? makeBlockBand(bandSections)
        : {
            bounds: makeBounds(bandSections),
            colors: makeColors(bandSections),
          };
      const end = p.min(col + width, gridN);
      for (; col < end; col++) columnBands[col] = band;
      bandIndex++;
    }

    drawnColumns = 0;
    p.noStroke();
    p.background(0, 0, 100);
    p.loop();
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
    return field;
  };

  let paletteField: p5.Element;
  let colorModeField: p5.Element;

  const setFieldEnabled = (field: p5.Element, enabled: boolean) => {
    field.style("opacity", enabled ? "1" : "0.35");
    field.style("pointer-events", enabled ? "auto" : "none");
  };

  // 効かない組み合わせの設定は、操作できないものとして見せる。
  // ブロック塗りは配色を自前で決めるので、塗る色と色の並びは効かない
  const refreshFieldStates = () => {
    setFieldEnabled(paletteField, !isBlockFill());
    setFieldEnabled(colorModeField, !isBlockFill() && canPermutate());
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

    addSelect<string>(
      panel,
      "グリッドの数",
      GRID_OPTIONS.map((value) => [`${value} x ${value}`, String(value)]),
      String(gridN),
      (value) => {
        gridN = Number(value);
        generatePattern();
      },
    );

    addSelect<string>(
      panel,
      "縦の分割数",
      SECTION_OPTIONS.map((value) => [String(value), String(value)]),
      String(sections),
      (value) => {
        sections = Number(value);
        refreshFieldStates();
        generatePattern();
      },
    );

    addSelect<SectionVariation>(
      panel,
      "分割数の変動",
      [
        ["なし", "fixed"],
        ["帯ごとにランダム", "random"],
        ["指定分割数・半分を交互", "half"],
        ["指定分割数・2分割を交互", "two"],
      ],
      variation,
      (value) => {
        variation = value;
        refreshFieldStates();
        generatePattern();
      },
    );

    addSelect<SplitMode>(
      panel,
      "区切り位置",
      [
        ["等分割", "even"],
        ["ランダム", "random"],
      ],
      splitMode,
      (value) => {
        splitMode = value;
        generatePattern();
      },
    );

    addSelect<FillMode>(
      panel,
      "塗りのパターン",
      [
        ["列全体を分割", "sections"],
        ["上部ブロック + 下はベタ塗り", "topBlocks"],
        ["下部ブロック + 上はベタ塗り", "bottomBlocks"],
      ],
      fillMode,
      (value) => {
        fillMode = value;
        refreshFieldStates();
        generatePattern();
      },
    );

    paletteField = addSelect<PaletteMode>(
      panel,
      "塗る色",
      PALETTE_OPTIONS,
      paletteMode,
      (value) => {
        paletteMode = value;
        refreshFieldStates();
        generatePattern();
      },
    );

    colorModeField = addSelect<ColorMode>(
      panel,
      "色の並び",
      [
        ["ランダム", "random"],
        ["全色を1回ずつ", "permutation"],
      ],
      colorMode,
      (value) => {
        colorMode = value;
        generatePattern();
      },
    );

    addSelect<RunMode>(
      panel,
      "横のまとまり",
      [
        ["帯 (幅ランダム)", "band"],
        ["1列ごと", "single"],
      ],
      runMode,
      (value) => {
        runMode = value;
        generatePattern();
      },
    );

    const hint = p.createDiv("canvas をクリックで再生成 / s キーで PNG 保存");
    hint.parent(panel);
    labelStyle(hint);
    hint.style("color", "#777");
    hint.style("margin-left", "auto");

    refreshFieldStates();
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    buildUI();
    generatePattern();
  };

  p.draw = () => {
    if (drawnColumns >= gridN) {
      p.noLoop();
      return;
    }

    const cell = cellSize();
    for (let k = 0; k < columnsPerFrame && drawnColumns < gridN; k++, drawnColumns++) {
      const { bounds, colors } = columnBands[drawnColumns];
      for (let s = 0; s < colors.length; s++) {
        p.fill(palette[colors[s]]);
        p.rect(
          drawnColumns * cell,
          bounds[s] * cell,
          cell,
          (bounds[s + 1] - bounds[s]) * cell,
        );
      }
    }
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    generatePattern();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(
        `column-stripes-${gridN}-${sections}-${variation}-${splitMode}-${fillMode}-${paletteMode}-${runMode}-${Date.now()}`,
        "png",
      );
    }
  };
};
