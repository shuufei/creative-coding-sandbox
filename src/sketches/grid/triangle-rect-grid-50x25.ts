import type p5 from "p5";

export const triangleRectGrid50x25Sketch = (p: p5) => {
  const cols = 50;
  const rows = 25;
  // 1マスは 1:1.5 の長方形。左上から右下への対角線で2つの三角形に分かれる
  const cellW = 16;
  const cellH = cellW * 1.5;
  const width = cellW * cols;
  const height = cellH * rows;

  // 白 + ランダムに決めた2色
  const generatePalette = (): p5.Color[] => {
    const hue1 = p.random(360);
    // 2色目は色相を離して、どちらの色か判別できるようにする
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    return [
      p.color(0, 0, 100),
      p.color(hue1, p.random(55, 90), p.random(60, 95)),
      p.color(hue2, p.random(55, 90), p.random(60, 95)),
    ];
  };

  // 2つの三角形が異なる色になる長方形の割合。残りは1色で塗りつぶす
  const twoToneRate = 0.1;

  // color 以外のパレットからランダムに1色選ぶ
  const other = (palette: p5.Color[], color: p5.Color) => {
    const rest = palette.filter((c) => c !== color);
    return rest[p.floor(p.random(rest.length))];
  };

  // 1色の塊にまとめるマス数。孤立した1マスが散らないよう最低でも minGroup マス連結させる
  const minGroup = 4;
  const maxGroup = 10;

  const neighborsOf = (index: number): number[] => {
    const col = index % cols;
    const row = (index - col) / cols;

    const result: number[] = [];
    if (row > 0) result.push(index - cols);
    if (row < rows - 1) result.push(index + cols);
    if (col > 0) result.push(index - 1);
    if (col < cols - 1) result.push(index + 1);
    return result;
  };

  // 隣り合うマスを塊に育てて、塊ごとに1色を割り当てる
  const assignColors = (paletteSize: number): number[] => {
    const total = cols * rows;
    const colors = new Array<number>(total).fill(-1);

    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = p.floor(p.random(i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const seed of order) {
      if (colors[seed] >= 0) continue;

      const color = p.floor(p.random(paletteSize));
      const target = p.floor(p.random(minGroup, maxGroup + 1));
      const group = [seed];
      colors[seed] = color;

      // 未着色の隣接マスをランダムに取り込みながら、目標のマス数まで育てる
      const frontier = neighborsOf(seed).filter((n) => colors[n] < 0);
      while (group.length < target && frontier.length > 0) {
        const pick = p.floor(p.random(frontier.length));
        const [next] = frontier.splice(pick, 1);
        if (colors[next] >= 0) continue;

        colors[next] = color;
        group.push(next);
        for (const n of neighborsOf(next)) if (colors[n] < 0) frontier.push(n);
      }

      // 既存の塊に囲まれて minGroup に届かなかったら、隣の塊の色に塗り替えて合流させる
      if (group.length < minGroup) {
        const members = new Set(group);
        const around = new Set<number>();
        for (const t of group) {
          for (const n of neighborsOf(t)) {
            if (!members.has(n)) around.add(colors[n]);
          }
        }
        if (around.size > 0) {
          const merged = [...around][p.floor(p.random(around.size))];
          for (const t of group) colors[t] = merged;
        }
      }
    }

    return colors;
  };

  const drawGrid = () => {
    const palette = generatePalette();
    const colors = assignColors(palette.length);

    p.background(0, 0, 100);
    // 隣り合う三角形の境目に白い隙間が出ないよう、塗りと同じ色で縁取る
    p.strokeWeight(1);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cellW;
        const y = row * cellH;
        const x2 = x + cellW;
        const y2 = y + cellH;

        // 長方形の色は塊ごとの色。2色に塗り分ける場合だけ左下の三角形を別の色にする
        const first = palette[colors[row * cols + col]];
        const second = p.random() < twoToneRate ? other(palette, first) : first;

        // 対角線の右上側
        p.fill(first);
        p.stroke(first);
        p.triangle(x, y, x2, y, x2, y2);

        // 対角線の左下側
        p.fill(second);
        p.stroke(second);
        p.triangle(x, y, x2, y2, x, y2);
      }
    }
  };

  p.setup = () => {
    p.createCanvas(width, height);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    drawGrid();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > width || p.mouseY < 0 || p.mouseY > height) {
      return;
    }
    drawGrid();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`triangle-rect-grid-50x25-${Date.now()}`, "png");
    }
  };
};
