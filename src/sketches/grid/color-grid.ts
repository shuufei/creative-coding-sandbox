import type p5 from "p5";

// PCCS の 12 トーン。彩度・明度は HSB での近似値(PCCS の正確な表色値ではない)。
const PCCS_TONES = [
  { key: "p", name: "ペール", s: 22, b: 97 },
  { key: "ltg", name: "ライトグレイッシュ", s: 18, b: 80 },
  { key: "g", name: "グレイッシュ", s: 22, b: 58 },
  { key: "dkg", name: "ダークグレイッシュ", s: 30, b: 34 },
  { key: "lt", name: "ライト", s: 45, b: 96 },
  { key: "sf", name: "ソフト", s: 48, b: 78 },
  { key: "d", name: "ダル", s: 52, b: 62 },
  { key: "dk", name: "ダーク", s: 75, b: 42 },
  { key: "b", name: "ブライト", s: 70, b: 96 },
  { key: "s", name: "ストロング", s: 85, b: 78 },
  { key: "dp", name: "ディープ", s: 95, b: 60 },
  { key: "v", name: "ビビッド", s: 100, b: 92 },
];

// PCCS の 24 色相。h は HSB の色相角への近似マッピング。
const PCCS_HUES = [
  { no: 1, key: "pR", name: "紫みの赤", h: 350 },
  { no: 2, key: "R", name: "赤", h: 0 },
  { no: 3, key: "yR", name: "黄みの赤", h: 12 },
  { no: 4, key: "rO", name: "赤みのだいだい", h: 22 },
  { no: 5, key: "O", name: "だいだい", h: 30 },
  { no: 6, key: "yO", name: "黄みのだいだい", h: 40 },
  { no: 7, key: "rY", name: "赤みの黄", h: 50 },
  { no: 8, key: "Y", name: "黄", h: 58 },
  { no: 9, key: "gY", name: "緑みの黄", h: 68 },
  { no: 10, key: "YG", name: "黄緑", h: 80 },
  { no: 11, key: "yG", name: "黄みの緑", h: 100 },
  { no: 12, key: "G", name: "緑", h: 130 },
  { no: 13, key: "bG", name: "青みの緑", h: 155 },
  { no: 14, key: "BG", name: "青緑", h: 170 },
  { no: 15, key: "BG", name: "青緑", h: 182 },
  { no: 16, key: "gB", name: "緑みの青", h: 194 },
  { no: 17, key: "B", name: "青", h: 205 },
  { no: 18, key: "B", name: "青", h: 220 },
  { no: 19, key: "pB", name: "紫みの青", h: 238 },
  { no: 20, key: "V", name: "青紫", h: 258 },
  { no: 21, key: "bP", name: "青みの紫", h: 274 },
  { no: 22, key: "P", name: "紫", h: 292 },
  { no: 23, key: "rP", name: "赤みの紫", h: 312 },
  { no: 24, key: "RP", name: "赤紫", h: 330 },
];

const GRID_OPTIONS = [50, 100, 500];

type Tone = (typeof PCCS_TONES)[number];
type Hue = (typeof PCCS_HUES)[number];
type ToneMode = "same" | "separate";

export const colorGridSketch = (p: p5) => {
  const size = 500;
  const minBlobSize = 5;
  const maxBlobSize = 18;

  let gridN = 100;
  let constraintEnabled = true;
  let toneMode: ToneMode = "same";
  let total = gridN * gridN;
  let cellsPerFrame = 100;

  let palette: p5.Color[] = [];
  let cellColorIndex: number[] = [];
  let revealOrder: number[] = [];
  let revealed = 0;

  let constraintCheckbox: p5.Element;
  let infoDiv: p5.Element;

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

  // 5マス以上の連結領域(ブロブ)をランダムな形状で育てながら塗っていく
  const buildConstrainedPattern = (targetRatio: number[]) => {
    const filledCount = [0, 0, 0];

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
  };

  // マスごとに独立してランダムな色を割り当てる(連結の制約なし)
  const buildScatterPattern = (targetRatio: number[]) => {
    const count1 = p.round(targetRatio[0] * total);
    const count2 = p.round(targetRatio[1] * total);
    const count3 = total - count1 - count2;

    cellColorIndex = shuffle([
      ...Array(count1).fill(0),
      ...Array(count2).fill(1),
      ...Array(count3).fill(2),
    ]);
    revealOrder = shuffle(Array.from({ length: total }, (_, i) => i));
  };

  const cellRect = (idx: number) => {
    const col = idx % gridN;
    const row = p.floor(idx / gridN);
    const x0 = p.round((col / gridN) * size);
    const x1 = p.round(((col + 1) / gridN) * size);
    const y0 = p.round((row / gridN) * size);
    const y1 = p.round(((row + 1) / gridN) * size);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const swatchHtml = (color: p5.Color) =>
    `<span style="display:inline-block;width:12px;height:12px;border:1px solid #666;` +
    `vertical-align:-1px;margin-right:4px;background:${color.toString("#rrggbb")}"></span>`;

  const updateInfo = (picks: { tone: Tone; hue: Hue }[]) => {
    const sharedTone = picks[0].tone === picks[1].tone;

    const toneLine = sharedTone
      ? `トーン: <strong>${picks[0].tone.key}</strong> ${picks[0].tone.name}（2色共通）`
      : "トーン: 色ごとに個別";

    const colorsHtml = picks
      .map(({ tone, hue }, i) => {
        const tonePart = sharedTone
          ? ""
          : `<strong>${tone.key}</strong> ${tone.name} / `;
        return `${swatchHtml(palette[i])}${tonePart}${hue.no}:${hue.key} ${hue.name}`;
      })
      .join("　");

    infoDiv.html(
      `<div>${toneLine}</div>` +
        `<div style="margin-top:4px">${sharedTone ? "色相" : "色"}: ` +
        `${colorsHtml}　${swatchHtml(palette[2])}白</div>`,
    );
  };

  const generatePattern = () => {
    total = gridN * gridN;
    cellsPerFrame = p.max(5, p.ceil(total / 90));

    // 12トーン × 24色相 から2色を選ぶ。
    // toneMode "same" は2色で同じトーンを共有し、"separate" は色ごとに別トーン。
    const toneIdx1 = p.floor(p.random(PCCS_TONES.length));
    const toneIdx2 =
      toneMode === "same"
        ? toneIdx1
        : (toneIdx1 + p.floor(p.random(1, PCCS_TONES.length))) % PCCS_TONES.length;
    const tones = [PCCS_TONES[toneIdx1], PCCS_TONES[toneIdx2]];

    const hueIdx1 = p.floor(p.random(PCCS_HUES.length));
    // 2色目は色相環上で十分に離れた位置(隣接6段階以内を避ける)から選ぶ
    const offset = p.floor(p.random(6, PCCS_HUES.length - 5));
    const hueIdx2 = (hueIdx1 + offset) % PCCS_HUES.length;
    const hues = [PCCS_HUES[hueIdx1], PCCS_HUES[hueIdx2]];

    palette = [
      p.color(hues[0].h, tones[0].s, tones[0].b),
      p.color(hues[1].h, tones[1].s, tones[1].b),
      p.color(0, 0, 100),
    ];
    updateInfo([
      { tone: tones[0], hue: hues[0] },
      { tone: tones[1], hue: hues[1] },
    ]);

    // 3色の目標比率をランダムに決定(合計100%)
    const cuts = shuffle([p.random(), p.random()]).sort((a, b) => a - b);
    const targetRatio = [cuts[0], cuts[1] - cuts[0], 1 - cuts[1]];

    cellColorIndex = new Array(total).fill(-1);

    if (constraintEnabled) {
      buildConstrainedPattern(targetRatio);
    } else {
      buildScatterPattern(targetRatio);
    }

    revealed = 0;

    p.noStroke();
    p.background(245);

    p.loop();
  };

  // ラベル + 排他選択ボタン群を1行として作る。選択時は再生成まで行う。
  const addSegmentedRow = <T,>(
    parent: p5.Element,
    label: string,
    options: { value: T; label: string }[],
    getActive: () => T,
    onSelect: (value: T) => void,
  ) => {
    const row = p.createDiv().parent(parent);
    row.style("display", "flex");
    row.style("align-items", "center");
    row.style("gap", "8px");

    const labelSpan = p.createSpan(label).parent(row);
    labelSpan.style("min-width", "5.5em");

    const buttons: { value: T; el: p5.Element }[] = [];
    const refresh = () => {
      const active = getActive();
      for (const btn of buttons) {
        const on = btn.value === active;
        btn.el.style("background", on ? "#eee" : "transparent");
        btn.el.style("color", on ? "#111" : "#eee");
      }
    };

    for (const option of options) {
      const btn = p.createButton(option.label).parent(row);
      btn.style("padding", "4px 12px");
      btn.style("border", "1px solid #666");
      btn.style("border-radius", "4px");
      btn.style("cursor", "pointer");
      btn.style("font-size", "13px");
      btn.mousePressed(() => {
        onSelect(option.value);
        refresh();
        generatePattern();
      });
      buttons.push({ value: option.value, el: btn });
    }

    refresh();
  };

  const buildControls = () => {
    const controls = p.createDiv();
    controls.id("color-grid-controls");
    controls.style("width", `${size}px`);
    controls.style("box-sizing", "border-box");
    controls.style("padding", "16px");
    controls.style("display", "flex");
    controls.style("flex-direction", "column");
    controls.style("gap", "12px");
    controls.style("font-family", "sans-serif");
    controls.style("font-size", "14px");
    controls.style("color", "#eee");

    addSegmentedRow(
      controls,
      "グリッド数",
      GRID_OPTIONS.map((value) => ({ value, label: String(value) })),
      () => gridN,
      (value) => {
        gridN = value;
      },
    );

    addSegmentedRow<ToneMode>(
      controls,
      "トーン",
      [
        { value: "same", label: "同一" },
        { value: "separate", label: "個別" },
      ],
      () => toneMode,
      (value) => {
        toneMode = value;
      },
    );

    const constraintRow = p.createDiv().parent(controls);
    constraintCheckbox = p
      .createCheckbox(" 5マス以上の連結を保証する", constraintEnabled)
      .parent(constraintRow);
    constraintCheckbox.elt.addEventListener("change", () => {
      constraintEnabled = Boolean(constraintCheckbox.elt.checked);
      generatePattern();
    });

    infoDiv = p.createDiv().parent(controls);
    infoDiv.style("padding-top", "12px");
    infoDiv.style("border-top", "1px solid #333");
    infoDiv.style("line-height", "1.6");
  };

  p.setup = () => {
    p.createCanvas(size, size);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    buildControls();
    generatePattern();
  };

  p.draw = () => {
    if (revealed >= total) {
      p.noLoop();
      return;
    }

    for (let k = 0; k < cellsPerFrame && revealed < total; k++, revealed++) {
      const idx = revealOrder[revealed];
      const { x, y, w, h } = cellRect(idx);

      p.fill(palette[cellColorIndex[idx]]);
      p.rect(x, y, w, h);
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
