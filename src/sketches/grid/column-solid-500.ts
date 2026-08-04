import type p5 from "p5";

export const columnSolid500Sketch = (p: p5) => {
  const size = 500;
  const gridN = 500;
  const cellSize = size / gridN;

  // 1フレームで塗る列数(左から右へ1列ずつ塗り進める)
  const columnsPerFrame = 3;

  // 1列を縦に分割するセクション数
  const sections = 5;
  const sectionHeight = gridN / sections;

  let palette: p5.Color[] = [];
  // 列ごとの配色。上から順に各セクションの palette index を持つ
  let columnSections: number[][] = [];
  let drawnColumns = 0;

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

    // 500列それぞれに独立した配色を割り当てる
    columnSections = Array.from({ length: gridN }, () =>
      Array.from({ length: sections }, () => p.floor(p.random(3))),
    );

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
      const colors = columnSections[drawnColumns];
      for (let s = 0; s < sections; s++) {
        p.fill(palette[colors[s]]);
        p.rect(
          drawnColumns * cellSize,
          s * sectionHeight * cellSize,
          cellSize,
          sectionHeight * cellSize,
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
      p.saveCanvas(`column-solid-500-${Date.now()}`, "png");
    }
  };
};
