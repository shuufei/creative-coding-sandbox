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

// 配置の仕方。overlap は必ず重なる、touch は輪郭が触れるだけ、
// separate は重なりも接触もしない、free は制約なしのランダム
type PlaceMode = "overlap" | "touch" | "separate" | "free";

// 透過は乗算で重ねて、重なった部分に別の色を作る。
// ベタ塗りは不透明なので、後から描いた形が前の形を隠す
type FillMode = "transparent" | "solid";

// random は色相を振ったランダムな配色、gray は明度だけを変えたグレー、
// whiteGray はそのグレーに白を足したもの。
// tint は色相を固定して明度だけを段階的に変えたもの (色相ごとに tintSteps 色)
type PaletteMode = "random" | "gray" | "whiteGray" | "tint";

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
  // 当たり判定用の輪郭 (中心が原点)。多角形は verts そのもの、
  // 円・楕円は多角形で近似したもの
  poly: Point[];
  // 円・楕円用。rotation は楕円の傾き
  rx: number;
  ry: number;
  rotation: number;
  inner: number;
  outer: number;
  color: number;
};

// 当たり判定に必要な分だけを取り出したもの。隙間を空けるときは
// 輪郭を膨らませた仮の Body を作って判定する
type Body = { x: number; y: number; inner: number; outer: number; poly: Point[] };

// 円・楕円を当たり判定用の多角形にするときの分割数
const ELLIPSE_SAMPLES = 32;

export const randomGeometrySketch = (p: p5) => {
  const size = 1000;
  const margin = 30;

  // ---- 設定 -------------------------------------------------------------
  let shapeCount = 10;
  let colorCount = 3;
  let paletteMode: PaletteMode = "random";
  let placeMode: PlaceMode = "overlap";
  let fillMode: FillMode = "transparent";
  // グレーの明度の範囲。上下を空けて、白背景にも黒に潰れる手前にも寄せない
  const grayLow = 28;
  const grayHigh = 88;
  const white: Swatch = { hue: 0, sat: 0, bright: 100 };
  // 明度バリエーションの範囲と段階数。グレーより下まで振って、濃淡の幅を広く取る
  const tintLow = 30;
  const tintHigh = 92;
  const tintSteps = 5;
  // 使う形。空にはできない (最後の1つはチェックを外せない)
  const enabledKinds = new Set<Kind>(KINDS.map(([kind]) => kind));

  // 形の大きさ。数が増えるほど小さくする。
  // ただし 1/√n まで小さくすると canvas が埋まらないので、縮み方はゆるめにしている。
  // 重ならない置き方は形が場所を食い合うので、
  // 総面積が canvas の一定割合に収まる大きさ (= 1/√n) にしないと置き切れない
  const baseRadius = () => {
    if (placeMode === "touch" || placeMode === "separate") {
      const fill = placeMode === "touch" ? 0.55 : 0.42;
      return Math.sqrt((size * size * fill) / (Math.PI * shapeCount));
    }
    return (size * 0.52) / Math.pow(shapeCount, 0.42);
  };
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

  // 円・楕円の当たり判定用の多角形。外接させて、判定が実際の輪郭より
  // 内側に入らない (= 気付かない重なりが残らない) ようにする
  const ellipsePoly = (rx: number, ry: number, rotation: number): Point[] => {
    const scale = 1 / Math.cos(Math.PI / ELLIPSE_SAMPLES);
    const c = Math.cos(rotation);
    const sn = Math.sin(rotation);
    return [...Array(ELLIPSE_SAMPLES)].map((_, i) => {
      const angle = (p.TWO_PI / ELLIPSE_SAMPLES) * i;
      const x = Math.cos(angle) * rx * scale;
      const y = Math.sin(angle) * ry * scale;
      return { x: x * c - y * sn, y: x * sn + y * c };
    });
  };

  const outerOf = (poly: Point[]) =>
    poly.reduce((max, v) => Math.max(max, Math.hypot(v.x, v.y)), 0);

  const makeShape = (kind: Kind, radius: number): Shape => {
    const base = {
      kind,
      x: 0,
      y: 0,
      verts: [] as Point[],
      poly: [] as Point[],
      rx: 0,
      ry: 0,
      rotation: 0,
      color: 0,
    };

    if (kind === "circle" || kind === "ellipse") {
      const rx = radius;
      // 楕円は片側を潰す。円は縦横同じ
      const ry = kind === "ellipse" ? radius * p.random(0.4, 0.8) : radius;
      const rotation = kind === "ellipse" ? p.random(p.TWO_PI) : 0;
      const poly = ellipsePoly(rx, ry, rotation);
      return {
        ...base,
        rx,
        ry,
        rotation,
        poly,
        inner: Math.min(rx, ry),
        outer: outerOf(poly),
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
    return { ...base, verts, poly: verts, inner, outer: outerOf(verts) };
  };

  // ---- 当たり判定 -------------------------------------------------------
  // o から見た a, b の外積。符号で a→b がどちら回りかが分かる
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // 線分 ab と cd が交わるか。互いに相手をまたいでいれば交差している
  const segmentsCross = (a: Point, b: Point, c: Point, d: Point) =>
    cross(a, b, c) > 0 !== cross(a, b, d) > 0 &&
    cross(c, d, a) > 0 !== cross(c, d, b) > 0;

  // 点が多角形の内側にあるか。右方向へ伸ばした半直線と辺の交差数で判定する
  const pointInPoly = (pt: Point, poly: Point[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (
        a.y > pt.y !== b.y > pt.y &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
    return inside;
  };

  // 2つの形が重なっているか。
  // 外接円が離れていれば重ならないし、内接円が重なっていれば必ず重なる。
  // どちらでもないときだけ輪郭同士を突き合わせる
  const overlaps = (a: Body, b: Body) => {
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (dist >= a.outer + b.outer) return false;
    if (dist <= a.inner + b.inner) return true;

    const pa = a.poly.map((v) => ({ x: a.x + v.x, y: a.y + v.y }));
    const pb = b.poly.map((v) => ({ x: b.x + v.x, y: b.y + v.y }));
    for (let i = 0; i < pa.length; i++) {
      const a1 = pa[i];
      const a2 = pa[(i + 1) % pa.length];
      for (let j = 0; j < pb.length; j++) {
        if (segmentsCross(a1, a2, pb[j], pb[(j + 1) % pb.length])) return true;
      }
    }
    // 輪郭が交わらないなら、片方がもう片方に丸ごと入っているときだけ重なっている
    return pointInPoly(pa[0], pb) || pointInPoly(pb[0], pa);
  };

  // 輪郭を外へ膨らませた判定用の形。これが他と重ならなければ、
  // 元の形との間に amount 以上の隙間がある
  const inflate = (shape: Shape, amount: number): Body => ({
    x: shape.x,
    y: shape.y,
    inner: shape.inner + amount,
    outer: shape.outer + amount,
    poly: shape.poly.map((v) => {
      const len = Math.hypot(v.x, v.y) || 1;
      const scale = 1 + amount / len;
      return { x: v.x * scale, y: v.y * scale };
    }),
  });

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

  // アンカーから angle の向きへ、中心間距離 gap の位置に置く
  const setPosition = (shape: Shape, anchor: Shape, angle: number, gap: number) => {
    shape.x = anchor.x + Math.cos(angle) * gap;
    shape.y = anchor.y + Math.sin(angle) * gap;
  };

  // 輪郭がちょうど触れる中心間距離を二分探索で求める。
  // 内接円の和は必ず重なり、外接円の和は必ず離れるので、その間に境目がある。
  // touching は触れている側、apart は離れている側の値
  const touchDistance = (anchor: Shape, shape: Shape, angle: number) => {
    let touching = anchor.inner + shape.inner;
    let apart = anchor.outer + shape.outer;
    // 0.5px まで詰めれば、見た目には接している
    while (apart - touching > 0.5) {
      const mid = (touching + apart) / 2;
      setPosition(shape, anchor, angle, mid);
      if (overlaps(shape, anchor)) touching = mid;
      else apart = mid;
    }
    return { touching, apart };
  };

  // 既にある形との関係が placeMode を満たす位置へ、新しい形を置く
  const placeNext = (radius: number): Shape | null => {
    for (let attempt = 0; attempt < 400; attempt++) {
      // 置き場所が見つからないときは、だんだん小さくして隙間に入れる
      const shrink = attempt < 150 ? 1 : Math.max(0.25, 1 - attempt / 400);
      const shape = makeShape(randomKind(), radius * p.random(0.7, 1.3) * shrink);

      // canvas 上のランダムな一点を狙い、そこに一番近い形から生やす。
      // アンカーも向きも完全にランダムにすると最初の形の周りに固まるので、
      // 狙いを canvas 全体に散らして、かたまりが外へ伸びるようにする
      const target = {
        x: p.random(margin, size - margin),
        y: p.random(margin, size - margin),
      };

      // 制約なしは狙った点にそのまま置く。他の形とは無関係に散らばる
      if (placeMode === "free") {
        shape.x = target.x;
        shape.y = target.y;
        if (inBounds(shape)) return shape;
        continue;
      }

      const anchor = shapes.reduce((near, s) =>
        Math.hypot(s.x - target.x, s.y - target.y) <
        Math.hypot(near.x - target.x, near.y - target.y)
          ? s
          : near,
      );
      // 狙った点の方向へ、±36度ほどばらして置く
      const toTarget = Math.atan2(target.y - anchor.y, target.x - anchor.x);
      const angle = toTarget + p.random(-p.PI / 5, p.PI / 5);

      if (placeMode === "overlap") {
        // 中心間距離を内接円の和以下にすると、確実に重なる。
        // 和ちょうど = 内接円が接する状態で、実際の輪郭はわずかに重なる
        const gap = (anchor.inner + shape.inner) * p.random(overlapMin, overlapMax);
        setPosition(shape, anchor, angle, gap);
        if (inBounds(shape)) return shape;
        continue;
      }

      const { touching, apart } = touchDistance(anchor, shape, angle);
      // 隙間は小さい方の内接円を基準にする。形の大きさに対して同じ比率になる
      const room = Math.min(anchor.inner, shape.inner) * p.random(0.12, 0.45);
      setPosition(shape, anchor, angle, placeMode === "touch" ? touching : apart + room);
      if (!inBounds(shape)) continue;

      // アンカー以外と触れていないか。離して置くときは、
      // 膨らませた輪郭で判定して他との間にも隙間を残す
      const clearance = placeMode === "separate" ? inflate(shape, room * 0.8) : shape;
      const hit = shapes.some((other) =>
        // 接して置くときに触れてよいのはアンカーだけ。
        // 離して置くときはアンカーとも重ならない (apart は離れている側の値)
        other === anchor
          ? placeMode === "separate" && overlaps(shape, other)
          : overlaps(clearance, other),
      );
      if (!hit) return shape;
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

  // 色相を固定して明度だけを振ったもの。colorCount は色相の数 (1 か 2)。
  // 色相が2つのときは色相環の反対側に置いて、離れた2系統の濃淡にする
  const tintSwatches = (): Swatch[] => {
    const offset = p.random(360);
    const step = (tintHigh - tintLow) / (tintSteps - 1);
    return [...Array(colorCount)].flatMap((_, h) => {
      const hue = (offset + (360 / colorCount) * h + p.random(-24, 24)) % 360;
      return [...Array(tintSteps)].map((_, i) => {
        // 明度は等分した位置から少しずらす。近すぎる2段にならない
        const bright = tintLow + step * i + p.random(-step * 0.15, step * 0.15);
        // 暗いほど濃く、明るいほど淡く。同じ彩度のまま明度だけ振ると
        // 明るい側が生っぽくなるので、明度に合わせて彩度も落とす
        return { hue, sat: p.map(bright, tintLow, tintHigh, 88, 40), bright };
      });
    });
  };

  const recolor = () => {
    swatches =
      paletteMode === "random"
        ? randomSwatches()
        : paletteMode === "tint"
          ? tintSwatches()
          : graySwatches();

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
      // 明度バリエーションは暗い側が乗算で真っ黒に潰れるので、
      // グレーと同じように明度の幅を上に寄せ、彩度も落として重なりを残す
      if (paletteMode === "tint") {
        return p.color(
          s.hue,
          s.sat * (dense ? 0.45 : 0.7),
          p.map(s.bright, tintLow, tintHigh, dense ? 74 : 60, 97),
        );
      }
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
        ["300", "300"],
        ["500", "500"],
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
        ["ランダムな1色 x 明度5段階", "tint1"],
        ["ランダムな2色 x 明度5段階", "tint2"],
      ],
      // グレー系と明度バリエーションは「モード名 + 色数」を値にしている
      paletteMode === "random" ? String(colorCount) : `${paletteMode}${colorCount}`,
      (value) => {
        // 配置は保ったまま塗り分けだけをやり直す
        paletteMode = value.startsWith("whiteGray")
          ? "whiteGray"
          : value.startsWith("gray")
            ? "gray"
            : value.startsWith("tint")
              ? "tint"
              : "random";
        colorCount = Number(value.replace(/^(whiteGray|gray|tint)/, ""));
        recolor();
        render();
      },
    );

    addSelect<PlaceMode>(
      panel,
      "配置",
      [
        ["重なり合う", "overlap"],
        ["接する", "touch"],
        ["重なりも接しもしない", "separate"],
        ["制約なし", "free"],
      ],
      placeMode,
      (value) => {
        // 配色はそのままにして、置き方の違いだけを見比べられるようにする
        placeMode = value;
        regenerateShapes();
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
        `random-geometry-${shapeCount}-${colorCount}-${placeMode}-${fillMode}-${Date.now()}`,
        "png",
      );
    }
  };
};
