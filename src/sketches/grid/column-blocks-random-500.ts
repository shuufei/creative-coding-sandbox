import type p5 from "p5";

export const columnBlocksRandom500Sketch = (p: p5) => {
  const size = 500;
  const gridN = 500;
  const cellSize = size / gridN;

  // 1フレームで塗る列数(左から右へ1列ずつ塗り進める)
  const columnsPerFrame = 3;

  // 1列を縦に分割するセクション数
  const sections = 10;
  // どのセクションもこの高さ(セル数)は必ず確保する
  const minSectionHeight = 15;

  // 同じ配色が連続する列数(=帯の幅)の範囲
  const minRun = 1;
  const maxRun = 24;

  // bounds は sections + 1 個の区切り位置(先頭は0、末尾は gridN)
  type Band = { bounds: number[]; colors: number[] };

  let palette: p5.Color[] = [];
  // 列ごとの帯情報。同じ帯に属する列は同じオブジェクトを共有する
  let columnBands: Band[] = [];
  let drawnColumns = 0;

  // 各セクションに最低高さを配り、残りをランダムな比率で分配して区切り位置を決める
  const randomBounds = () => {
    const slack = gridN - sections * minSectionHeight;
    const weights = Array.from({ length: sections }, () => p.random());
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const bounds = [0];
    let y = 0;
    for (let s = 0; s < sections - 1; s++) {
      y += minSectionHeight + p.floor((slack * weights[s]) / weightSum);
      bounds.push(y);
    }
    bounds.push(gridN);
    return bounds;
  };

  const generatePattern = () => {
    // 互いに離れた3つの色相を取り、どの2色も判別できるようにする
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(80, 140)) % 360;
    const hue3 = (hue2 + p.random(80, 140)) % 360;
    palette = [
      p.color(hue1, 72, 90),
      p.color(hue2, 72, 90),
      p.color(hue3, 72, 90),
    ];

    // 幅をランダムに振った帯を左から敷き詰める。帯の中は区切り位置と配色を共有する
    columnBands = new Array(gridN);
    let col = 0;
    while (col < gridN) {
      const width = p.floor(p.random(minRun, maxRun + 1));
      const band: Band = {
        bounds: randomBounds(),
        colors: Array.from({ length: sections }, () => p.floor(p.random(3))),
      };
      const end = p.min(col + width, gridN);
      for (; col < end; col++) columnBands[col] = band;
    }

    drawnColumns = 0;
    p.noStroke();
    p.background(0, 0, 100);
    p.loop();
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    generatePattern();
  };

  p.draw = () => {
    if (drawnColumns >= gridN) {
      p.noLoop();
      return;
    }

    for (let k = 0; k < columnsPerFrame && drawnColumns < gridN; k++, drawnColumns++) {
      const { bounds, colors } = columnBands[drawnColumns];
      for (let s = 0; s < sections; s++) {
        p.fill(palette[colors[s]]);
        p.rect(
          drawnColumns * cellSize,
          bounds[s] * cellSize,
          cellSize,
          (bounds[s + 1] - bounds[s]) * cellSize,
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
      p.saveCanvas(`column-blocks-random-500-${Date.now()}`, "png");
    }
  };
};
