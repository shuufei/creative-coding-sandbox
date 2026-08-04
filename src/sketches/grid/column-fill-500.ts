import type p5 from "p5";

export const columnFill500Sketch = (p: p5) => {
  const size = 500;
  const gridN = 500;
  const cellSize = size / gridN;

  // 1フレームで塗る列数(左から右へ1列ずつ塗り進める)
  const columnsPerFrame = 3;

  // 列内を縦方向に区切る帯の長さ(セル数)
  const minRun = 20;
  const maxRun = 140;

  // 前の列の構造を引き継ぐ確率。高いほど縦の帯が横につながって見える
  const inheritProb = 0.88;
  // 引き継ぐ際に境界をずらす最大幅(セル数)
  const boundaryJitter = 6;
  // 引き継ぐ際に帯の色を振り直す確率
  const recolorProb = 0.12;

  type Run = { end: number; color: number };

  let palette: p5.Color[] = [];
  let columns: Run[][] = [];
  let drawnColumns = 0;

  // 直前の色と異なる色をランダムに選ぶ
  const pickColor = (exclude: number) => {
    let idx = p.floor(p.random(3));
    while (idx === exclude) idx = p.floor(p.random(3));
    return idx;
  };

  // ゼロから列を作る。上から順に帯を積み上げて gridN まで埋める
  const createColumn = (): Run[] => {
    const runs: Run[] = [];
    let y = 0;
    let prevColor = -1;
    while (y < gridN) {
      const len = p.floor(p.random(minRun, maxRun + 1));
      const color = pickColor(prevColor);
      y = p.min(y + len, gridN);
      runs.push({ end: y, color });
      prevColor = color;
    }
    return runs;
  };

  // 直前の列をベースに、境界を少しずらして次の列を作る
  const deriveColumn = (base: Run[]): Run[] => {
    const runs: Run[] = [];
    let prevEnd = 0;
    let prevColor = -1;

    for (let i = 0; i < base.length; i++) {
      const isLast = i === base.length - 1;
      const end = isLast
        ? gridN
        : p.constrain(
            base[i].end + p.floor(p.random(-boundaryJitter, boundaryJitter + 1)),
            prevEnd + 1,
            gridN - 1,
          );
      const color =
        p.random() < recolorProb ? pickColor(prevColor) : base[i].color;

      runs.push({ end, color });
      prevEnd = end;
      prevColor = color;
      if (end >= gridN) break;
    }

    return runs;
  };

  const generatePattern = () => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    palette = [
      p.color(hue1, 72, 90),
      p.color(hue2, 72, 90),
      p.color(0, 0, 100),
    ];

    columns = [];
    for (let col = 0; col < gridN; col++) {
      columns.push(
        col > 0 && p.random() < inheritProb
          ? deriveColumn(columns[col - 1])
          : createColumn(),
      );
    }

    drawnColumns = 0;
    p.noStroke();
    p.background(0, 0, 100);
    p.loop();
  };

  const drawColumn = (col: number) => {
    let start = 0;
    for (const run of columns[col]) {
      p.fill(palette[run.color]);
      p.rect(col * cellSize, start * cellSize, cellSize, (run.end - start) * cellSize);
      start = run.end;
    }
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
      drawColumn(drawnColumns);
    }
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    generatePattern();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`column-fill-500-${Date.now()}`, "png");
    }
  };
};
