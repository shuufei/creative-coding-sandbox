import type p5 from "p5";

export const colorGrid500ScatterSketch = (p: p5) => {
  const size = 500;
  const gridN = 500;
  const cellSize = size / gridN;
  const cellsPerFrame = 4000;
  const total = gridN * gridN;

  let palette: p5.Color[] = [];
  let cellColorIndex: number[] = [];
  let revealOrder: number[] = [];
  let revealed = 0;

  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = p.floor(p.random(i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const generatePattern = () => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(80, 280)) % 360;
    palette = [
      p.color(hue1, 75, 90),
      p.color(hue2, 75, 90),
      p.color(0, 0, 100),
    ];

    // 3色の使用比率をランダムに決定(合計100%)
    const cuts = shuffle([p.random(), p.random()]).sort((a, b) => a - b);
    const ratio1 = cuts[0];
    const ratio2 = cuts[1] - cuts[0];

    const count1 = p.round(ratio1 * total);
    const count2 = p.round(ratio2 * total);
    const count3 = total - count1 - count2;

    cellColorIndex = shuffle([
      ...Array(count1).fill(0),
      ...Array(count2).fill(1),
      ...Array(count3).fill(2),
    ]);

    revealOrder = shuffle(Array.from({ length: total }, (_, i) => i));
    revealed = 0;

    p.noStroke();
    p.background(245);

    p.loop();
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    generatePattern();
  };

  p.draw = () => {
    if (revealed >= total) {
      p.noLoop();
      return;
    }

    for (let k = 0; k < cellsPerFrame && revealed < total; k++, revealed++) {
      const idx = revealOrder[revealed];
      const col = idx % gridN;
      const row = p.floor(idx / gridN);

      p.fill(palette[cellColorIndex[idx]]);
      p.rect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    generatePattern();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`color-grid-500-scatter-${Date.now()}`, "png");
    }
  };
};
