import type p5 from "p5";

export const colorGridSketch = (p: p5) => {
  const size = 500;
  const gridN = 100;
  const cellSize = size / gridN;
  const cellsPerFrame = 120;
  const total = gridN * gridN;
  const minBlobSize = 5;
  const maxBlobSize = 18;

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

  const neighborsOf = (idx: number) => {
    const col = idx % gridN;
    const row = p.floor(idx / gridN);
    const result: number[] = [];
    if (col > 0) result.push(idx - 1);
    if (col < gridN - 1) result.push(idx + 1);
    if (row > 0) result.push(idx - gridN);
    if (row < gridN - 1) result.push(idx + gridN);
    return result;
  };

  const weightedPick = (weights: number[]) => {
    const eps = 0.001;
    const adjusted = weights.map((w) => p.max(w, eps));
    const sum = adjusted.reduce((a, b) => a + b, 0);
    let r = p.random(sum);
    for (let i = 0; i < adjusted.length; i++) {
      r -= adjusted[i];
      if (r <= 0) return i;
    }
    return adjusted.length - 1;
  };

  const findConnectedComponents = (colors: number[]) => {
    const visited = new Array(total).fill(false);
    const components: { cells: number[]; color: number }[] = [];

    for (let start = 0; start < total; start++) {
      if (visited[start]) continue;
      const color = colors[start];
      const cells: number[] = [];
      const stack = [start];
      visited[start] = true;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        cells.push(cur);
        for (const n of neighborsOf(cur)) {
          if (!visited[n] && colors[n] === color) {
            visited[n] = true;
            stack.push(n);
          }
        }
      }

      components.push({ cells, color });
    }

    return components;
  };

  // 4マス以下の孤立した連結領域を、隣接する中で最も多い色に塗り替える。
  // フェーズ1: 全小領域を1パスで一括更新(高速だが、統合結果が別の判定を
  // 狂わせて少数の新たな孤立領域を残すことがある)を繰り返して大部分を解消。
  // フェーズ2: 残ったごく少数を、1件ずつ全体再計算しながら確実に解消する。
  const mergeSmallComponents = (colors: number[]) => {
    const maxSmallSize = 4;
    const mergeOnePass = (comp: { cells: number[] }) => {
      const ownColor = colors[comp.cells[0]];
      const neighborTally = new Map<number, number>();
      for (const cell of comp.cells) {
        for (const n of neighborsOf(cell)) {
          if (colors[n] !== ownColor) {
            neighborTally.set(colors[n], (neighborTally.get(colors[n]) ?? 0) + 1);
          }
        }
      }
      if (neighborTally.size === 0) return;

      let bestColor = ownColor;
      let bestCount = -1;
      for (const [color, count] of neighborTally) {
        if (count > bestCount) {
          bestCount = count;
          bestColor = color;
        }
      }
      for (const cell of comp.cells) colors[cell] = bestColor;
    };

    const bulkPasses = 30;
    for (let iter = 0; iter < bulkPasses; iter++) {
      const components = findConnectedComponents(colors);
      const smallOnes = components.filter((c) => c.cells.length <= maxSmallSize);
      if (smallOnes.length === 0) return;
      for (const comp of smallOnes) mergeOnePass(comp);
    }

    for (let step = 0; step < total; step++) {
      const components = findConnectedComponents(colors);
      const comp = components.find((c) => c.cells.length <= maxSmallSize);
      if (!comp) break;
      mergeOnePass(comp);
    }
  };

  const generatePattern = () => {
    const hue1 = p.random(360);
    const hue2 = (hue1 + p.random(80, 280)) % 360;
    palette = [
      p.color(hue1, 75, 90),
      p.color(hue2, 75, 90),
      p.color(0, 0, 100),
    ];

    // 3色の目標比率をランダムに決定(合計100%、厳密には守らない目安値)
    const cuts = shuffle([p.random(), p.random()]).sort((a, b) => a - b);
    const targetRatio = [cuts[0], cuts[1] - cuts[0], 1 - cuts[1]];
    const filledCount = [0, 0, 0];

    cellColorIndex = new Array(total).fill(-1);

    // 未確定マスをO(1)で取り出せるように管理
    const unfilledList = Array.from({ length: total }, (_, i) => i);
    const positionInList = Array.from({ length: total }, (_, i) => i);
    const removeFromUnfilled = (idx: number) => {
      const pos = positionInList[idx];
      const last = unfilledList[unfilledList.length - 1];
      unfilledList[pos] = last;
      positionInList[last] = pos;
      unfilledList.pop();
      positionInList[idx] = -1;
    };

    const blobs: number[][] = [];

    while (unfilledList.length > 0) {
      const seed = unfilledList[p.floor(p.random(unfilledList.length))];
      const targetSize = p.floor(p.random(minBlobSize, maxBlobSize + 1));

      const blob = [seed];
      removeFromUnfilled(seed);
      const frontier = new Set<number>();
      for (const n of neighborsOf(seed)) {
        if (positionInList[n] !== -1) frontier.add(n);
      }

      while (blob.length < targetSize && frontier.size > 0) {
        const candidates = Array.from(frontier);
        const next = candidates[p.floor(p.random(candidates.length))];
        frontier.delete(next);
        if (positionInList[next] === -1) continue;

        blob.push(next);
        removeFromUnfilled(next);
        for (const n of neighborsOf(next)) {
          if (positionInList[n] !== -1) frontier.add(n);
        }
      }

      const deficits = targetRatio.map((r, i) => r * total - filledCount[i]);
      const colorIdx = weightedPick(deficits);
      for (const cell of blob) cellColorIndex[cell] = colorIdx;
      filledCount[colorIdx] += blob.length;

      blobs.push(blob);
    }

    mergeSmallComponents(cellColorIndex);

    revealOrder = ([] as number[]).concat(...blobs);
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
      p.saveCanvas(`color-grid-${Date.now()}`, "png");
    }
  };
};
