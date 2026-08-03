import type p5 from "p5";

export const verticalStripes3Sketch = (p: p5) => {
  const size = 500;
  const gridN = 500;
  const cellSize = size / gridN;

  let colors: p5.Color[] = [];
  // 列ごとの2つの境界位置 [上側の境界, 下側の境界]
  let splits: [number, number][] = [];
  // 列ごとの色の並び順(colorsのindexを上から順に3つ)
  let colorOrders: number[][] = [];

  // 3色の並び順の全パターン。列ごとにここからランダムに選ぶ
  const permutations = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];

  // 境界のランダム範囲。どの色の帯も必ず一定の高さを持つように上下2箇所を分けて振る
  const split1Min = 70;
  const split1Max = 230;
  const split2Min = 270;
  const split2Max = 430;

  const generatePattern = () => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(70, 150)) % 360;
    const hue3 = (hue2 + p.random(70, 150)) % 360;
    colors = [
      p.color(hue1, 70, 92),
      p.color(hue2, 70, 92),
      p.color(hue3, 70, 92),
    ];

    splits = Array.from({ length: gridN }, () => {
      const first = p.floor(p.random(split1Min, split1Max + 1));
      const second = p.floor(p.random(split2Min, split2Max + 1));
      return [first, second] as [number, number];
    });

    colorOrders = Array.from(
      { length: gridN },
      () => permutations[p.floor(p.random(permutations.length))],
    );

    render();
  };

  const render = () => {
    p.noStroke();
    for (let col = 0; col < gridN; col++) {
      const [first, second] = splits[col];
      const bounds = [0, first, second, gridN];
      const order = colorOrders[col];
      for (let i = 0; i < 3; i++) {
        p.fill(colors[order[i]]);
        p.rect(
          col * cellSize,
          bounds[i] * cellSize,
          cellSize,
          (bounds[i + 1] - bounds[i]) * cellSize,
        );
      }
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
      p.saveCanvas(`vertical-stripes-3-${Date.now()}`, "png");
    }
  };
};
