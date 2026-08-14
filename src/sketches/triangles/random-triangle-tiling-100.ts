import type p5 from "p5";

type Pt = { x: number; y: number };
type Tri = { a: number; b: number; c: number; color: number };

export const randomTriangleTiling100Sketch = (p: p5) => {
  const width = 1000;
  const height = 1000;
  const margin = 60;

  // 目標の三角形の数
  const total = 100;
  // 最初の三角形の一辺の目安。最後に全体を canvas に合わせて拡縮する
  const baseLength = 60;

  const EPS = 1e-3;

  // 三角形の集合。辺を共有しながら育てるので、隣り合う三角形の間に隙間はできない
  let points: Pt[] = [];
  let tris: Tri[] = [];
  // 辺 -> その辺を使っている三角形のインデックス。1つだけなら外周の辺
  let edgeTris = new Map<string, number[]>();

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

  const addTriangle = (ia: number, ib: number, ic: number, color: number) => {
    const index = tris.length;
    tris.push({ a: ia, b: ib, c: ic, color });
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

  const pickColor = (parent: number, paletteSize: number) =>
    // 半分くらいは隣の三角形の色を受け継いで、色の塊を作る
    p.random() < 0.55 ? parent : p.floor(p.random(paletteSize));

  // 外周のくぼみ（2辺が鋭角で向かい合っている頂点）を三角形で塞ぐ。
  // 埋め残しの穴ができるのを防ぐ
  const fillNotch = (paletteSize: number) => {
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

    const candidates: { v: number; a: number; b: number; tri: number; angle: number }[] =
      [];
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
      addTriangle(c.v, c.a, c.b, pickColor(tris[c.tri].color, paletteSize));
      return true;
    }
    return false;
  };

  // 外周の辺を1本選び、その外側にランダムな形の三角形を1つ生やす
  const growFromEdge = (paletteSize: number) => {
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
            addTriangle(ia, ib, ic, pickColor(tris[tri].color, paletteSize));
            return true;
          }
          continue;
        }

        points.push(apex);
        if (canPlace(ia, ib, points.length - 1)) {
          addTriangle(ia, ib, points.length - 1, pickColor(tris[tri].color, paletteSize));
          return true;
        }
        points.pop();
      }
    }
    return false;
  };

  const build = (paletteSize: number) => {
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
    addTriangle(0, 1, 2, p.floor(p.random(paletteSize)));

    let guard = 0;
    while (tris.length < total && guard < total * 40) {
      guard++;
      // くぼみを優先して埋め、埋めるところがなければ外側に伸ばす
      if (fillNotch(paletteSize)) continue;
      if (!growFromEdge(paletteSize)) break;
    }
  };

  // 白 + ランダムな2色
  const generatePalette = (): p5.Color[] => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    return [
      p.color(0, 0, 100),
      p.color(0, 0, 100),
      p.color(hue1, p.random(50, 85), p.random(60, 95)),
      p.color(hue2, p.random(50, 85), p.random(60, 95)),
    ];
  };

  const drawTiling = () => {
    const palette = generatePalette();
    build(palette.length);

    p.background(0, 0, 100);

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

    p.stroke(0, 0, 12);
    p.strokeWeight(1.2);
    p.strokeJoin(p.ROUND);
    for (const t of tris) {
      const a = at(t.a);
      const b = at(t.b);
      const c = at(t.c);
      p.fill(palette[t.color]);
      p.triangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }

    console.log(`[random-triangle-tiling-100] triangles: ${tris.length}`);
  };

  p.setup = () => {
    p.createCanvas(width, height);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    drawTiling();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > width || p.mouseY < 0 || p.mouseY > height) {
      return;
    }
    drawTiling();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`random-triangle-tiling-100-${Date.now()}`, "png");
    }
  };
};
