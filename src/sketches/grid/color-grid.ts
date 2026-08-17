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

// PCCS の無彩色は明度 1.5(黒)〜9.5(白) のスケールで表す(表記例: Gy-5.5)。
// 白は常に含めるため、グレーとして使うのは 9.5 未満の範囲。
const GRAY_LIGHTNESS_MIN = 2.0;
const GRAY_LIGHTNESS_MAX = 8.5;

// 縦グラデーションの端(最も黒い/白い領域)をベタで塗るマス数の範囲
const GRADIENT_RUN_MIN = 5;
const GRADIENT_RUN_MAX = 30;
// グラデーションの階調数(0 = 黒、255 = 白)
const GRADIENT_LEVELS = 256;
// 蛇行塗りの彩度の段階数(0 = 白、255 = 最も鮮やか)
const SATURATION_LEVELS = 256;
// 彩度の往復が何回折り返したら色相を切り替えるか
const TURNS_PER_HUE = 2;

type Tone = (typeof PCCS_TONES)[number];
type Hue = (typeof PCCS_HUES)[number];
type ToneMode = "same" | "separate";
type PaletteMode = "chroma1" | "chroma2" | "gray2" | "gray3";
type FillMode = "random" | "gradient" | "serpentine";
type GradientDirection = "random" | "topDown";
type HueShift = "shift" | "fixed";

export const colorGridSketch = (p: p5) => {
  const size = 500;
  const minBlobSize = 5;
  const maxBlobSize = 18;

  let gridN = 100;
  let constraintEnabled = true;
  let toneMode: ToneMode = "same";
  let paletteMode: PaletteMode = "chroma2";
  let fillMode: FillMode = "random";
  let gradientDirection: GradientDirection = "random";
  let hueShift: HueShift = "shift";
  let total = gridN * gridN;
  let cellsPerFrame = 100;

  let palette: p5.Color[] = [];
  let cellColorIndex: number[] = [];
  let revealOrder: number[] = [];
  let revealed = 0;

  let constraintCheckbox: p5.Element;
  let infoDiv: p5.Element;
  let paletteRow: p5.Element;
  let toneRow: p5.Element;
  let constraintRow: p5.Element;
  let directionRow: p5.Element;
  let hueShiftRow: p5.Element;

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
    const filledCount = new Array(targetRatio.length).fill(0);

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
    const counts = targetRatio.map((r) => p.round(r * total));
    // 端数を最後の色で吸収し、合計を total にそろえる
    const assigned = counts.slice(0, -1).reduce((a, b) => a + b, 0);
    counts[counts.length - 1] = total - assigned;

    cellColorIndex = shuffle(
      counts.flatMap((count, colorIdx) => Array(count).fill(colorIdx)),
    );
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

  // PCCS 明度(1.5=黒 / 9.5=白) を HSB の明度 % に変換する
  const lightnessToBrightness = (lightness: number) =>
    ((lightness - 1.5) / 8) * 100;

  // 明度レンジを count 等分し、各帯から1つずつ選ぶ。
  // これで必ず明度が異なり、かつ十分に離れたグレーがランダムに得られる。
  const pickGrayLightnesses = (count: number) => {
    const span = (GRAY_LIGHTNESS_MAX - GRAY_LIGHTNESS_MIN) / count;
    return Array.from({ length: count }, (_, i) => {
      const lower = GRAY_LIGHTNESS_MIN + span * i;
      // PCCS 明度に合わせて 0.5 刻みに丸める
      return p.round(p.random(lower, lower + span) * 2) / 2;
    });
  };

  const swatchHtml = (color: p5.Color) =>
    `<span style="display:inline-block;width:12px;height:12px;border:1px solid #666;` +
    `vertical-align:-1px;margin-right:4px;background:${color.toString("#rrggbb")}"></span>`;

  const updateChromaInfo = (picks: { tone: Tone; hue: Hue }[]) => {
    // トーンを1行にまとめられるのは、単色のときと2色が同トーンのとき
    const singleToneLine =
      picks.length === 1 || picks.every((pick) => pick.tone === picks[0].tone);

    const toneLine = singleToneLine
      ? `トーン: <strong>${picks[0].tone.key}</strong> ${picks[0].tone.name}` +
        (picks.length > 1 ? "（2色共通）" : "")
      : "トーン: 色ごとに個別";

    const colorsHtml = picks
      .map(({ tone, hue }, i) => {
        const tonePart = singleToneLine
          ? ""
          : `<strong>${tone.key}</strong> ${tone.name} / `;
        return `${swatchHtml(palette[i])}${tonePart}${hue.no}:${hue.key} ${hue.name}`;
      })
      .join("　");

    infoDiv.html(
      `<div>${toneLine}</div>` +
        `<div style="margin-top:4px">${singleToneLine ? "色相" : "色"}: ` +
        `${colorsHtml}　${swatchHtml(palette[picks.length])}白</div>`,
    );
  };

  const updateGrayInfo = (lightnesses: number[]) => {
    const colorsHtml = lightnesses
      .map(
        (l, i) => `${swatchHtml(palette[i])}<strong>Gy-${l.toFixed(1)}</strong>`,
      )
      .join("　");

    infoDiv.html(
      `<div>トーン: 無彩色（明度 1.5〜9.5 のグレースケール）</div>` +
        `<div style="margin-top:4px">明度: ${colorsHtml}　` +
        `${swatchHtml(palette[lightnesses.length])}<strong>W-9.5</strong> 白</div>`,
    );
  };

  // 端をベタ塗りするマス数の範囲。グリッドが小さいときはグラデーション部分が
  // 潰れないよう、グリッド数の35%を上限として切り詰める。
  const gradientRunRange = () => {
    const upper = p.max(1, p.min(GRADIENT_RUN_MAX, p.floor(gridN * 0.35)));
    return { lower: p.min(GRADIENT_RUN_MIN, upper), upper };
  };

  // 列ごとに黒→白の縦グラデーションを作る。向きは設定に応じて上から下に統一するか
  // 列単位でランダムに反転させる。両端(最も黒い領域と最も白い領域)は
  // 数マス分を同じ明度でベタ塗りする。
  const buildVerticalGradientPattern = () => {
    palette = Array.from({ length: GRADIENT_LEVELS }, (_, i) =>
      p.color(0, 0, (i / (GRADIENT_LEVELS - 1)) * 100),
    );

    const { lower, upper } = gradientRunRange();

    for (let col = 0; col < gridN; col++) {
      const flipped = gradientDirection === "random" && p.random() < 0.5;
      const darkRun = p.floor(p.random(lower, upper + 1));
      const lightRun = p.floor(p.random(lower, upper + 1));
      const rampLen = gridN - darkRun - lightRun;

      for (let i = 0; i < gridN; i++) {
        let t: number;
        if (i < darkRun) {
          t = 0;
        } else if (i >= gridN - lightRun) {
          t = 1;
        } else {
          t = (i - darkRun + 1) / (rampLen + 1);
        }

        const row = flipped ? gridN - 1 - i : i;
        cellColorIndex[row * gridN + col] = p.round(t * (GRADIENT_LEVELS - 1));
      }
    }

    revealOrder = shuffle(Array.from({ length: total }, (_, i) => i));
  };

  const updateGradientInfo = () => {
    const { lower, upper } = gradientRunRange();
    infoDiv.html(
      `<div>塗り方: 縦グラデーション（黒 → 白 / ` +
        `${
          gradientDirection === "topDown"
            ? "全列とも上から下"
            : "向きは列ごとにランダム反転"
        }）</div>` +
        `<div style="margin-top:4px">両端のベタ塗り: ` +
        `<strong>${lower}〜${upper}</strong> マス連結` +
        (upper < GRADIENT_RUN_MAX
          ? `（グリッド数 ${gridN} に合わせて上限を縮小）`
          : "") +
        `　階調: ${GRADIENT_LEVELS}</div>`,
    );
  };

  // 左上を起点に「下 → 1マス右 → 上 → 1マス右 → 下…」と蛇行しながら塗り、
  // 進むたびに彩度を1段階ずつ動かす。端に達したら向きを反転して往復させ、
  // 2回折り返す(＝白 → 鮮やか → 白 を一巡する)ごとに色相を隣へ1つずらす。
  const buildSerpentinePattern = () => {
    // パレットは「色相 × 彩度」の総当たり。添字は hueIdx * SATURATION_LEVELS + level。
    palette = PCCS_HUES.flatMap((hue) =>
      Array.from({ length: SATURATION_LEVELS }, (_, i) =>
        p.color(hue.h, (i / (SATURATION_LEVELS - 1)) * 100, 100),
      ),
    );

    // 色相環を回る向きは最初に決めて固定する(常に隣へ進むので色相もグラデーションになる)
    const hueStep = p.random() < 0.5 ? 1 : -1;

    let hueIdx = p.floor(p.random(PCCS_HUES.length));
    const usedHues: Hue[] = [PCCS_HUES[hueIdx]];

    revealOrder = [];
    let level = 0;
    let step = 1;
    let turns = 0;

    for (let col = 0; col < gridN; col++) {
      const downward = col % 2 === 0;
      for (let k = 0; k < gridN; k++) {
        const row = downward ? k : gridN - 1 - k;
        const idx = row * gridN + col;

        cellColorIndex[idx] = hueIdx * SATURATION_LEVELS + level;
        revealOrder.push(idx);

        // 端に達したら折り返す(端の値が2マス続かないよう1つ内側へ戻す)
        level += step;
        if (level > SATURATION_LEVELS - 1) {
          level = SATURATION_LEVELS - 2;
          step = -1;
          turns++;
        } else if (level < 0) {
          level = 1;
          step = 1;
          turns++;
        }

        // 2回目の折り返しは彩度0(白)の位置なので、ここで色相を変えても継ぎ目が出ない
        if (turns >= TURNS_PER_HUE) {
          turns = 0;
          if (hueShift === "shift") {
            hueIdx =
              (hueIdx + hueStep + PCCS_HUES.length) % PCCS_HUES.length;
            usedHues.push(PCCS_HUES[hueIdx]);
          }
        }
      }
    }

    return { usedHues, hueStep };
  };

  const updateSerpentineInfo = ({
    usedHues,
    hueStep,
  }: {
    usedHues: Hue[];
    hueStep: number;
  }) => {
    const shown = usedHues.slice(0, 8);
    const vividOf = (hue: Hue) =>
      palette[PCCS_HUES.indexOf(hue) * SATURATION_LEVELS + SATURATION_LEVELS - 1];
    const hueHtml =
      shown
        .map((hue) => `${swatchHtml(vividOf(hue))}${hue.no}:${hue.key} ${hue.name}`)
        .join("　") + (usedHues.length > shown.length ? "　…" : "");

    const hueLine =
      hueShift === "shift"
        ? `色相: ${TURNS_PER_HUE}回折り返すごとに隣の色相へ` +
          `（色相環を${hueStep > 0 ? "番号が増える" : "番号が減る"}向きに巡回 / ` +
          `計 ${usedHues.length} 区間）`
        : "色相: 固定";

    infoDiv.html(
      `<div>塗り方: 蛇行グラデーション` +
        `（左上から 下 → 1マス右 → 上 を繰り返し）</div>` +
        `<div style="margin-top:4px">彩度: 0% ⇄ 100% を1マスにつき1段階` +
        `（${SATURATION_LEVELS}段階）で往復　${hueLine}</div>` +
        `<div style="margin-top:4px">使用色相: ${hueHtml}</div>`,
    );
  };

  const generatePattern = () => {
    total = gridN * gridN;
    cellsPerFrame = p.max(5, p.ceil(total / 90));
    cellColorIndex = new Array(total).fill(-1);

    if (fillMode !== "random") {
      if (fillMode === "gradient") {
        buildVerticalGradientPattern();
        updateGradientInfo();
      } else {
        updateSerpentineInfo(buildSerpentinePattern());
      }

      revealed = 0;
      p.noStroke();
      p.background(245);
      p.loop();
      return;
    }

    if (paletteMode === "gray2" || paletteMode === "gray3") {
      const lightnesses = pickGrayLightnesses(paletteMode === "gray2" ? 2 : 3);
      palette = [
        ...lightnesses.map((l) => p.color(0, 0, lightnessToBrightness(l))),
        p.color(0, 0, 100),
      ];
      updateGrayInfo(lightnesses);
    } else {
      // 12トーン × 24色相 から有彩色を選ぶ。
      // toneMode "same" は2色で同じトーンを共有し、"separate" は色ごとに別トーン。
      const toneIdx1 = p.floor(p.random(PCCS_TONES.length));
      const hueIdx1 = p.floor(p.random(PCCS_HUES.length));
      const picks: { tone: Tone; hue: Hue }[] = [
        { tone: PCCS_TONES[toneIdx1], hue: PCCS_HUES[hueIdx1] },
      ];

      if (paletteMode === "chroma2") {
        const toneIdx2 =
          toneMode === "same"
            ? toneIdx1
            : (toneIdx1 + p.floor(p.random(1, PCCS_TONES.length))) % PCCS_TONES.length;
        // 2色目は色相環上で十分に離れた位置(隣接6段階以内を避ける)から選ぶ
        const offset = p.floor(p.random(6, PCCS_HUES.length - 5));
        const hueIdx2 = (hueIdx1 + offset) % PCCS_HUES.length;
        picks.push({ tone: PCCS_TONES[toneIdx2], hue: PCCS_HUES[hueIdx2] });
      }

      palette = [
        ...picks.map(({ tone, hue }) => p.color(hue.h, tone.s, tone.b)),
        p.color(0, 0, 100),
      ];
      updateChromaInfo(picks);
    }

    // 各色の目標比率をランダムに決定(合計100%)。
    // 区間 [0,1] を palette.length - 1 個の切れ目で分割した各幅を比率とする。
    const cuts = Array.from({ length: palette.length - 1 }, () => p.random()).sort(
      (a, b) => a - b,
    );
    const bounds = [0, ...cuts, 1];
    const targetRatio = bounds.slice(1).map((upper, i) => upper - bounds[i]);

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

  const setRowEnabled = (row: p5.Element, enabled: boolean) => {
    row.style("opacity", enabled ? "1" : "0.35");
    row.style("pointer-events", enabled ? "auto" : "none");
  };

  // グラデーション系の塗り方は明度/彩度で色が決まるため配色・トーン・連結は効かない。
  // トーンの組み合わせ指定が意味を持つのは有彩色2色のときだけ。
  const refreshRowStates = () => {
    const randomFill = fillMode === "random";
    setRowEnabled(directionRow, fillMode === "gradient");
    setRowEnabled(hueShiftRow, fillMode === "serpentine");
    setRowEnabled(paletteRow, randomFill);
    setRowEnabled(toneRow, randomFill && paletteMode === "chroma2");
    setRowEnabled(constraintRow, randomFill);
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
    row.style("flex-wrap", "wrap");
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
    return row;
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

    addSegmentedRow<FillMode>(
      controls,
      "塗り方",
      [
        { value: "random", label: "ランダム" },
        { value: "gradient", label: "縦グラデーション" },
        { value: "serpentine", label: "蛇行グラデーション" },
      ],
      () => fillMode,
      (value) => {
        fillMode = value;
        refreshRowStates();
      },
    );

    directionRow = addSegmentedRow<GradientDirection>(
      controls,
      "向き",
      [
        { value: "random", label: "列ごとランダム" },
        { value: "topDown", label: "上から下" },
      ],
      () => gradientDirection,
      (value) => {
        gradientDirection = value;
      },
    );

    hueShiftRow = addSegmentedRow<HueShift>(
      controls,
      "色相変化",
      [
        { value: "shift", label: "隣へずらす" },
        { value: "fixed", label: "固定" },
      ],
      () => hueShift,
      (value) => {
        hueShift = value;
      },
    );

    paletteRow = addSegmentedRow<PaletteMode>(
      controls,
      "配色",
      [
        { value: "chroma1", label: "1色 + 白" },
        { value: "chroma2", label: "2色 + 白" },
        { value: "gray2", label: "グレー2 + 白" },
        { value: "gray3", label: "グレー3 + 白" },
      ],
      () => paletteMode,
      (value) => {
        paletteMode = value;
        refreshRowStates();
      },
    );

    toneRow = addSegmentedRow<ToneMode>(
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

    constraintRow = p.createDiv().parent(controls);
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

    refreshRowStates();
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
