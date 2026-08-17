import type p5 from "p5";

type Pt = { x: number; y: number };
// parent は「どの図形から生えたか」。色を塊にするときに参照する
type Face = { v: number[]; parent: number };

// @types/p5 の createSelect は p5.Element を返すだけで、select 固有のメソッドがない
type SelectElement = p5.Element & {
  option(name: string): void;
  selected(name: string): void;
  changed(handler: () => void): void;
};

type StrokeMode = "black" | "gray" | "none";
type PaletteMode =
  | "white2"
  | "white1"
  | "color2"
  | "gray2"
  | "gray3"
  | "whiteGray2"
  | "whiteGray3";
type ShapeMode = "triangle" | "quad";

export const randomTriangleTilingSketch = (p: p5) => {
  const width = 1000;
  const height = 1000;
  const margin = 60;

  // 最初の図形の一辺の目安。最後に全体を canvas に合わせて拡縮する
  const baseLength = 60;

  const EPS = 1e-3;

  // ---- 設定 -------------------------------------------------------------
  let strokeMode: StrokeMode = "black";
  let paletteMode: PaletteMode = "white2";
  let shapeMode: ShapeMode = "triangle";
  let faceCount = 100;

  // 1つの図形の頂点数
  const sides = () => (shapeMode === "triangle" ? 3 : 4);

  // 図形の集合。辺を共有しながら育てるので、隣り合う図形の間に隙間はできない
  let points: Pt[] = [];
  let faces: Face[] = [];
  // 辺 -> その辺を使っている図形のインデックス。1つだけなら外周の辺
  let edgeFaces = new Map<string, number[]>();
  // 図形ごとのパレット番号
  let colors: number[] = [];
  let palette: p5.Color[] = [];

  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const edgeUsers = (a: number, b: number) => edgeFaces.get(edgeKey(a, b)) ?? [];

  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

  // 多角形の辺を [始点, 終点] の並びで返す
  const polyEdges = (vs: number[]): [number, number][] =>
    vs.map((v, i) => [v, vs[(i + 1) % vs.length]]);

  const centroidOf = (vs: number[]): Pt => {
    let x = 0;
    let y = 0;
    for (const v of vs) {
      x += points[v].x / vs.length;
      y += points[v].y / vs.length;
    }
    return { x, y };
  };

  const polyArea = (vs: number[]) => {
    let sum = 0;
    for (const [s, e] of polyEdges(vs)) {
      sum += points[s].x * points[e].y - points[e].x * points[s].y;
    }
    return Math.abs(sum) / 2;
  };

  // 凸でない図形は見た目が破綻しやすいので、基本は凸だけを置く。
  // 三角形はつぶれていない限り必ず凸になる
  const isConvex = (vs: number[]) => {
    let sign = 0;
    for (let i = 0; i < vs.length; i++) {
      const o = points[vs[i]];
      const a = points[vs[(i + 1) % vs.length]];
      const b = points[vs[(i + 2) % vs.length]];
      const c = cross(o, a, b);
      if (Math.abs(c) < EPS) return false;
      const s = c > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
    return true;
  };

  // 自分自身の辺が交差していないか（凹んだ形も許すときに必要）
  const isSimple = (vs: number[]) => {
    const edges = polyEdges(vs);
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = edges[i];
        const [c, d] = edges[j];
        // 隣り合う辺は端点を共有しているだけなので対象外
        if (a === c || a === d || b === c || b === d) continue;
        if (crossing(points[a], points[b], points[c], points[d])) return false;
      }
    }
    return true;
  };

  const onSegment = (pt: Pt, a: Pt, b: Pt) => {
    const len = dist(a, b);
    if (len < EPS) return dist(pt, a) < EPS;
    const t = ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len);
    if (t < -EPS || t > 1 + EPS) return false;
    return Math.abs(cross(a, b, pt)) / len < EPS;
  };

  // 辺上や頂点上は「内側」とみなさない。辺を共有する図形を弾かないため
  const strictlyInside = (pt: Pt, vs: number[]) => {
    const edges = polyEdges(vs);
    for (const [s, e] of edges) {
      if (onSegment(pt, points[s], points[e])) return false;
    }
    // 右向きに伸ばした半直線と辺が交わる回数で内外を決める
    let inside = false;
    for (const [s, e] of edges) {
      const a = points[s];
      const b = points[e];
      if (a.y > pt.y !== b.y > pt.y) {
        const x = a.x + ((pt.y - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (x > pt.x) inside = !inside;
      }
    }
    return inside;
  };

  // 確実に図形の内側にある点。凹んだ四角形では重心が外に出ることがあるので、
  // その場合は対角線の中点を使う
  const interiorProbe = (vs: number[]): Pt => {
    const center = centroidOf(vs);
    if (strictlyInside(center, vs)) return center;
    for (let i = 0; i < vs.length; i++) {
      const a = points[vs[i]];
      const b = points[vs[(i + 2) % vs.length]];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (strictlyInside(mid, vs)) return mid;
    }
    return center;
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

  // 四角形を1つ置くと、その輪の辺の数は必ず偶数だけ増減する。
  // つまり辺が奇数本の輪（穴）は四角形だけでは絶対に埋められない。
  // vs を置いたときに外周がそういう輪に分かれないかを先に確かめる
  const keepsBoundaryEven = (vs: number[]) => {
    const users = new Map<string, number>();
    for (const [key, list] of edgeFaces) users.set(key, list.length);
    for (const [s, e] of polyEdges(vs)) {
      const key = edgeKey(s, e);
      users.set(key, (users.get(key) ?? 0) + 1);
    }

    // 外周の辺だけを取り出し、つながっている輪ごとに本数を数える
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      const up = parent.get(x);
      if (up === undefined || up === x) return x;
      const root = find(up);
      parent.set(x, root);
      return root;
    };
    const boundary: number[] = [];
    for (const [key, count] of users) {
      if (count !== 1) continue;
      const [s, e] = key.split("_").map(Number);
      if (!parent.has(s)) parent.set(s, s);
      if (!parent.has(e)) parent.set(e, e);
      parent.set(find(s), find(e));
      boundary.push(s);
    }

    const sizes = new Map<number, number>();
    for (const s of boundary) {
      const root = find(s);
      sizes.set(root, (sizes.get(root) ?? 0) + 1);
    }
    for (const size of sizes.values()) {
      if (size % 2 === 1) return false;
    }
    return true;
  };

  // 既存の図形と重ならず、細長すぎない図形かどうか。
  // grow: 新しく生やすとき。形を選べるので、凸できれいな図形だけを通す
  // fill: くぼみを塞ぐとき。隙間が残るほうが目立つので、凹んだ形も通す
  // hole: 4辺とも既存の穴を塞ぐとき。形はまったく選べないので条件は最小限
  const canPlace = (vs: number[], mode: "grow" | "fill" | "hole" = "grow") => {
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        if (vs[i] === vs[j]) return false;
      }
    }
    if (mode === "grow") {
      if (!isConvex(vs)) return false;
    } else if (!isSimple(vs)) {
      return false;
    }

    const edges = polyEdges(vs);
    const lengths = edges.map(([s, e]) => dist(points[s], points[e]));
    const longest = Math.max(...lengths);
    // 面積が小さすぎる = 針のような図形。見た目が破綻するので置かない
    const minArea =
      mode === "hole"
        ? 0.02
        : vs.length === 3
          ? 0.06
          : mode === "fill"
            ? 0.08
            : 0.16;
    if (polyArea(vs) < minArea * longest * longest) return false;
    // 四角形は1辺だけ極端に短いと三角形に見えてしまう
    const minEdge = mode === "grow" ? 0.22 : mode === "fill" ? 0.1 : 0;
    if (vs.length === 4 && Math.min(...lengths) < minEdge * longest) return false;

    // すでに2つの図形が使っている辺には、これ以上図形を生やせない
    for (const [s, e] of edges) {
      if (edgeUsers(s, e).length >= 2) return false;
    }

    // 新しく増える辺が、既存の辺を横切っていないか
    const fresh = edges.filter(([s, e]) => edgeUsers(s, e).length === 0);
    for (const [key, users] of edgeFaces) {
      if (users.length === 0) continue;
      const [s, e] = key.split("_").map(Number);
      for (const [fs, fe] of fresh) {
        if (fs === s || fs === e || fe === s || fe === e) continue;
        if (crossing(points[fs], points[fe], points[s], points[e])) return false;
      }
    }

    // 既存の頂点を飲み込んでいないか
    for (let i = 0; i < points.length; i++) {
      if (vs.includes(i)) continue;
      if (strictlyInside(points[i], vs)) return false;
    }

    // 既存の図形の内側にすっぽり入っていないか
    const probes: Pt[] = [
      interiorProbe(vs),
      ...fresh.map(([s, e]) => ({
        x: (points[s].x + points[e].x) / 2,
        y: (points[s].y + points[e].y) / 2,
      })),
    ];
    for (const f of faces) {
      for (const probe of probes) {
        if (strictlyInside(probe, f.v)) return false;
      }
    }

    // 埋められない穴を残す置き方はしない
    if (vs.length === 4 && !keepsBoundaryEven(vs)) return false;

    return true;
  };

  const addFace = (vs: number[], parent: number) => {
    const index = faces.length;
    faces.push({ v: vs, parent });
    for (const [s, e] of polyEdges(vs)) {
      const key = edgeKey(s, e);
      const users = edgeFaces.get(key);
      if (users) users.push(index);
      else edgeFaces.set(key, [index]);
    }
  };

  // 置けたら追加する。置けなければ、そのために作った頂点は捨てる。
  // created は points の末尾に push した順に並んでいる前提
  const tryPlace = (
    vs: number[],
    created: number[],
    parent: number,
    mode: "grow" | "fill" | "hole" = "grow",
  ) => {
    if (canPlace(vs, mode)) {
      addFace(vs, parent);
      return true;
    }
    for (let i = 0; i < created.length; i++) points.pop();
    return false;
  };

  // 外周の辺（図形が片側にしかない辺）
  const boundaryEdges = (): [number, number, number][] => {
    const result: [number, number, number][] = [];
    for (const [key, users] of edgeFaces) {
      if (users.length !== 1) continue;
      const [s, e] = key.split("_").map(Number);
      result.push([s, e, users[0]]);
    }
    return result;
  };

  // 外周の頂点 -> そこから伸びている外周の辺 [相手の頂点, 図形]
  const boundaryIncidence = () => {
    const incident = new Map<number, [number, number][]>();
    for (const [s, e, face] of boundaryEdges()) {
      for (const [v, other] of [
        [s, e],
        [e, s],
      ]) {
        const list = incident.get(v);
        if (list) list.push([other, face]);
        else incident.set(v, [[other, face]]);
      }
    }
    return incident;
  };

  // 頂点 v から a と b を見たときの開き具合
  const angleAt = (v: number, a: number, b: number) => {
    const va = { x: points[a].x - points[v].x, y: points[a].y - points[v].y };
    const vb = { x: points[b].x - points[v].x, y: points[b].y - points[v].y };
    const dot = va.x * vb.x + va.y * vb.y;
    return Math.acos(
      p.constrain(dot / (Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y)), -1, 1),
    );
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
  const fillNotchTriangle = () => {
    const candidates: {
      v: number;
      a: number;
      b: number;
      face: number;
      angle: number;
    }[] = [];
    for (const [v, list] of boundaryIncidence()) {
      if (list.length !== 2) continue;
      const [[a, face], [b]] = list;
      const angle = angleAt(v, a, b);
      // 開ききったところは対象外。くぼみだけを塞ぐ
      if (angle > 1.9) continue;
      candidates.push({ v, a, b, face, angle });
    }

    candidates.sort((x, y) => x.angle - y.angle);
    for (const c of candidates) {
      if (!canPlace([c.v, c.a, c.b])) continue;
      addFace([c.v, c.a, c.b], c.face);
      return true;
    }
    return false;
  };

  // 四角形の場合のくぼみ埋め。
  // 外周の辺3本ぶんを新しい頂点なしで1つの四角形にする。
  // 4本目の辺もすでにあるなら、それは穴。形を選ばず最優先で塞ぐ。
  // どれも無理なら、2本ぶんのくぼみに頂点を1つ足して塞ぐ
  const fillNotchQuad = () => {
    const incident = boundaryIncidence();

    const chains: {
      vs: number[];
      face: number;
      hole: boolean;
      score: number;
    }[] = [];
    for (const [ib, ic, face] of boundaryEdges()) {
      const listB = incident.get(ib) ?? [];
      const listC = incident.get(ic) ?? [];
      if (listB.length !== 2 || listC.length !== 2) continue;
      const ia = listB.find(([other]) => other !== ic)?.[0];
      const id = listC.find(([other]) => other !== ib)?.[0];
      if (ia === undefined || id === undefined || ia === id) continue;
      const angleB = angleAt(ib, ia, ic);
      const angleC = angleAt(ic, ib, id);
      const hole = edgeUsers(id, ia).length === 1;
      // 両端とも閉じ気味のところだけを塞ぐ。穴なら開き具合は問わない
      if (!hole && (angleB > 2.5 || angleC > 2.5)) continue;
      chains.push({ vs: [ia, ib, ic, id], face, hole, score: angleB + angleC });
    }
    // 穴を塞ぐものが先。同じなら閉じているところから
    chains.sort(
      (x, y) => Number(y.hole) - Number(x.hole) || x.score - y.score,
    );
    for (const chain of chains) {
      if (!canPlace(chain.vs, chain.hole ? "hole" : "fill")) continue;
      addFace(chain.vs, chain.face);
      return true;
    }

    const notches: { vs: number[]; face: number; angle: number }[] = [];
    for (const [v, list] of incident) {
      if (list.length !== 2) continue;
      const [[a, face], [b]] = list;
      const angle = angleAt(v, a, b);
      if (angle > 2.2) continue;
      notches.push({ vs: [a, v, b], face, angle });
    }
    notches.sort((x, y) => x.angle - y.angle);
    for (const notch of notches) {
      const [a, v, b] = notch.vs;
      // v の向かい側。a-v-b と合わせて平行四辺形になる位置
      const apex = {
        x: points[a].x + points[b].x - points[v].x,
        y: points[a].y + points[b].y - points[v].y,
      };
      const near = nearestPoint(
        apex,
        [a, v, b],
        dist(points[a], points[v]) * 0.45,
      );
      if (near >= 0) {
        if (canPlace([a, v, b, near], "fill")) {
          addFace([a, v, b, near], notch.face);
          return true;
        }
        continue;
      }
      points.push(apex);
      if (
        tryPlace([a, v, b, points.length - 1], [points.length - 1], notch.face, "fill")
      ) {
        return true;
      }
    }
    return false;
  };

  const fillNotch = () =>
    shapeMode === "triangle" ? fillNotchTriangle() : fillNotchQuad();

  // 近くに既存の頂点があればそのインデックス。なければ -1
  const nearestPoint = (pt: Pt, exclude: number[], radius: number) => {
    let index = -1;
    let best = radius;
    for (let i = 0; i < points.length; i++) {
      if (exclude.includes(i)) continue;
      const d = dist(points[i], pt);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return index;
  };

  // 外周の辺を1本選び、その外側にランダムな形の図形を1つ生やす
  const growFromEdge = () => {
    for (const [ia, ib, face] of inwardFirst(boundaryEdges())) {
      const a = points[ia];
      const b = points[ib];
      const len = dist(a, b);
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;

      // 既存の図形がある側とは反対向きの法線
      const inner = centroidOf(faces[face].v);
      const sign = cross(a, b, inner) > 0 ? -1 : 1;
      const nx = -dy * sign;
      const ny = dx * sign;

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      // 小さい図形からは大きめ、大きい図形からは小さめの図形を生やして、
      // 世代を重ねるうちにサイズが一方向へ流れてしまうのを抑える
      const bias = p.constrain(baseLength / len, 0.7, 1.5);

      for (let attempt = 0; attempt < 12; attempt++) {
        // 底辺からの高さと、頂点の左右のずれをランダムに決める = 辺の長さがばらつく
        const h = len * p.random(0.5, 1.25) * bias;

        const vs = [ia, ib];
        const created: number[] = [];

        if (sides() === 3) {
          // 底辺からの高さと、頂点の左右のずれをランダムに決める = 辺の長さがばらつく
          const shift = len * p.random(-0.5, 0.5);
          const apex = {
            x: mid.x + nx * h + dx * shift,
            y: mid.y + ny * h + dy * shift,
          };

          // 近くに既存の頂点があればそこに吸着させて、隙間の元になる細い領域を作らない
          const near = nearestPoint(apex, vs, len * 0.4);
          if (near >= 0) {
            if (canPlace([ia, ib, near])) {
              addFace([ia, ib, near], face);
              return true;
            }
            continue;
          }
          points.push(apex);
          created.push(points.length - 1);
          vs.push(points.length - 1);
        } else {
          // ia と ib それぞれの外側に頂点を1つずつ。台形寄りにして凸を保ちやすくする
          const h2 = h * p.random(0.8, 1.2);
          const shiftB = len * p.random(-0.15, 0.45);
          const shiftA = len * p.random(-0.45, 0.15);
          const apexes: [Pt, number][] = [
            [
              { x: b.x + nx * h + dx * shiftB, y: b.y + ny * h + dy * shiftB },
              ib,
            ],
            [
              { x: a.x + nx * h2 + dx * shiftA, y: a.y + ny * h2 + dy * shiftA },
              ia,
            ],
          ];
          for (const [apex] of apexes) {
            const near = nearestPoint(apex, vs, len * 0.45);
            if (near >= 0) {
              vs.push(near);
              continue;
            }
            points.push(apex);
            created.push(points.length - 1);
            vs.push(points.length - 1);
          }
        }

        if (tryPlace(vs, created, face)) return true;
      }
    }
    return false;
  };

  const build = () => {
    points = [];
    faces = [];
    edgeFaces = new Map();

    // 種になる図形
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
    if (sides() === 3) {
      addFace([0, 1, 2], -1);
    } else {
      // 0-1 と 0-2 を2辺とする四角形。残りの頂点は平行四辺形の位置
      points.push({
        x: points[1].x + points[2].x - points[0].x,
        y: points[1].y + points[2].y - points[0].y,
      });
      addFace([1, 0, 2, 3], -1);
    }

    let guard = 0;
    while (faces.length < faceCount && guard < faceCount * 40) {
      guard++;
      // くぼみを優先して埋め、埋めるところがなければ外側に伸ばす
      if (fillNotch()) continue;
      if (!growFromEdge()) break;
    }
  };

  // 明度だけを変えたグレー。明度は範囲を等分した位置から少しずらす。
  // 白背景と区別できるよう、いちばん明るいものでも白からは離しておく
  const grayPalette = (count: number): p5.Color[] => {
    const low = 25;
    const high = 78;
    const step = (high - low) / (count - 1);
    return [...Array(count)].map((_, i) =>
      p.color(0, 0, low + step * i + p.random(-step * 0.15, step * 0.15)),
    );
  };

  // 白を混ぜる場合は、白がだいたい半分になるようにパレットへ重複して入れる
  const generatePalette = (): p5.Color[] => {
    const white = p.color(0, 0, 100);

    if (paletteMode === "gray2") return grayPalette(2);
    if (paletteMode === "gray3") return grayPalette(3);
    if (paletteMode === "whiteGray2") {
      return [white, white, ...grayPalette(2)];
    }
    if (paletteMode === "whiteGray3") {
      return [white, white, white, ...grayPalette(3)];
    }

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
    for (const f of faces) {
      const inherit = f.parent >= 0 && p.random() < 0.55;
      colors.push(inherit ? colors[f.parent] : p.floor(p.random(palette.length)));
    }
  };

  const render = () => {
    p.background(0, 0, 100);
    if (faces.length === 0) return;

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

    // 図形が小さいほど枠線を細くして、線で埋まってしまわないようにする
    p.strokeWeight(faces.length > 300 ? 0.6 : faces.length > 100 ? 0.9 : 1.2);
    p.strokeJoin(p.ROUND);
    if (strokeMode === "black") p.stroke(0, 0, 12);
    if (strokeMode === "gray") p.stroke(0, 0, 78);

    for (let i = 0; i < faces.length; i++) {
      const fill = palette[colors[i]];
      p.fill(fill);
      // 枠なしのときは塗りと同じ色で縁取る。noStroke だと境目に隙間が見える
      if (strokeMode === "none") p.stroke(fill);
      p.beginShape();
      for (const v of faces[i].v) {
        const q = at(v);
        p.vertex(q.x, q.y);
      }
      p.endShape(p.CLOSE);
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

  const addButton = (parent: p5.Element, title: string, onClick: () => void) => {
    const button = p.createButton(title);
    button.parent(parent);
    button.style("padding", "7px 14px");
    button.style("font", "13px sans-serif");
    button.style("background", "#1c1c1c");
    button.style("color", "#eee");
    button.style("border", "1px solid #444");
    button.style("border-radius", "4px");
    button.style("cursor", "pointer");
    button.mousePressed(onClick);
  };

  // 形はそのままに、パレットと塗り分けだけを引き直す
  const shuffleColors = () => {
    recolor();
    render();
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

    addSelect<ShapeMode>(
      panel,
      "図形",
      [
        ["三角形", "triangle"],
        ["四角形", "quad"],
      ],
      shapeMode,
      (value) => {
        // 形そのものが変わるので、最初から作り直す
        shapeMode = value;
        regenerate();
      },
    );

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
        ["明度の異なるグレー2つ", "gray2"],
        ["明度の異なるグレー3つ", "gray3"],
        ["白 + 明度の異なるグレー2つ", "whiteGray2"],
        ["白 + 明度の異なるグレー3つ", "whiteGray3"],
      ],
      paletteMode,
      (value) => {
        // 形は保ったまま塗り分けだけをやり直す
        paletteMode = value;
        shuffleColors();
      },
    );

    addSelect<string>(
      panel,
      "図形の数",
      [
        ["100", "100"],
        ["300", "300"],
        ["500", "500"],
      ],
      String(faceCount),
      (value) => {
        faceCount = Number(value);
        regenerate();
      },
    );

    addButton(panel, "色を変える", shuffleColors);

    const hint = p.createDiv(
      "canvas をクリックで再生成 / c キーで色だけ変更 / s キーで PNG 保存",
    );
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
    if (p.key === "c" || p.key === "C") {
      shuffleColors();
      return;
    }
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`random-${shapeMode}-tiling-${Date.now()}`, "png");
    }
  };
};
