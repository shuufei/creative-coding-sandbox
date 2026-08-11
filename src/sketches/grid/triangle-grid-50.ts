import type p5 from "p5";

export const triangleGrid50Sketch = (p: p5) => {
  const size = 800;
  const gridN = 50;
  const cellSize = size / gridN;

  // 1マスを対角線2本で分割した4つの三角形(上・右・下・左)の頂点を返す
  const cellTriangles = (col: number, row: number) => {
    const x = col * cellSize;
    const y = row * cellSize;
    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;
    const x2 = x + cellSize;
    const y2 = y + cellSize;

    return [
      [x, y, x2, y, cx, cy], // top
      [x2, y, x2, y2, cx, cy], // right
      [x2, y2, x, y2, cx, cy], // bottom
      [x, y2, x, y, cx, cy], // left
    ] as const;
  };

  // 白 + ランダムな2色。三角形はこの3色からランダムに選ぶ
  const generatePalette = (): p5.Color[] => {
    const hue1 = p.random(360);
    // 2色目は色相を離して、どちらの色か判別できるようにする
    const hue2 = (hue1 + p.random(90, 270)) % 360;
    return [
      p.color(0, 0, 100),
      p.color(hue1, p.random(60, 90), p.random(75, 95)),
      p.color(hue2, p.random(60, 90), p.random(75, 95)),
    ];
  };

  // 三角形の通し番号。1マスあたり 0:上 1:右 2:下 3:左
  const TOP = 0;
  const RIGHT = 1;
  const BOTTOM = 2;
  const LEFT = 3;
  const indexOf = (col: number, row: number, k: number) =>
    (row * gridN + col) * 4 + k;

  // 辺を共有する三角形。マス内で2つ、隣のマスとで1つの計3つ
  const neighborsOf = (index: number): number[] => {
    const k = index % 4;
    const cell = (index - k) / 4;
    const col = cell % gridN;
    const row = (cell - col) / gridN;

    const result: number[] = [];
    switch (k) {
      case TOP:
        result.push(indexOf(col, row, LEFT), indexOf(col, row, RIGHT));
        if (row > 0) result.push(indexOf(col, row - 1, BOTTOM));
        break;
      case RIGHT:
        result.push(indexOf(col, row, TOP), indexOf(col, row, BOTTOM));
        if (col < gridN - 1) result.push(indexOf(col + 1, row, LEFT));
        break;
      case BOTTOM:
        result.push(indexOf(col, row, LEFT), indexOf(col, row, RIGHT));
        if (row < gridN - 1) result.push(indexOf(col, row + 1, TOP));
        break;
      default:
        result.push(indexOf(col, row, TOP), indexOf(col, row, BOTTOM));
        if (col > 0) result.push(indexOf(col - 1, row, RIGHT));
        break;
    }
    return result;
  };

  // palette と同じ並びの、色ごとの1本の帯の長さ(三角形の数)。
  // この長さに届かなかった帯は塗らずに捨てて、別の場所から引き直す
  const groupSizes = [1, 160, 160];

  // palette と同じ並びの、色ごとの目標面積比
  const areaShares = [1, 1, 1];

  // 1つの三角形が同じ色の三角形と隣接できる上限。
  // 2にすると同色領域は枝分かれできず幅1の帯状になり、3(隣接の最大数)にすると
  // 自分自身に接触できるので塊状に育つ。
  // 白は隙間を埋める背景色なので、連結数と同じくこの上限からも除外する
  const maxSameNeighbors = 3;

  // 帯を引き直す上限。これだけ連続で失敗したらその色は打ち止めにする
  const maxRibbonAttempts = 600;

  // 白以外は「同色どうしが2つまでしか触れない帯」として伸ばし、残りを白中心に埋める
  const assignColors = (): number[] => {
    const total = gridN * gridN * 4;
    const colors = new Array<number>(total).fill(-1);

    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = p.floor(p.random(i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const shareTotal = areaShares.reduce((a, b) => a + b, 0);
    const targets = areaShares.map((s) => (total * s) / shareTotal);
    const painted = new Array<number>(areaShares.length).fill(0);

    const sameCount = (index: number, color: number) => {
      let n = 0;
      for (const t of neighborsOf(index)) if (colors[t] === color) n++;
      return n;
    };

    // そこを color で塗っても、自分もまわりも上限を超えないか
    const canPaint = (index: number, color: number) => {
      if (sameCount(index, color) > maxSameNeighbors) return false;
      for (const t of neighborsOf(index)) {
        if (colors[t] === color && sameCount(t, color) >= maxSameNeighbors) {
          return false;
        }
      }
      return true;
    };

    const paint = (index: number, color: number) => {
      colors[index] = color;
      painted[color]++;
    };

    const unpaint = (index: number) => {
      painted[colors[index]]--;
      colors[index] = -1;
    };

    // ランダムな位置から探し始めて、同色にまだ触れていない未着色の三角形を種にする
    const findSeed = (color: number) => {
      const offset = p.floor(p.random(order.length));
      for (let i = 0; i < order.length; i++) {
        const index = order[(offset + i) % order.length];
        if (colors[index] < 0 && sameCount(index, color) === 0) return index;
      }
      return -1;
    };

    // 種から片方の端を伸ばし、行き止まりならもう片方の端を伸ばす自己回避の帯。
    // 既に同色に触れているマスは選ばないので、帯は自分自身に接触しない。
    // target に届かなければ塗りを取り消して失敗を返す(短い帯を残さない)
    const growRibbon = (color: number, target: number) => {
      const seed = findSeed(color);
      if (seed < 0) return false;

      paint(seed, color);
      const ribbon = [seed];
      const ends = [seed, seed];
      let stuck = 0;

      while (ribbon.length < target && stuck < 2) {
        const candidates = neighborsOf(ends[0]).filter(
          (n) => colors[n] < 0 && canPaint(n, color),
        );
        if (candidates.length === 0) {
          ends.reverse();
          stuck++;
          continue;
        }

        const next = candidates[p.floor(p.random(candidates.length))];
        paint(next, color);
        ribbon.push(next);
        ends[0] = next;
        stuck = 0;
      }

      if (ribbon.length < target) {
        for (const t of ribbon) unpaint(t);
        return false;
      }
      return true;
    };

    // 1. 白以外を、面積が不足している色から順に帯で敷いていく
    const ribbonColors = groupSizes
      .map((s, i) => ({ index: i, size: s }))
      .filter(({ size }) => size > 1);
    const exhausted = new Set<number>();
    const failures = new Array<number>(groupSizes.length).fill(0);

    for (;;) {
      const hungry = ribbonColors.filter(
        ({ index }) => painted[index] < targets[index] && !exhausted.has(index),
      );
      if (hungry.length === 0) break;

      const next = hungry.reduce((a, b) =>
        targets[a.index] - painted[a.index] >= targets[b.index] - painted[b.index]
          ? a
          : b,
      );

      if (growRibbon(next.index, next.size)) {
        failures[next.index] = 0;
      } else if (++failures[next.index] >= maxRibbonAttempts) {
        exhausted.add(next.index);
      }
    }

    // 2. 帯にならなかった残りはすべて白にする。
    // ここで色を使うと最低連結数に満たない破片が大量に出るため、埋め草は白だけに任せる
    const background = groupSizes.findIndex((s) => s === 1);
    for (const index of order) {
      if (colors[index] < 0) paint(index, background);
    }

    return colors;
  };

  const drawGrid = () => {
    const palette = generatePalette();
    const colors = assignColors();

    p.background(0, 0, 100);
    p.noStroke();

    for (let row = 0; row < gridN; row++) {
      for (let col = 0; col < gridN; col++) {
        const triangles = cellTriangles(col, row);
        for (let k = 0; k < triangles.length; k++) {
          const [x1, y1, x2, y2, x3, y3] = triangles[k];
          p.fill(palette[colors[indexOf(col, row, k)]]);
          p.triangle(x1, y1, x2, y2, x3, y3);
        }
      }
    }
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    drawGrid();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > size || p.mouseY < 0 || p.mouseY > size) return;
    drawGrid();
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`triangle-grid-50-${Date.now()}`, "png");
    }
  };
};
