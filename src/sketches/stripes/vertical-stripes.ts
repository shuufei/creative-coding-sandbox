import type p5 from "p5";

export const verticalStripesSketch = (p: p5) => {
  const size = 500;
  const gridN = 500;
  const cellSize = size / gridN;

  let color1: p5.Color;
  let color2: p5.Color;
  let splitRows: number[] = [];
  let topIsColor1: boolean[] = [];

  const generatePattern = () => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(80, 280)) % 360;
    color1 = p.color(hue1, 70, 92);
    color2 = p.color(hue2, 70, 92);

    // 列ごとに、上下を2色に分ける境界の行位置を100〜400の範囲でランダムに1箇所決める
    const splitMin = 100;
    const splitMax = 400;
    splitRows = Array.from({ length: gridN }, () =>
      p.floor(p.random(splitMin, splitMax + 1)),
    );

    // 列ごとに、上側がどちらの色になるかもランダムに決める
    topIsColor1 = Array.from({ length: gridN }, () => p.random() < 0.5);

    render();
  };

  const render = () => {
    p.noStroke();
    for (let col = 0; col < gridN; col++) {
      const split = splitRows[col];
      const topColor = topIsColor1[col] ? color1 : color2;
      const bottomColor = topIsColor1[col] ? color2 : color1;
      p.fill(topColor);
      p.rect(col * cellSize, 0, cellSize, split * cellSize);
      p.fill(bottomColor);
      p.rect(col * cellSize, split * cellSize, cellSize, size - split * cellSize);
    }
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    generatePattern();
    p.noLoop();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    generatePattern();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`vertical-stripes-${Date.now()}`, "png");
    }
  };
};
