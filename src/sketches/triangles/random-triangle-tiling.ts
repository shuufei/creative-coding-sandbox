import type p5 from "p5";

type Pt = { x: number; y: number };
// parent は「どの三角形から生えたか」。色を塊にするときに参照する
type Tri = { a: number; b: number; c: number; parent: number };

// @types/p5 の createSelect は p5.Element を返すだけで、select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

type StrokeMode = "black" | "gray" | "none";
type PaletteMode = "white2" | "white1" | "color2";

export const randomTriangleTilingSketch = (p: p5) => {
  const width = 1000;
  const height = 1000;
  const margin = 60;

  // 最初の三角形の一辺の目安。最後に全体を canvas に合わせて拡縮する
  const baseLength = 60;

  const EPS = 1e-3;

  // ---- 設定 -------------------------------------------------------------
  let strokeMode: StrokeMode = "black";
  let paletteMode: PaletteMode = "white2";
  let triangleCount = 100;

  // 三角形の集合。辺を共有しながら育てるので、隣り合う三角形の間に隙間はできない
  let points: Pt[] = [];
  let tris: Tri[] = [];
  // 辺 -> その辺を使っている三角形のインデックス。1つだけなら外周の辺
  let edgeTris = new Map<string, number[]>();
  // 三角形ごとのパレット番号
  let colors: number[] = [];
  let palette: p5.Color[] = [];

  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const edgeUsers = (a: number, b: number) => edgeTris.get(edgeKey(a, b)) ?? [];

  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

  // 辺上や頂点上は「内側」とみなさない。辺を共有する三角形を弾かないため
  const strictlyInside = (pt: Pt, a: Pt, b: Pt, c: Pt) => {
    const d1 = cross(a, b, pt);
    const d2 = cross(b, c, pt);
    const d3 = cross(c, a, pt);
    return (
      (d1 > EPS && d2 > EPS && d3 > EPS) ||
      (d1 < -EPS && d2 < -EPS && d3 < -EPS)
    );
  };

  // 端点を共有するだけの交差は無視して、線分が本当に突き抜けている場合だけ true
  const crossing = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    const opposite = (x: number, y: number) =>
      (x > EPS && y < -EPS) || (x < -EPS && y > EPS);
    return opposite(d1, d2) && opposite(d3, d4);
  };

  // 既存の三角形と重ならず、細長すぎない三角形かどうか
  const canPlace = (ia: number, ib: number, ic: number) => {
    if (ia === ib || ib === ic || ia === ic) return false;

    const a = points[ia];
    const b = points[ib];
    const c = points[ic];

    const ab = dist(a, b);
    const bc = dist(b, c);
    const ca = dist(c, a);
    const longest = Math.max(ab, bc, ca);
    const area = Math.abs(cross(a, b, c)) / 2;
    // 面積が小さすぎる = 針のような三角形。見た目が破綻するので置かない
    if (area < 0.06 * longest * longest) return false;

    // すでに2つの三角形が使っている辺には、これ以上三角形を生やせない
    const pairs: [number, number][] = [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ];
    for (const [s, e] of pairs) {
      if (edgeUsers(s, e).length >= 2) return false;
    }

    // 新しく増える辺が、既存の辺を横切っていないか
    const fresh = pairs.filter(([s, e]) => edgeUsers(s, e).length === 0);
    for (const [key, users] of edgeTris) {
      if (users.length === 0) continue;
      const [s, e] = key.split("_").map(Number);
      for (const [fs, fe] of fresh) {
        if (fs === s || fs === e || fe === s || fe === e) continue;
        if (crossing(points[fs], points[fe], points[s], points[e])) return false;
      }
    }

    // 既存の頂点を飲み込んでいないか
    for (let i = 0; i < points.length; i++) {
      if (i === ia || i === ib || i === ic) continue;
      if (strictlyInside(points[i], a, b, c)) return false;
    }

    // 既存の三角形の内側にすっぽり入っていないか
    const probes: Pt[] = [
      { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 },
      ...fresh.map(([s, e]) => ({
        x: (points[s].x + points[e].x) / 2,
        y: (points[s].y + points[e].y) / 2,
      })),
    ];
    for (const t of tris) {
      const ta = points[t.a];
      const tb = points[t.b];
      const tc = points[t.c];
      for (const probe of probes) {
        if (strictlyInside(probe, ta, tb, tc)) return false;
      }
    }

    return true;
  };

  const addTriangle = (ia: number, ib: number, ic: number, parent: number) => {
    const index = tris.length;
    tris.push({ a: ia, b: ib, c: ic, parent });
    for (const [s, e] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ]) {
      const key = edgeKey(s, e);
      const users = edgeTris.get(key);
      if (users) users.push(index);
      else edgeTris.set(key, [index]);
    }
  };

  // 外周の辺（三角形が片側にしかない辺）
  const boundaryEdges = (): [number, number, number][] => {
    const result: [number, number, number][] = [];
    for (const [key, users] of edgeTris) {
      if (users.length !== 1) continue;
      const [s, e] = key.split("_").map(Number);
      result.push([s, e, users[0]]);
    }
    return result;
  };

  // 全体の重心に近い外周の辺を優先する。一方向に伸びず、塊のまま育つ
  const inwardFirst = (edges: [number, number, number][]) => {
    let cx = 0;
    let cy = 0;
    for (const pt of points) {
      cx += pt.x / points.length;
      cy += pt.y / points.length;
    }
    return edges
      .map((edge) => {
        const [s, e] = edge;
        const mx = (points[s].x + points[e].x) / 2;
        const my = (points[s].y + points[e].y) / 2;
        return { edge, key: Math.hypot(mx - cx, my - cy) * p.random(0.7, 1.4) };
      })
      .sort((a, b) => a.key - b.key)
      .map((item) => item.edge);
  };

  // 外周のくぼみ（2辺が鋭角で向かい合っている頂点）を三角形で塞ぐ。
  // 埋め残しの穴ができるのを防ぐ
  const fillNotch = () => {
    const incident = new Map<number, [number, number][]>();
    for (const [s, e, tri] of boundaryEdges()) {
      for (const [v, other] of [
        [s, e],
        [e, s],
      ]) {
        const list = incident.get(v);
        if (list) list.push([other, tri]);
        else incident.set(v, [[other, tri]]);
      }
    }

    const candidates: {
      v: number;
      a: number;
      b: number;
      tri: number;
      angle: number;
    }[] = [];
    for (const [v, list] of incident) {
      if (list.length !== 2) continue;
      const [[a, tri], [b]] = list;
      const va = { x: points[a].x - points[v].x, y: points[a].y - points[v].y };
      const vb = { x: points[b].x - points[v].x, y: points[b].y - points[v].y };
      const dot = va.x * vb.x + va.y * vb.y;
      const angle = Math.acos(
        p.constrain(dot / (Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y)), -1, 1),
      );
      // 開ききったところは対象外。くぼみだけを塞ぐ
      if (angle > 1.9) continue;
      candidates.push({ v, a, b, tri, angle });
    }

    candidates.sort((x, y) => x.angle - y.angle);
    for (const c of candidates) {
      if (!canPlace(c.v, c.a, c.b)) continue;
      addTriangle(c.v, c.a, c.b, c.tri);
      return true;
    }
    return false;
  };

  // 外周の辺を1本選び、その外側にランダムな形の三角形を1つ生やす
  const growFromEdge = () => {
    for (const [ia, ib, tri] of inwardFirst(boundaryEdges())) {
      const a = points[ia];
      const b = points[ib];
      const len = dist(a, b);
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;

      // 既存の三角形がある側とは反対向きの法線
      const third = tris[tri];
      const inner =
        points[[third.a, third.b, third.c].find((v) => v !== ia && v !== ib)!];
      const sign = cross(a, b, inner) > 0 ? -1 : 1;
      const nx = -dy * sign;
      const ny = dx * sign;

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      // 小さい三角形からは大きめ、大きい三角形からは小さめの三角形を生やして、
      // 世代を重ねるうちにサイズが一方向へ流れてしまうのを抑える
      const bias = p.constrain(baseLength / len, 0.7, 1.5);

      for (let attempt = 0; attempt < 12; attempt++) {
        // 底辺からの高さと、頂点の左右のずれをランダムに決める = 辺の長さがばらつく
        const h = len * p.random(0.5, 1.25) * bias;
        const shift = len * p.random(-0.5, 0.5);
        const apex = {
          x: mid.x + nx * h + dx * shift,
          y: mid.y + ny * h + dy * shift,
        };

        // 近くに既存の頂点があればそこに吸着させて、隙間の元になる細い領域を作らない
        let ic = -1;
        let best = len * 0.4;
        for (let i = 0; i < points.length; i++) {
          if (i === ia || i === ib) continue;
          const d = dist(points[i], apex);
          if (d < best) {
            best = d;
            ic = i;
          }
        }

        if (ic >= 0) {
          if (canPlace(ia, ib, ic)) {
            addTriangle(ia, ib, ic, tri);
            return true;
          }
          continue;
        }

        points.push(apex);
        if (canPlace(ia, ib, points.length - 1)) {
          addTriangle(ia, ib, points.length - 1, tri);
          return true;
        }
        points.pop();
      }
    }
    return false;
  };

  const build = () => {
    points = [];
    tris = [];
    edgeTris = new Map();

    // 種になる三角形
    const seed = { x: 0, y: 0 };
    const angle1 = p.random(p.TWO_PI);
    const angle2 = angle1 + p.random(1.0, 2.2);
    points.push(seed);
    points.push({
      x: seed.x + Math.cos(angle1) * baseLength,
      y: seed.y + Math.sin(angle1) * baseLength,
    });
    points.push({
      x: seed.x + Math.cos(angle2) * baseLength * p.random(0.8, 1.3),
      y: seed.y + Math.sin(angle2) * baseLength * p.random(0.8, 1.3),
    });
    addTriangle(0, 1, 2, -1);

    let guard = 0;
    while (tris.length < triangleCount && guard < triangleCount * 40) {
      guard++;
      // くぼみを優先して埋め、埋めるところがなければ外側に伸ばす
      if (fillNotch()) continue;
      if (!growFromEdge()) break;
    }
  };

  // 白を混ぜる場合は、白がだいたい半分になるようにパレットへ重複して入れる
  const generatePalette = (): p5.Color[] => {
    const white = p.color(0, 0, 100);
    const hue1 = p.random(360);
    // 2色目は色相を離して、どちらの色か判別できるようにする
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    const c1 = p.color(hue1, p.random(50, 85), p.random(60, 95));
    const c2 = p.color(hue2, p.random(50, 85), p.random(60, 95));

    if (paletteMode === "white1") return [white, c1];
    if (paletteMode === "color2") return [c1, c2];
    return [white, white, c1, c2];
  };

  // 生成順にたどって、半分くらいは親の色を受け継がせる = 色の塊ができる
  const recolor = () => {
    palette = generatePalette();
    colors = [];
    for (const t of tris) {
      const inherit = t.parent >= 0 && p.random() < 0.55;
      colors.push(inherit ? colors[t.parent] : p.floor(p.random(palette.length)));
    }
  };

  const render = () => {
    p.background(0, 0, 100);
    if (tris.length === 0) return;

    // 生成された形は大きさも位置も読めないので、canvas に収まるよう合わせる
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    const scale = Math.min(
      (width - margin * 2) / (maxX - minX),
      (height - margin * 2) / (maxY - minY),
    );
    const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = (height - (maxY - minY) * scale) / 2 - minY * scale;
    const at = (i: number) => ({
      x: points[i].x * scale + offsetX,
      y: points[i].y * scale + offsetY,
    });

    // 三角形が小さいほど枠線を細くして、線で埋まってしまわないようにする
    p.strokeWeight(tris.length > 300 ? 0.6 : tris.length > 100 ? 0.9 : 1.2);
    p.strokeJoin(p.ROUND);
    if (strokeMode === "black") p.stroke(0, 0, 12);
    if (strokeMode === "gray") p.stroke(0, 0, 78);

    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const a = at(t.a);
      const b = at(t.b);
      const c = at(t.c);
      const fill = palette[colors[i]];
      p.fill(fill);
      // 枠なしのときは塗りと同じ色で縁取る。noStroke だと境目に隙間が見える
      if (strokeMode === "none") p.stroke(fill);
      p.triangle(a.x, a.y, b.x, b.y, c.x, c.y);
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
    panel.style("width", `${width}px`);
    panel.style("box-sizing", "border-box");
    panel.style("padding", "20px 24px 28px");
    panel.style("display", "flex");
    panel.style("gap", "28px");
    panel.style("align-items", "flex-end");
    panel.style("flex-wrap", "wrap");
    panel.style("background", "#111");

    addSelect<StrokeMode>(
      panel,
      "枠の色",
      [
        ["黒", "black"],
        ["薄いグレー", "gray"],
        ["枠描画なし", "none"],
      ],
      strokeMode,
      (value) => {
        // 見た目だけの変更なので、形も色もそのまま描き直す
        strokeMode = value;
        render();
      },
    );

    addSelect<PaletteMode>(
      panel,
      "塗る色",
      [
        ["白 + ランダムな2色", "white2"],
        ["白 + ランダムな1色", "white1"],
        ["ランダムな2色", "color2"],
      ],
      paletteMode,
      (value) => {
        // 形は保ったまま塗り分けだけをやり直す
        paletteMode = value;
        recolor();
        render();
      },
    );

    addSelect<string>(
      panel,
      "三角形の数",
      [
        ["100", "100"],
        ["300", "300"],
        ["500", "500"],
      ],
      String(triangleCount),
      (value) => {
        triangleCount = Number(value);
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
    p.createCanvas(width, height);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    // canvas の下の設定パネルまでスクロールできるようにする
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    buildUI();
    regenerate();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > width || p.mouseY < 0 || p.mouseY > height) {
      return;
    }
    regenerate();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`random-triangle-tiling-${Date.now()}`, "png");
    }
  };
};
