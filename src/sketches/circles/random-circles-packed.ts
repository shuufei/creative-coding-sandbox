import type p5 from "p5";

export const randomCirclesPackedSketch = (p: p5) => {
  const size = 500;
  // 3種類の半径(比 3:5:13)。unitで全体の粒の細かさを調整する
  // failLimit: 同じサイズで連続してこの回数置けなくなったら打ち切る
  const unit = 1;
  const sizeSteps = [
    { r: 13 * unit, failLimit: 4000 },
    { r: 5 * unit, failLimit: 8000 },
    { r: 3 * unit, failLimit: 20000 },
  ];

  type Circle = { x: number; y: number; r: number; colorIndex: number };

  let palette: p5.Color[] = [];
  let circles: Circle[] = [];

  // 大きい円から順に、置ける限り置いて隙間を小さい円で埋めていく
  const pack = (steps: typeof sizeSteps): Circle[] => {
    const maxR = p.max(steps.map((s) => s.r));
    const cell = maxR * 2;
    const cols = p.ceil(size / cell);
    const rows = p.ceil(size / cell);
    const grid: Circle[][] = Array.from({ length: cols * rows }, () => []);
    const placed: Circle[] = [];

    steps.forEach(({ r, failLimit }) => {
      let fails = 0;

      while (fails < failLimit) {
        const x = p.random(r, size - r);
        const y = p.random(r, size - r);
        const col = p.floor(x / cell);
        const row = p.floor(y / cell);

        let hit = false;
        // 接触しうる相手との中心間距離は r + maxR <= cell なので隣接9セルで足りる
        for (let dc = -1; dc <= 1 && !hit; dc++) {
          for (let dr = -1; dr <= 1 && !hit; dr++) {
            const c = col + dc;
            const rw = row + dr;
            if (c < 0 || c >= cols || rw < 0 || rw >= rows) continue;
            for (const other of grid[rw * cols + c]) {
              const dx = other.x - x;
              const dy = other.y - y;
              const minDist = r + other.r;
              if (dx * dx + dy * dy < minDist * minDist) {
                hit = true;
                break;
              }
            }
          }
        }

        if (hit) {
          fails++;
          continue;
        }

        const circle: Circle = { x, y, r, colorIndex: p.floor(p.random(2)) };
        placed.push(circle);
        grid[row * cols + col].push(circle);
        fails = 0;
      }
    });

    return placed;
  };

  const generatePattern = () => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(80, 280)) % 360;
    palette = [
      p.color(hue1, p.random(60, 85), p.random(75, 95)),
      p.color(hue2, p.random(60, 85), p.random(75, 95)),
    ];

    // 3種類のサイズを混ぜるか、一律サイズ(3種のどれか)にするかをランダムに決める
    const isMixed = p.random() < 0.5;
    const steps = isMixed
      ? sizeSteps
      : [sizeSteps[p.floor(p.random(sizeSteps.length))]];

    circles = pack(steps);

    // 隙間(背景)は白か黒をランダムに選ぶ
    p.background(0, 0, p.random() < 0.5 ? 100 : 0);
    p.noStroke();
    for (const c of circles) {
      p.fill(palette[c.colorIndex]);
      p.circle(c.x, c.y, c.r * 2);
    }

    const covered =
      circles.reduce((sum, c) => sum + p.PI * c.r * c.r, 0) / (size * size);
    console.log(
      `[random-circles-packed] ${
        isMixed ? "mixed 3:5:13" : `uniform r=${steps[0].r}`
      }, ${circles.length} circles, coverage ${(covered * 100).toFixed(1)}%`,
    );
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    generatePattern();
  };

  p.draw = () => {};

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    generatePattern();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`random-circles-packed-${Date.now()}`, "png");
    }
  };
};
