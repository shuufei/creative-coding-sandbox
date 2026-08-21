import type p5 from "p5";

/**
 * 塗り方のパターン
 * - linked:  白 + 2色。制約をかけて色を帯 (または塊) として連結させる
 * - none:    白 + 2色。制約なしで1三角形ずつ独立に色を選ぶ
 * - twoTone: 白なし。下地の1色の上に、連結させたもう1色の帯を塗る
 * - blobs:   白なし。2色を交互に、決まった大きさの塊で白がなくなるまで敷き詰める
 */
type PatternMode = "linked" | "none" | "twoTone" | "blobs";

/**
 * 連結なしのときの、1マス (三角形4つ) の塗り分け方。
 * quad* はどれも「4色を1マスに1色ずつ置く」で、色相の散らし方だけが違う
 * - plain:      マスは意識せず、三角形ごとに面積比だけを重みに色を選ぶ
 * - half:       4つのうち2つだけを色で塗り、残りの2つは白のままにする
 * - quadPair:   色相の近い2色 + そこから色相の遠い2色 (A)
 * - quadNear:   色相の近い4色 (C)
 * - quadEven:   色相を90度ずつ均等に離した4色 (D)
 * - quadTriple: 色相の近い3色 + そこから色相の遠い1色 (E)。遠い1色の位置はランダム
 * - quadTripleFixed:  E-2。遠い1色をどのマスでも同じ位置に置く
 * - quadTripleRotate: E-3。遠い1色の位置をマスごとに時計回りに1つずつずらす
 * - quadShadeFixed:    E-2b。近い3色を1色の明度違い3段に置き換えた E-2
 */
type CellStyle =
  | "plain"
  | "half"
  | "quadPair"
  | "quadNear"
  | "quadEven"
  | "quadTriple"
  | "quadTripleFixed"
  | "quadTripleRotate"
  | "quadShadeFixed";

// 1マスを4色で塗るスタイルかどうか
const isQuadStyle = (style: CellStyle) => style !== "plain" && style !== "half";

// @types/p5 の createSelect は p5.Element を返すだけで select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

export const triangleGrid50Sketch = (p: p5) => {
  const size = 800;

  // canvas の下のパネルから変更できる設定。変えるたびに描き直す
  const settings = {
    // 1辺のマス数。canvas の大きさは変えずにマスを細かくする
    gridN: 50,
    mode: "linked" as PatternMode,
    // 連結なしのときだけ効く、1マスの塗り分け方
    cellStyle: "plain" as CellStyle,
    // 1本の帯の長さ(三角形の数)。この長さに届かなかった帯は捨てて引き直す
    ribbonLength: 160,
    // 1つの三角形が同じ色の三角形と隣接できる上限。
    // 2 にすると同色領域は枝分かれできず幅1の帯状になり、3 (隣接の最大数) にすると
    // 自分自身に接触できるので塊状に育つ
    maxSameNeighbors: 3,
    // blobs のとき、1つの塊にする三角形の数
    blobSize: 100,
    // twoTone のとき、帯を1色ではなく「帯の色の明度違い5色」から1マスずつ選んで塗る
    shadedRibbons: false,
    // 埋め草 (白、twoTone では下地) の面積の取り分。帯の色は常に 1。
    // linked / none なら 1 で白 : 色1 : 色2 が3等分、twoTone なら下地 : 帯
    fillShare: 1,
  };

  // 1マスを対角線2本で分割した4つの三角形(上・右・下・左)の頂点を返す
  const cellTriangles = (col: number, row: number) => {
    const cellSize = size / settings.gridN;
    const x = col * cellSize;
    const y = row * cellSize;
    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;
    const x2 = x + cellSize;
    const y2 = y + cellSize;

    return [
      [x, y, x2, y, cx, cy], // top
      [x2, y, x2, y2, cx, cy], // right
      [x2, y2, x, y2, cx, cy], // bottom
      [x, y2, x, y, cx, cy], // left
    ] as const;
  };

  // 白 + ランダムな2色。twoTone では白を外して「下地の色 + 帯の色」として使う
  const generatePalette = (): p5.Color[] => {
    const hue1 = p.random(360);
    // 2色目は色相を離して、どちらの色か判別できるようにする
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    return [
      p.color(0, 0, 100),
      p.color(hue1, p.random(60, 90), p.random(75, 95)),
      p.color(hue2, p.random(60, 90), p.random(75, 95)),
    ];
  };

  // 1マスに置く4色。基準の色相からの相対位置だけがスタイルごとに変わる
  const generateQuadPalette = (style: CellStyle): p5.Color[] => {
    const base = p.random(360);
    // 「近い」ずらし幅と「遠い」ずらし幅
    const near = () => p.random(15, 35);
    const far = () => p.random(90, 270);

    // 色相のかたまりのかわりに、1色の明度を 16 ずつ落とした3段を使う
    if (style === "quadShadeFixed") {
      const saturation = p.random(60, 90);
      const brightness = p.random(75, 95);
      const shades = [0, 1, 2].map((i) =>
        p.color(base, saturation, brightness - i * 16),
      );
      return [
        ...shades,
        p.color((base + far()) % 360, p.random(60, 90), p.random(75, 95)),
      ];
    }

    let offsets: number[];
    switch (style) {
      case "quadNear": {
        // 少しずつずらした4色。全体でも色相はひとまとまりに収まる
        const [a, b, c] = [near(), near(), near()];
        offsets = [0, a, a + b, a + b + c];
        break;
      }
      case "quadEven":
        offsets = [0, 90, 180, 270];
        break;
      case "quadTriple":
      case "quadTripleFixed":
      case "quadTripleRotate": {
        // 近い3色のかたまりと、その中心から色相を離した1色
        const [a, b] = [near(), near()];
        offsets = [0, a, a + b, (a + b) / 2 + far()];
        break;
      }
      default: {
        // quadPair: 近い2色を1組にして、色相の遠いところにもう1組
        const [a, b, gap] = [near(), near(), far()];
        offsets = [0, a, gap, gap + b];
        break;
      }
    }

    return offsets.map((offset) =>
      p.color((base + offset) % 360, p.random(60, 90), p.random(75, 95)),
    );
  };

  // 帯の色の明度だけを 11 ずつ落とした5色。元の色がいちばん明るい段になる
  const shadesOf = (color: p5.Color): p5.Color[] => {
    const hue = p.hue(color);
    const saturation = p.saturation(color);
    const brightness = p.brightness(color);
    return [0, 1, 2, 3, 4].map((i) =>
      p.color(hue, saturation, brightness - (4 - i) * 11),
    );
  };

  // 三角形の通し番号。1マスあたり 0:上 1:右 2:下 3:左
  const TOP = 0;
  const RIGHT = 1;
  const BOTTOM = 2;
  const LEFT = 3;
  const indexOf = (col: number, row: number, k: number) =>
    (row * settings.gridN + col) * 4 + k;

  // 辺を共有する三角形。マス内で2つ、隣のマスとで1つの計3つ
  const neighborsOf = (index: number): number[] => {
    const k = index % 4;
    const cell = (index - k) / 4;
    const col = cell % settings.gridN;
    const row = (cell - col) / settings.gridN;

    const result: number[] = [];
    switch (k) {
      case TOP:
        result.push(indexOf(col, row, LEFT), indexOf(col, row, RIGHT));
        if (row > 0) result.push(indexOf(col, row - 1, BOTTOM));
        break;
      case RIGHT:
        result.push(indexOf(col, row, TOP), indexOf(col, row, BOTTOM));
        if (col < settings.gridN - 1) result.push(indexOf(col + 1, row, LEFT));
        break;
      case BOTTOM:
        result.push(indexOf(col, row, LEFT), indexOf(col, row, RIGHT));
        if (row < settings.gridN - 1) result.push(indexOf(col, row + 1, TOP));
        break;
      default:
        result.push(indexOf(col, row, TOP), indexOf(col, row, BOTTOM));
        if (col > 0) result.push(indexOf(col - 1, row, RIGHT));
        break;
    }
    return result;
  };

  // palette と同じ並びの、色ごとの目標面積比。0番 (埋め草) だけ設定から変える。
  // twoTone は白を使わないので、下地 + 帯の2色ぶんだけ返す
  const areaShares = () =>
    settings.mode === "twoTone"
      ? [settings.fillShare, 1]
      : [settings.fillShare, 1, 1];

  // 帯を引き直す上限。これだけ連続で失敗したらその色は打ち止めにする
  const maxRibbonAttempts = 600;

  // 0番以外を「同色どうしが maxSameNeighbors までしか触れない帯」として伸ばし、
  // 残りを0番 (白、twoTone では下地の色) で埋める
  const assignLinked = (): number[] => {
    const total = settings.gridN * settings.gridN * 4;
    const colors = new Array<number>(total).fill(-1);
    // palette と同じ並びの、色ごとの1本の帯の長さ。0番は帯にせず埋め草に使う
    const groupSizes = areaShares().map((_, i) =>
      i === 0 ? 1 : settings.ribbonLength,
    );

    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = p.floor(p.random(i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const shares = areaShares();
    const shareTotal = shares.reduce((a, b) => a + b, 0);
    const targets = shares.map((s) => (total * s) / shareTotal);
    const painted = new Array<number>(shares.length).fill(0);

    const sameCount = (index: number, color: number) => {
      let n = 0;
      for (const t of neighborsOf(index)) if (colors[t] === color) n++;
      return n;
    };

    // そこを color で塗っても、自分もまわりも上限を超えないか
    const canPaint = (index: number, color: number) => {
      if (sameCount(index, color) > settings.maxSameNeighbors) return false;
      for (const t of neighborsOf(index)) {
        if (
          colors[t] === color &&
          sameCount(t, color) >= settings.maxSameNeighbors
        ) {
          return false;
        }
      }
      return true;
    };

    const paint = (index: number, color: number) => {
      colors[index] = color;
      painted[color]++;
    };

    const unpaint = (index: number) => {
      painted[colors[index]]--;
      colors[index] = -1;
    };

    // ランダムな位置から探し始めて、同色にまだ触れていない未着色の三角形を種にする
    const findSeed = (color: number) => {
      const offset = p.floor(p.random(order.length));
      for (let i = 0; i < order.length; i++) {
        const index = order[(offset + i) % order.length];
        if (colors[index] < 0 && sameCount(index, color) === 0) return index;
      }
      return -1;
    };

    // 種から片方の端を伸ばし、行き止まりならもう片方の端を伸ばす自己回避の帯。
    // 既に同色に触れているマスは選ばないので、帯は自分自身に接触しない。
    // target に届かなければ塗りを取り消して失敗を返す(短い帯を残さない)
    const growRibbon = (color: number, target: number) => {
      const seed = findSeed(color);
      if (seed < 0) return false;

      paint(seed, color);
      const ribbon = [seed];
      const ends = [seed, seed];
      let stuck = 0;

      while (ribbon.length < target && stuck < 2) {
        const candidates = neighborsOf(ends[0]).filter(
          (n) => colors[n] < 0 && canPaint(n, color),
        );
        if (candidates.length === 0) {
          ends.reverse();
          stuck++;
          continue;
        }

        const next = candidates[p.floor(p.random(candidates.length))];
        paint(next, color);
        ribbon.push(next);
        ends[0] = next;
        stuck = 0;
      }

      if (ribbon.length < target) {
        for (const t of ribbon) unpaint(t);
        return false;
      }
      return true;
    };

    // 1. 白以外を、面積が不足している色から順に帯で敷いていく
    const ribbonColors = groupSizes
      .map((s, i) => ({ index: i, size: s }))
      .filter(({ size }) => size > 1);
    const exhausted = new Set<number>();
    const failures = new Array<number>(groupSizes.length).fill(0);

    for (;;) {
      const hungry = ribbonColors.filter(
        ({ index }) => painted[index] < targets[index] && !exhausted.has(index),
      );
      if (hungry.length === 0) break;

      const next = hungry.reduce((a, b) =>
        targets[a.index] - painted[a.index] >= targets[b.index] - painted[b.index]
          ? a
          : b,
      );

      if (growRibbon(next.index, next.size)) {
        failures[next.index] = 0;
      } else if (++failures[next.index] >= maxRibbonAttempts) {
        exhausted.add(next.index);
      }
    }

    // 2. 帯にならなかった残りはすべて埋め草の色にする。
    // ここで帯の色を使うと長さに満たない破片が大量に出るため、埋め草だけに任せる
    const background = groupSizes.findIndex((s) => s === 1);
    for (const index of order) {
      if (colors[index] < 0) paint(index, background);
    }

    return colors;
  };

  // 連結の制約なし。1三角形ずつ面積比だけを重みにして色を選ぶ
  const assignRandom = (): number[] => {
    const total = settings.gridN * settings.gridN * 4;
    const shares = areaShares();
    const shareTotal = shares.reduce((a, b) => a + b, 0);

    return Array.from({ length: total }, () => {
      let r = p.random(shareTotal);
      for (let i = 0; i < shares.length - 1; i++) {
        if (r < shares[i]) return i;
        r -= shares[i];
      }
      return shares.length - 1;
    });
  };

  // 1マスの4つの三角形に、4色をマスごとにシャッフルして1色ずつ置く
  const assignCellQuad = (): number[] => {
    const cells = settings.gridN * settings.gridN;
    const colors = new Array<number>(cells * 4);
    const slots = [0, 1, 2, 3];

    for (let cell = 0; cell < cells; cell++) {
      for (let i = 3; i > 0; i--) {
        const j = p.floor(p.random(i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      for (let k = 0; k < 4; k++) colors[cell * 4 + k] = slots[k];
    }

    return colors;
  };

  // 遠い1色 (パレットの3番) を置く場所を slotFor で決め、
  // 残りの3色はマスごとにシャッフルして空いた3つに入れる
  const assignCellFarSlot = (slotFor: (cell: number) => number): number[] => {
    const cells = settings.gridN * settings.gridN;
    const colors = new Array<number>(cells * 4);
    const near = [0, 1, 2];

    for (let cell = 0; cell < cells; cell++) {
      for (let i = 2; i > 0; i--) {
        const j = p.floor(p.random(i + 1));
        [near[i], near[j]] = [near[j], near[i]];
      }

      const far = slotFor(cell);
      let n = 0;
      for (let k = 0; k < 4; k++) {
        colors[cell * 4 + k] = k === far ? 3 : near[n++];
      }
    }

    return colors;
  };

  // 1マスの4つの三角形のうち、ランダムな2つだけを色で塗る (残りは白)
  const assignCellHalf = (): number[] => {
    const cells = settings.gridN * settings.gridN;
    const colors = new Array<number>(cells * 4).fill(0);
    const slots = [0, 1, 2, 3];

    for (let cell = 0; cell < cells; cell++) {
      for (let i = 3; i > 0; i--) {
        const j = p.floor(p.random(i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      // 白 (0番) 以外の2色からランダムに選ぶ
      for (let k = 0; k < 2; k++) {
        colors[cell * 4 + slots[k]] = 1 + p.floor(p.random(2));
      }
    }

    return colors;
  };

  // 2色を交互に、未着色の三角形からランダムに種を選んで blobSize 個の塊に育てる。
  // 育ち切れなかった袋小路もその場で塗り潰すので、白は残らない
  const assignBlobs = (): number[] => {
    const total = settings.gridN * settings.gridN * 4;
    const colors = new Array<number>(total).fill(-1);

    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = p.floor(p.random(i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let color = 0;
    let cursor = 0;
    for (;;) {
      while (cursor < order.length && colors[order[cursor]] >= 0) cursor++;
      if (cursor >= order.length) break;

      const seed = order[cursor];
      colors[seed] = color;
      let painted = 1;

      // 未着色の隣接三角形をランダムに取り込みながら目標の大きさまで育てる
      const frontier = neighborsOf(seed).filter((n) => colors[n] < 0);
      while (painted < settings.blobSize && frontier.length > 0) {
        const pick = p.floor(p.random(frontier.length));
        const [next] = frontier.splice(pick, 1);
        if (colors[next] >= 0) continue;

        colors[next] = color;
        painted++;
        for (const n of neighborsOf(next)) if (colors[n] < 0) frontier.push(n);
      }

      // 色A -> 色B -> 色A ... と交互に塗る
      color = 1 - color;
    }

    return colors;
  };

  const paletteForMode = (): p5.Color[] => {
    // quad* だけ4色。twoTone / blobs は白を捨てて2色で塗る
    if (settings.mode === "none" && isQuadStyle(settings.cellStyle)) {
      return generateQuadPalette(settings.cellStyle);
    }
    if (settings.mode === "twoTone" || settings.mode === "blobs") {
      return generatePalette().slice(1);
    }
    return generatePalette();
  };

  const assignForMode = (): number[] => {
    if (settings.mode === "blobs") return assignBlobs();
    if (settings.mode !== "none") return assignLinked();
    if (
      settings.cellStyle === "quadTripleFixed" ||
      settings.cellStyle === "quadShadeFixed"
    ) {
      // どのマスでも同じ位置。位置は描くたびにランダムに決める
      const slot = p.floor(p.random(4));
      return assignCellFarSlot(() => slot);
    }
    if (settings.cellStyle === "quadTripleRotate") {
      // 上 -> 右 -> 下 -> 左 の順に1マスずつずらす。起点はランダム
      const start = p.floor(p.random(4));
      return assignCellFarSlot((cell) => (start + cell) % 4);
    }
    if (isQuadStyle(settings.cellStyle)) return assignCellQuad();
    if (settings.cellStyle === "half") return assignCellHalf();
    return assignRandom();
  };

  const drawGrid = () => {
    const palette = paletteForMode();
    const colors = assignForMode();

    // 明度違いを使うときは、帯を構成する三角形1つごとに5色から1色を選ぶ
    const shades =
      settings.mode === "twoTone" && settings.shadedRibbons
        ? shadesOf(palette[1])
        : null;

    p.background(0, 0, 100);
    p.noStroke();

    for (let row = 0; row < settings.gridN; row++) {
      for (let col = 0; col < settings.gridN; col++) {
        const triangles = cellTriangles(col, row);
        for (let k = 0; k < triangles.length; k++) {
          const [x1, y1, x2, y2, x3, y3] = triangles[k];
          const index = indexOf(col, row, k);
          // 0番は埋め草 (下地)。帯の三角形だけ明度違いから選ぶ
          p.fill(
            shades && colors[index] > 0
              ? shades[p.floor(p.random(shades.length))]
              : palette[colors[index]],
          );
          p.triangle(x1, y1, x2, y2, x3, y3);
        }
      }
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
      "マス数",
      [
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

    // 帯まわりの設定は連結させるパターンのときだけ意味があるので、まとめて出し入れする
    const ribbonFields: p5.Element[] = [];

    addSelect<PatternMode>(
      panel,
      "塗り方",
      [
        ["白 + 2色 / 連結あり", "linked"],
        ["白 + 2色 / 連結なし", "none"],
        ["下地 + 帯 / 白なし", "twoTone"],
        ["2色の塊 / 白なし", "blobs"],
      ],
      settings.mode,
      (value) => {
        settings.mode = value;
        applyMode();
        drawGrid();
      },
    );

    ribbonFields.push(
      addSelect<string>(
        panel,
        "同色の隣接上限",
        [
          ["2 / 幅1の帯", "2"],
          ["3 / 塊", "3"],
        ],
        String(settings.maxSameNeighbors),
        (value) => {
          settings.maxSameNeighbors = Number(value);
          drawGrid();
        },
      ).field,
      addSelect<string>(
        panel,
        "帯の長さ",
        [8, 16, 24, 40, 80, 160, 320, 400, 640, 800].map(
          (n) => [String(n), String(n)] as [string, string],
        ),
        String(settings.ribbonLength),
        (value) => {
          settings.ribbonLength = Number(value);
          drawGrid();
        },
      ).field,
    );

    const cellField = addSelect<CellStyle>(
      panel,
      "1マスの塗り分け",
      [
        ["標準 / 面積比でランダム", "plain"],
        ["A / 近い2色 + 遠い2色", "quadPair"],
        ["B / 4つのうち2つだけ", "half"],
        ["C / 近い4色", "quadNear"],
        ["D / 色相が均等な4色", "quadEven"],
        ["E / 近い3色 + 遠い1色", "quadTriple"],
        ["E-2 / 遠い1色は同じ位置", "quadTripleFixed"],
        ["E-3 / 遠い1色を時計回りに", "quadTripleRotate"],
        ["E-2b / 明度違い3色 + 遠い1色", "quadShadeFixed"],
      ],
      settings.cellStyle,
      (value) => {
        settings.cellStyle = value;
        applyMode();
        drawGrid();
      },
    ).field;

    const blobField = addSelect<string>(
      panel,
      "塊の大きさ",
      [25, 50, 100, 200, 400].map((n) => [String(n), String(n)] as [string, string]),
      String(settings.blobSize),
      (value) => {
        settings.blobSize = Number(value);
        drawGrid();
      },
    ).field;

    const shadeField = addSelect<string>(
      panel,
      "帯の色",
      [
        ["単色", "solid"],
        ["明度違い5色", "shades"],
      ],
      settings.shadedRibbons ? "shades" : "solid",
      (value) => {
        settings.shadedRibbons = value === "shades";
        drawGrid();
      },
    ).field;

    // 埋め草 (白 / 下地) と帯の色の面積比。見出しだけパターンによって変える
    const share = addSelect<string>(
      panel,
      "白 : 色",
      [
        ["0.5 : 1", "0.5"],
        ["1 : 1", "1"],
        ["2 : 1", "2"],
        ["3 : 1", "3"],
      ],
      String(settings.fillShare),
      (value) => {
        settings.fillShare = Number(value);
        drawGrid();
      },
    );

    const applyMode = () => {
      const ribbonMode =
        settings.mode === "linked" || settings.mode === "twoTone";
      for (const field of ribbonFields) {
        field.style("display", ribbonMode ? "flex" : "none");
      }
      cellField.style("display", settings.mode === "none" ? "flex" : "none");
      blobField.style("display", settings.mode === "blobs" ? "flex" : "none");
      // 明度違いは「帯が1色」の twoTone でだけ意味がある
      shadeField.style("display", settings.mode === "twoTone" ? "flex" : "none");
      // blobs は塊で全面を埋め、A / B はマス単位で色数と白の量が決まるので面積比は使わない
      const usesShare =
        settings.mode !== "blobs" &&
        (settings.mode !== "none" || settings.cellStyle === "plain");
      share.field.style("display", usesShare ? "flex" : "none");
      share.label.html(settings.mode === "twoTone" ? "下地 : 帯" : "白 : 色");
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
      p.saveCanvas(`triangle-grid-${settings.gridN}-${Date.now()}`, "png");
    }
  };
};
