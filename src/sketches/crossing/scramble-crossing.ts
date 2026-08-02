import type p5 from "p5";

interface Vec {
  x: number;
  y: number;
}

interface Trail {
  points: Vec[];
  /** 交差判定用に間引いた中心線 */
  samples: Vec[];
  /** 交差判定を早期に打ち切るための外接円 */
  bounds: { center: Vec; radius: number };
  headWidth: number;
  color: string;
}

/** 出発地点(角)ごとの色 (左上 / 右上 / 右下 / 左下 の順) */
const CORNER_COLORS = ["#5cbf74", "#16a5e8", "#e04b4b", "#f4efa0"];
const BG = "#232323";
const STRIPE_ALPHA = 20;

export const scrambleCrossingSketch = (p: p5) => {
  let trails: Trail[] = [];
  let crossingSize = 0;
  let center: Vec = { x: 0, y: 0 };

  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = p.floor(p.random(i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const catmullRom = (a: number, b: number, c: number, d: number, t: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
    );
  };

  /** 制御点を Catmull-Rom 補間して、滑らかな中心線サンプル列にする */
  const smoothPath = (controls: Vec[], samplesPerSegment: number): Vec[] => {
    const pts = [controls[0], ...controls, controls[controls.length - 1]];
    const out: Vec[] = [];
    for (let i = 0; i < pts.length - 3; i++) {
      const [a, b, c, d] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
      const last = i === pts.length - 4;
      const steps = last ? samplesPerSegment : samplesPerSegment - 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / samplesPerSegment;
        out.push({
          x: catmullRom(a.x, b.x, c.x, d.x, t),
          y: catmullRom(a.y, b.y, c.y, d.y, t),
        });
      }
    }
    return out;
  };

  /** 進行方向に少しずつ曲がりながら伸びる軌跡の制御点を作る */
  const makeControlPoints = (start: Vec, angle: number, length: number): Vec[] => {
    const segments = p.floor(p.random(3, 6));
    const segLength = length / segments;
    const turn = p.random(0.1, 0.4);
    const bias = p.random(-1, 1) * 0.35;

    const controls: Vec[] = [{ ...start }];
    let heading = angle;
    let cursor = start;
    for (let i = 0; i < segments; i++) {
      heading += p.random(-turn, turn) + bias * turn;
      cursor = {
        x: cursor.x + p.cos(heading) * segLength,
        y: cursor.y + p.sin(heading) * segLength,
      };
      controls.push(cursor);
    }
    return controls;
  };

  /**
   * 幅プロファイル。t=0 が出発地点、t=1 が進行方向の先頭。
   * 先頭側は太さを保ち、出発地点に向かって細くなって消える (軌跡の尾)。
   */
  const widthAt = (t: number, headWidth: number) => {
    const head = 0.22; // 先頭側で太さを保つ割合
    const u = 1 - t; // 先頭からの距離
    if (u <= head) return headWidth;
    const k = (u - head) / (1 - head);
    return headWidth * p.pow(1 - k, 0.75);
  };

  const drawTrail = (trail: Trail) => {
    const pts = trail.points;
    const n = pts.length;

    // 弧長でパラメータ化して、幅の変化を長さに対して均一にする
    const cumulative: number[] = [0];
    for (let i = 1; i < n; i++) {
      cumulative[i] = cumulative[i - 1] + p.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
    const total = cumulative[n - 1] || 1;

    const normals: Vec[] = [];
    const halfWidths: number[] = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[p.max(i - 1, 0)];
      const next = pts[p.min(i + 1, n - 1)];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = p.mag(tx, ty) || 1;
      normals.push({ x: -ty / len, y: tx / len });
      halfWidths.push(widthAt(cumulative[i] / total, trail.headWidth));
    }

    p.fill(trail.color);
    p.beginShape();

    // 出発地点(尖った尾)から先頭へ、右側の輪郭
    for (let i = 0; i < n; i++) {
      p.vertex(pts[i].x - normals[i].x * halfWidths[i], pts[i].y - normals[i].y * halfWidths[i]);
    }
    // 先頭は丸いキャップ
    const head = pts[n - 1];
    const headWidth = halfWidths[n - 1];
    const capAngle = p.atan2(-normals[n - 1].y, -normals[n - 1].x);
    const capSteps = 14;
    for (let i = 1; i < capSteps; i++) {
      const a = capAngle + (i / capSteps) * p.PI;
      p.vertex(head.x + p.cos(a) * headWidth, head.y + p.sin(a) * headWidth);
    }
    // 先頭から出発地点へ、左側の輪郭
    for (let i = n - 1; i >= 0; i--) {
      p.vertex(pts[i].x + normals[i].x * halfWidths[i], pts[i].y + normals[i].y * halfWidths[i]);
    }
    p.endShape(p.CLOSE);
  };

  /**
   * 横断歩道を 1 本描く。
   * (cx, cy) を中心に angle 方向へ歩く帯で、縞は歩行方向に沿って伸びる。
   */
  const drawCrosswalk = (cx: number, cy: number, angle: number, span: number, depth: number) => {
    const stripeCount = p.floor(span / (crossingSize * 0.028));
    const pitch = span / stripeCount;
    const stripeWidth = pitch * 0.5;

    p.push();
    p.translate(cx, cy);
    p.rotate(angle);
    p.fill(255, STRIPE_ALPHA);
    for (let i = 0; i < stripeCount; i++) {
      const x = -span / 2 + pitch * (i + 0.5);
      p.rect(x - stripeWidth / 2, -depth / 2, stripeWidth, depth);
    }
    p.pop();
  };

  const drawCrossing = () => {
    const half = crossingSize / 2;
    const depth = crossingSize * 0.13;
    const span = crossingSize * 0.92;

    // 四辺の横断歩道
    drawCrosswalk(center.x, center.y - half + depth * 0.5, 0, span, depth);
    drawCrosswalk(center.x, center.y + half - depth * 0.5, 0, span, depth);
    drawCrosswalk(center.x - half + depth * 0.5, center.y, p.HALF_PI, span, depth);
    drawCrosswalk(center.x + half - depth * 0.5, center.y, p.HALF_PI, span, depth);

    // スクランブル交差点の対角線
    const diagonal = crossingSize * Math.SQRT2 * 0.86;
    drawCrosswalk(center.x, center.y, -p.QUARTER_PI, diagonal, depth * 0.85);
    drawCrosswalk(center.x, center.y, p.QUARTER_PI, diagonal, depth * 0.85);
  };

  const makeTrail = (points: Vec[], headWidth: number, color: string): Trail => {
    const step = p.max(1, p.floor(points.length / 18));
    const samples: Vec[] = [];
    for (let i = 0; i < points.length; i += step) samples.push(points[i]);
    if (samples[samples.length - 1] !== points[points.length - 1]) {
      samples.push(points[points.length - 1]);
    }

    let sx = 0;
    let sy = 0;
    for (const s of samples) {
      sx += s.x;
      sy += s.y;
    }
    const mid = { x: sx / samples.length, y: sy / samples.length };
    let radius = 0;
    for (const s of samples) radius = p.max(radius, p.dist(mid.x, mid.y, s.x, s.y));

    return { points, samples, bounds: { center: mid, radius: radius + headWidth }, headWidth, color };
  };

  /** 既存の軌跡と重なる (交差する) かどうか */
  const overlaps = (candidate: Trail, others: Trail[], gap: number) => {
    for (const other of others) {
      const clearance = candidate.headWidth + other.headWidth + gap;
      const centerDist = p.dist(
        candidate.bounds.center.x,
        candidate.bounds.center.y,
        other.bounds.center.x,
        other.bounds.center.y,
      );
      if (centerDist > candidate.bounds.radius + other.bounds.radius + clearance) continue;

      for (const a of candidate.samples) {
        for (const b of other.samples) {
          if (p.dist(a.x, a.y, b.x, b.y) < clearance) return true;
        }
      }
    }
    return false;
  };

  const generate = () => {
    crossingSize = p.min(p.width, p.height) * 0.62;
    center = { x: p.width / 2, y: p.height / 2 };
    const half = crossingSize / 2;
    const margin = crossingSize * 0.05;
    const gap = crossingSize * 0.014;

    const corners: Vec[] = [
      { x: center.x - half, y: center.y - half },
      { x: center.x + half, y: center.y - half },
      { x: center.x + half, y: center.y + half },
      { x: center.x - half, y: center.y + half },
    ];

    const inside = (v: Vec) =>
      v.x > center.x - half - margin &&
      v.x < center.x + half + margin &&
      v.y > center.y - half - margin &&
      v.y < center.y + half + margin;

    // 出発地点(角) → 行き先(残り 3 つの角) の全ルートを作り、順番をばらす
    const routes: { from: number; to: number }[] = [];
    const perRoute = 8;
    for (let from = 0; from < 4; from++) {
      for (let to = 0; to < 4; to++) {
        if (to === from) continue;
        for (let k = 0; k < perRoute; k++) routes.push({ from, to });
      }
    }
    shuffle(routes);

    const placed: Trail[] = [];

    for (const route of routes) {
      const start = corners[route.from];
      const goal = corners[route.to];
      const routeAngle = p.atan2(goal.y - start.y, goal.x - start.x);
      const routeLength = p.dist(start.x, start.y, goal.x, goal.y);
      const perp = { x: -p.sin(routeAngle), y: p.cos(routeAngle) };

      // 辺沿いのルートは内側にだけ広がらせる (対角ルートは左右対称)
      const mid = { x: (start.x + goal.x) / 2, y: (start.y + goal.y) / 2 };
      const inward = perp.x * (center.x - mid.x) + perp.y * (center.y - mid.y);
      const isDiagonal = p.abs(inward) < crossingSize * 0.01;
      const inwardSign = inward >= 0 ? 1 : -1;

      for (let attempt = 0; attempt < 60; attempt++) {
        const progress = p.random(0.02, 0.78);
        const spreadLimit = isDiagonal ? half * 0.6 : half * 0.85;
        const spread = spreadLimit * p.pow(p.sin(p.min(progress + 0.15, 1) * p.PI), 0.4);
        const lateral = isDiagonal
          ? (p.random() + p.random() - 1) * spread
          : inwardSign * p.random(0.02, 1) * spread;

        const origin = {
          x: start.x + p.cos(routeAngle) * routeLength * progress + perp.x * lateral,
          y: start.y + p.sin(routeAngle) * routeLength * progress + perp.y * lateral,
        };

        const angle = routeAngle + p.random(-0.35, 0.35);
        const length = p.random(crossingSize * 0.12, crossingSize * 0.3);
        const points = smoothPath(makeControlPoints(origin, angle, length), 22);
        if (!points.every(inside)) continue;

        const candidate = makeTrail(
          points,
          p.random(crossingSize * 0.011, crossingSize * 0.017),
          CORNER_COLORS[route.from],
        );
        if (overlaps(candidate, placed, gap)) continue;

        placed.push(candidate);
        break;
      }
    }

    trails = placed;
  };

  const render = () => {
    p.background(BG);
    p.noStroke();
    drawCrossing();
    for (const trail of trails) drawTrail(trail);
  };

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.noLoop();
    generate();
    render();
  };

  p.draw = () => {
    render();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    generate();
    p.redraw();
  };

  p.mousePressed = () => {
    generate();
    p.redraw();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`scramble-crossing-${Date.now()}`, "png");
    }
  };
};
