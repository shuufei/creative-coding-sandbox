import type p5 from "p5";

// @types/p5 の createSelect / createCheckbox は p5.Element を返すだけで、
// select や checkbox 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};
type CheckboxElement = p5.Element & {
  checked(value?: boolean): boolean;
  changed(handler: () => void): void;
};

type Point = { x: number; y: number };

// 正n角形とランダムな辺の長さのn角形をそれぞれ用意する。
// 円と楕円は「歪みのない/歪んだ」の対として扱う
type Kind =
  | "circle"
  | "ellipse"
  | "triangle"
  | "triangleRandom"
  | "square"
  | "squareRandom"
  | "pentagon"
  | "pentagonRandom"
  | "hexagon"
  | "hexagonRandom";

const KINDS: [Kind, string][] = [
  ["circle", "正円"],
  ["ellipse", "楕円"],
  ["triangle", "正三角形"],
  ["triangleRandom", "三角形 (ランダム)"],
  ["square", "正方形"],
  ["squareRandom", "四角形 (ランダム)"],
  ["pentagon", "正五角形"],
  ["pentagonRandom", "五角形 (ランダム)"],
  ["hexagon", "正六角形"],
  ["hexagonRandom", "六角形 (ランダム)"],
];

// 透過は乗算で重ねて、重なった部分に別の色を作る。
// ベタ塗りは不透明なので、後から描いた形が前の形を隠す
type FillMode = "transparent" | "solid";

// random は色相を振ったランダムな配色、gray は明度だけを変えたグレー、
// whiteGray はそのグレーに白を足したもの
type PaletteMode = "random" | "gray" | "whiteGray";

// 色相だけを固定して持つ。彩度と明度は塗り方や形の数に合わせて render 側で決める
type Swatch = { hue: number; sat: number; bright: number };

// inner は原点を中心にした内接円の半径。
// 2つの形の中心間距離が inner1 + inner2 以下なら、必ず重なる。
// outer は外接円の半径で、canvas からはみ出すかの判定に使う
type Shape = {
  kind: Kind;
  x: number;
  y: number;
  // 多角形は回転込みの頂点をそのまま持つ (中心が原点)
  verts: Point[];
  // 円・楕円用。rotation は楕円の傾き
  rx: number;
  ry: number;
  rotation: number;
  inner: number;
  outer: number;
  color: number;
};

export const randomGeometrySketch = (p: p5) => {
  const size = 1000;
  const margin = 30;

  // ---- 設定 -------------------------------------------------------------
  let shapeCount = 10;
  let colorCount = 3;
  let paletteMode: PaletteMode = "random";
  let fillMode: FillMode = "transparent";
  // グレーの明度の範囲。上下を空けて、白背景にも黒に潰れる手前にも寄せない
  const grayLow = 28;
  const grayHigh = 88;
  const white: Swatch = { hue: 0, sat: 0, bright: 100 };
  // 使う形。空にはできない (最後の1つはチェックを外せない)
  const enabledKinds = new Set<Kind>(KINDS.map(([kind]) => kind));

  // 形の大きさ。数が増えるほど小さくする。
  // ただし 1/√n まで小さくすると canvas が埋まらないので、縮み方はゆるめにしている
  const baseRadius = () => (size * 0.52) / Math.pow(shapeCount, 0.42);
  // 中心間距離を inner の和の何倍にするか。
  // 1 に近いほど接するだけ、小さいほど深く重なる
  const overlapMin = 0.3;
  const overlapMax = 1.0;

  let shapes: Shape[] = [];
  let swatches: Swatch[] = [];

  // ---- 形の生成 ---------------------------------------------------------
  const randomKind = (): Kind => {
    const kinds = [...enabledKinds];
    return kinds[p.floor(p.random(kinds.length))];
  };

  // 原点から線分までの距離。多角形の内接円を求めるのに使う
  const distToSegment = (a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    // 頂点が重なっている場合はその点までの距離
    if (lenSq === 0) return Math.hypot(a.x, a.y);
    const t = p.constrain((-a.x * dx - a.y * dy) / lenSq, 0, 1);
    return Math.hypot(a.x + dx * t, a.y + dy * t);
  };

  // n 角形の頂点を作る。random なら角度と半径を振って辺の長さを不揃いにする
  const polygonVerts = (n: number, radius: number, random: boolean): Point[] => {
    const rotation = p.random(p.TWO_PI);
    const step = p.TWO_PI / n;
    return [...Array(n)].map((_, i) => {
      // 角度のずれは step の 1/6 まで。これ以上振ると頂点の順序が崩れて自己交差する
      const jitter = random ? p.random(-step / 6, step / 6) : 0;
      const r = random ? radius * p.random(0.55, 1) : radius;
      const angle = rotation + step * i + jitter;
      return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    });
  };

  const makeShape = (kind: Kind, radius: number): Shape => {
    const base = {
      kind,
      x: 0,
      y: 0,
      verts: [] as Point[],
      rx: 0,
      ry: 0,
      rotation: 0,
      color: 0,
    };

    if (kind === "circle" || kind === "ellipse") {
      const rx = radius;
      // 楕円は片側を潰す。円は縦横同じ
      const ry = kind === "ellipse" ? radius * p.random(0.4, 0.8) : radius;
      return {
        ...base,
        rx,
        ry,
        rotation: kind === "ellipse" ? p.random(p.TWO_PI) : 0,
        inner: Math.min(rx, ry),
        outer: Math.max(rx, ry),
      };
    }

    const n =
      kind === "triangle" || kind === "triangleRandom"
        ? 3
        : kind === "square" || kind === "squareRandom"
          ? 4
          : kind === "pentagon" || kind === "pentagonRandom"
            ? 5
            : 6;
    const isRandom = kind.endsWith("Random");
    const verts = polygonVerts(n, radius, isRandom);

    const inner = verts.reduce(
      (min, v, i) => Math.min(min, distToSegment(v, verts[(i + 1) % n])),
      Infinity,
    );
    const outer = verts.reduce((max, v) => Math.max(max, Math.hypot(v.x, v.y)), 0);

    return { ...base, verts, inner, outer };
  };

  // ---- 配置 -------------------------------------------------------------
  // canvas からはみ出さないか。円・楕円は傾いた楕円の外接矩形で見る
  const inBounds = (shape: Shape) => {
    let halfW = shape.outer;
    let halfH = shape.outer;
    if (shape.kind === "circle" || shape.kind === "ellipse") {
      const c = Math.cos(shape.rotation);
      const s = Math.sin(shape.rotation);
      halfW = Math.hypot(shape.rx * c, shape.ry * s);
      halfH = Math.hypot(shape.rx * s, shape.ry * c);
    } else {
      halfW = shape.verts.reduce((m, v) => Math.max(m, Math.abs(v.x)), 0);
      halfH = shape.verts.reduce((m, v) => Math.max(m, Math.abs(v.y)), 0);
    }
    return (
      shape.x - halfW >= margin &&
      shape.x + halfW <= size - margin &&
      shape.y - halfH >= margin &&
      shape.y + halfH <= size - margin
    );
  };

  const build = () => {
    shapes = [];
    const radius = baseRadius();

    // 1つ目は中央寄りに置く。ここから外へ伸ばしていく
    const first = makeShape(randomKind(), radius * p.random(0.7, 1.3));
    first.x = size / 2 + p.random(-size * 0.1, size * 0.1);
    first.y = size / 2 + p.random(-size * 0.1, size * 0.1);
    shapes.push(first);

    for (let i = 1; i < shapeCount; i++) {
      const placed = placeNext(radius);
      if (placed) shapes.push(placed);
    }
  };

  // 既にある形のどれかに必ず接する/重なる位置へ、新しい形を置く
  const placeNext = (radius: number): Shape | null => {
    for (let attempt = 0; attempt < 400; attempt++) {
      // 置き場所が見つからないときは、だんだん小さくして隙間に入れる
      const shrink = attempt < 150 ? 1 : Math.max(0.25, 1 - attempt / 400);

      // canvas 上のランダムな一点を狙い、そこに一番近い形から生やす。
      // アンカーも向きも完全にランダムにすると最初の形の周りに固まるので、
      // 狙いを canvas 全体に散らして、かたまりが外へ伸びるようにする
      const target = {
        x: p.random(margin, size - margin),
        y: p.random(margin, size - margin),
      };
      const anchor = shapes.reduce((near, s) =>
        Math.hypot(s.x - target.x, s.y - target.y) <
        Math.hypot(near.x - target.x, near.y - target.y)
          ? s
          : near,
      );

      const shape = makeShape(randomKind(), radius * p.random(0.7, 1.3) * shrink);

      // 中心間距離を内接円の和以下にすると、確実に重なる。
      // 和ちょうど = 内接円が接する状態で、実際の輪郭はわずかに重なる
      const gap = (anchor.inner + shape.inner) * p.random(overlapMin, overlapMax);
      // 狙った点の方向へ、±35度ほどばらして置く
      const toTarget = Math.atan2(target.y - anchor.y, target.x - anchor.x);
      const angle = toTarget + p.random(-p.PI / 5, p.PI / 5);
      shape.x = anchor.x + Math.cos(angle) * gap;
      shape.y = anchor.y + Math.sin(angle) * gap;

      if (inBounds(shape)) return shape;
    }
    return null;
  };

  // ---- 色 ---------------------------------------------------------------
  const randomSwatches = (): Swatch[] => {
    // 色相は円周を等分した位置から少しずらす。近すぎる2色にならない
    const offset = p.random(360);
    const step = 360 / colorCount;
    return [...Array(colorCount)].map((_, i) => ({
      hue: (offset + step * i + p.random(-step * 0.2, step * 0.2)) % 360,
      sat: p.random(58, 78),
      bright: p.random(86, 98),
    }));
  };

  // 色相を持たず明度だけを変えたグレー。
  // 明度は範囲を等分した位置から少しずらす。近すぎる2つにならない
  const graySwatches = (): Swatch[] => {
    const step = (grayHigh - grayLow) / (colorCount - 1);
    const grays = [...Array(colorCount)].map((_, i) => ({
      hue: 0,
      sat: 0,
      bright: grayLow + step * i + p.random(-step * 0.15, step * 0.15),
    }));

    return paletteMode === "whiteGray" ? [white, ...grays] : grays;
  };

  const recolor = () => {
    swatches = paletteMode === "random" ? randomSwatches() : graySwatches();

    assignColors();
  };

  // どの形にどの色を割り当てるか。形を作り直したときは、
  // 配色 (swatches) はそのままにこれだけを引き直す
  const assignColors = () => {
    for (const shape of shapes) shape.color = p.floor(p.random(swatches.length));
  };

  // 塗り方に合わせて実際の色を作る。色相は変えないので、
  // 塗り方を切り替えても同じ配色のまま見比べられる
  const paletteFor = (mode: FillMode): p5.Color[] =>
    swatches.map((s) => {
      if (mode === "solid") return p.color(s.hue, s.sat, s.bright);
      // 乗算は重なるほど暗くなる。形が多いときは薄い色にして潰れないようにする
      const dense = shapeCount >= 50;
      // 白は白のまま。乗算では下に何も影響しないので、形が抜けたように見える
      if (s.bright >= 100) return p.color(0, 0, 100);
      // グレーは下げる彩度がないので、代わりに明度の幅を上に寄せて潰れないようにする
      if (s.sat === 0) {
        return p.color(
          0,
          0,
          p.map(s.bright, grayLow, grayHigh, dense ? 68 : 52, 97),
        );
      }
      return p.color(
        s.hue,
        s.sat * (dense ? 0.5 : 0.85),
        Math.min(100, s.bright + (dense ? 6 : 2)),
      );
    });

  // ---- 描画 -------------------------------------------------------------
  const render = () => {
    const palette = paletteFor(fillMode);

    p.blendMode(p.BLEND);
    p.background(0, 0, 100);
    p.noStroke();
    // 透過 (乗算) で重ねると、重なった部分だけ別の色になり、偶発的な形が浮かぶ。
    // ベタ塗りは通常合成なので、後の形に隠されて残った輪郭が偶発的な形になる
    if (fillMode === "transparent") p.blendMode(p.MULTIPLY);

    for (const shape of shapes) {
      p.fill(palette[shape.color]);
      if (shape.kind === "circle" || shape.kind === "ellipse") {
        p.push();
        p.translate(shape.x, shape.y);
        p.rotate(shape.rotation);
        p.ellipse(0, 0, shape.rx * 2, shape.ry * 2);
        p.pop();
        continue;
      }
      p.beginShape();
      for (const v of shape.verts) p.vertex(shape.x + v.x, shape.y + v.y);
      p.endShape(p.CLOSE);
    }

    p.blendMode(p.BLEND);
  };

  const regenerate = () => {
    build();
    recolor();
    render();
  };

  // 配色はそのままに、形の種類・大きさ・配置だけを引き直す
  const regenerateShapes = () => {
    build();
    assignColors();
    render();
  };

  // 形はそのままに、配色だけを引き直す
  const regenerateColors = () => {
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

  const addButtons = (parent: p5.Element, buttons: [string, () => void][]) => {
    const field = p.createDiv();
    field.parent(parent);
    field.style("display", "flex");
    field.style("flex-direction", "column");
    field.style("gap", "6px");

    const label = p.createDiv("再生成");
    label.parent(field);
    labelStyle(label);

    const row = p.createDiv();
    row.parent(field);
    row.style("display", "flex");
    row.style("gap", "8px");

    for (const [text, onPress] of buttons) {
      const button = p.createButton(text);
      button.parent(row);
      button.style("padding", "6px 12px");
      button.style("font", "13px sans-serif");
      button.style("background", "#1c1c1c");
      button.style("color", "#eee");
      button.style("border", "1px solid #444");
      button.style("border-radius", "4px");
      button.style("cursor", "pointer");
      button.mousePressed(onPress);
    }
  };

  // 使う形のチェックボックス群。最後の1つは外せないようにして、必ず1種類は残す
  const addKindChecks = (parent: p5.Element) => {
    const field = p.createDiv();
    field.parent(parent);
    field.style("display", "flex");
    field.style("flex-direction", "column");
    field.style("gap", "6px");

    const label = p.createDiv("使う形");
    label.parent(field);
    labelStyle(label);

    const list = p.createDiv();
    list.parent(field);
    list.style("display", "grid");
    list.style("grid-template-columns", "repeat(5, max-content)");
    list.style("gap", "4px 18px");

    for (const [kind, text] of KINDS) {
      const box = p.createCheckbox(text, enabledKinds.has(kind)) as CheckboxElement;
      box.parent(list);
      labelStyle(box);
      box.style("display", "flex");
      box.style("align-items", "center");
      box.style("gap", "6px");
      box.changed(() => {
        if (box.checked()) {
          enabledKinds.add(kind);
        } else if (enabledKinds.size === 1) {
          // 全部外すと形を選べなくなるので、チェックを戻して何もしない
          box.checked(true);
          return;
        } else {
          enabledKinds.delete(kind);
        }
        regenerate();
      });
    }
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
      "使う形の数",
      [
        ["5", "5"],
        ["10", "10"],
        ["50", "50"],
        ["100", "100"],
      ],
      String(shapeCount),
      (value) => {
        shapeCount = Number(value);
        regenerate();
      },
    );

    addSelect<string>(
      panel,
      "塗る色",
      [
        ["ランダムな1色", "1"],
        ["ランダムな2色", "2"],
        ["ランダムな3色", "3"],
        ["ランダムな4色", "4"],
        ["明度の異なるグレー2つ", "gray2"],
        ["明度の異なるグレー3つ", "gray3"],
        ["白 + 明度の異なるグレー2つ", "whiteGray2"],
        ["白 + 明度の異なるグレー3つ", "whiteGray3"],
      ],
      // グレー系は「モード名 + グレーの数」を値にしている
      paletteMode === "random" ? String(colorCount) : `${paletteMode}${colorCount}`,
      (value) => {
        // 配置は保ったまま塗り分けだけをやり直す
        paletteMode = value.startsWith("whiteGray")
          ? "whiteGray"
          : value.startsWith("gray")
            ? "gray"
            : "random";
        colorCount = Number(value.replace(/^(whiteGray|gray)/, ""));
        recolor();
        render();
      },
    );

    addSelect<FillMode>(
      panel,
      "塗り方",
      [
        ["透過 (乗算)", "transparent"],
        ["ベタ塗り", "solid"],
      ],
      fillMode,
      (value) => {
        // 配置も色相もそのまま。塗り方だけを差し替えて描き直す
        fillMode = value;
        render();
      },
    );

    addButtons(panel, [
      ["形だけ (f)", regenerateShapes],
      ["色だけ (c)", regenerateColors],
    ]);

    addKindChecks(panel);

    const hint = p.createDiv(
      "canvas をクリックで全部再生成 / f 形だけ / c 色だけ / s キーで PNG 保存",
    );
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
    if (p.key === "f" || p.key === "F") {
      regenerateShapes();
      return;
    }
    if (p.key === "c" || p.key === "C") {
      regenerateColors();
      return;
    }
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(
        `random-geometry-${shapeCount}-${colorCount}-${fillMode}-${Date.now()}`,
        "png",
      );
    }
  };
};
