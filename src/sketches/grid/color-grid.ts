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
// 色グラデーションで使う色数の範囲と、色相どうしの最小の離れ(24色相中の段階数)
const COLOR_GRADIENT_STOPS_MIN = 2;
const COLOR_GRADIENT_STOPS_MAX = 4;
const COLOR_GRADIENT_HUE_GAP = 3;
// 連結グラデーションで、上端 / 下端に適用する連結マス数
const BLOB_GRADIENT_TOP = 100;
const BLOB_GRADIENT_BOTTOM = 1;

type Tone = (typeof PCCS_TONES)[number];
type Hue = (typeof PCCS_HUES)[number];
type ToneMode = "same" | "separate";
// chroma2Only は有彩色2色だけで塗り、白を含めない。
type PaletteMode = "chroma1" | "chroma2" | "chroma2Only" | "gray2" | "gray3";
// colorGradient は明度ではなく、ランダムに選んだ2〜4色の間を補間する縦グラデーション。
type FillMode =
  | "random"
  | "gradient"
  | "colorGradient"
  | "serpentine"
  | "blobGradient";
type GradientDirection = "random" | "topDown";
type HueShift = "shift" | "fixed";
// 蛇行グラデーションで何を変化させるか。saturation は彩度の往復、
// colorStops はランダムな2〜4色の間を色グラデーションと同じ補間で往復する。
type SerpentineChange = "saturation" | "colorStops";
// rowZigzag は2行を「下 → 右 → 上 → 右」とジグザグに進み、端で次の2行へ折り返す。
type WalkMode = "column" | "rowZigzag" | "random";

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
  let serpentineChange: SerpentineChange = "saturation";
  let walkMode: WalkMode = "column";
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
  let serpentineChangeRow: p5.Element;
  let walkRow: p5.Element;

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

  // 目標サイズに届かないまま袋小路で止まったブロブ(残りかす)を、
  // 最も長く接している隣のブロブに吸収させる。色を塗る前にブロブ単位で統合するので、
  // 塗り上がりのすべての連結領域が minSize マス以上であることが構成的に保証される。
  const mergeUndersizedBlobs = (
    blobs: number[][],
    blobOf: Int32Array,
    minSize: number,
  ) => {
    const undersized = blobs
      .map((_, i) => i)
      .filter((i) => blobs[i].length < minSize)
      .sort((a, b) => blobs[a].length - blobs[b].length);

    for (const i of undersized) {
      // 先に別の残りかすを吸収して minSize に達していれば統合不要
      if (blobs[i].length === 0 || blobs[i].length >= minSize) continue;

      const contact = new Map<number, number>();
      for (const cell of blobs[i]) {
        for (const n of neighborsOf(cell)) {
          const j = blobOf[n];
          if (j !== i) contact.set(j, (contact.get(j) ?? 0) + 1);
        }
      }
      if (contact.size === 0) continue;

      let target = -1;
      let bestContact = -1;
      for (const [j, count] of contact) {
        if (count > bestContact) {
          bestContact = count;
          target = j;
        }
      }
      for (const cell of blobs[i]) {
        blobOf[cell] = target;
        blobs[target].push(cell);
      }
      blobs[i] = [];
    }

    return blobs.filter((blob) => blob.length > 0);
  };

  // 連結領域(ブロブ)をランダムな形状で育てながら塗っていく。
  // 1つあたりの目標マス数は targetSizeFor(種マスの位置) で決める。
  // minSize 未満で止まったブロブは隣のブロブに吸収させる(1 なら吸収しない)。
  const growBlobs = (
    targetRatio: number[],
    targetSizeFor: (seedIdx: number) => number,
    minSize = 1,
  ) => {
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

    const blobOf = new Int32Array(total).fill(-1);
    let blobs: number[][] = [];

    while (unfilledList.length > 0) {
      const seed = unfilledList[p.floor(p.random(unfilledList.length))];
      const targetSize = targetSizeFor(seed);
      const id = blobs.length;

      const blob = [seed];
      removeFromUnfilled(seed);
      blobOf[seed] = id;
      const frontier = new Set<number>();
      for (const n of neighborsOf(seed)) {
        if (positionInList[n] !== -1) frontier.add(n);
      }

      while (blob.length < targetSize && frontier.size > 0) {
        const candidates = Array.from(frontier);
        // 既にブロブに含まれる隣接マスが多い候補を強く優先し、
        // 1マス幅の糸状に伸びず、丸みのある塊として育てる。
        const weights = candidates.map((c) => {
          let inside = 0;
          for (const n of neighborsOf(c)) if (blobOf[n] === id) inside++;
          return inside ** 3;
        });
        const next = candidates[weightedPick(weights)];
        frontier.delete(next);

        blob.push(next);
        removeFromUnfilled(next);
        blobOf[next] = id;
        for (const n of neighborsOf(next)) {
          if (positionInList[n] !== -1) frontier.add(n);
        }
      }

      blobs.push(blob);
    }

    if (minSize > 1) blobs = mergeUndersizedBlobs(blobs, blobOf, minSize);

    const filledCount = new Array(targetRatio.length).fill(0);
    for (const blob of blobs) {
      const deficits = targetRatio.map((r, i) => r * total - filledCount[i]);
      const colorIdx = weightedPick(deficits);
      for (const cell of blob) cellColorIndex[cell] = colorIdx;
      filledCount[colorIdx] += blob.length;
    }

    return blobs;
  };

  // 5マス以上の連結領域(ブロブ)をランダムな形状で育てながら塗っていく。
  // 5マス未満で止まったブロブは隣のブロブに吸収されるため、同色領域は必ず5マス以上になる。
  const buildConstrainedPattern = (targetRatio: number[]) => {
    const blobs = growBlobs(
      targetRatio,
      () => p.floor(p.random(minBlobSize, maxBlobSize + 1)),
      minBlobSize,
    );

    revealOrder = ([] as number[]).concat(...blobs);
  };

  // 上端は大きな連結、下端は1マスと、行が下がるほど連結制約をゆるめていく。
  // ブロブは種マスから上下へも広がるため境界は厳密ではなく、おおよその傾向として効く。
  const buildBlobGradientPattern = (targetRatio: number[]) => {
    const blobs = growBlobs(targetRatio, (seed) => {
      const row = p.floor(seed / gridN);
      const t = gridN > 1 ? row / (gridN - 1) : 0;
      const size = p.lerp(BLOB_GRADIENT_TOP, BLOB_GRADIENT_BOTTOM, t);
      // 端数を確率的に切り上げ、境目が階段状にならないようにする
      return p.max(1, p.floor(size + p.random()));
    });

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

  const appendInfoLine = (html: string) => {
    infoDiv.elt.insertAdjacentHTML(
      "beforeend",
      `<div style="margin-top:4px">${html}</div>`,
    );
  };

  const updateChromaInfo = (
    picks: { tone: Tone; hue: Hue }[],
    includeWhite: boolean,
  ) => {
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
        colorsHtml +
        (includeWhite ? `　${swatchHtml(palette[picks.length])}白` : "") +
        `</div>`,
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

  // 列ごとに palette の先頭 → 末尾へ向かう縦グラデーションを敷く。向きは設定に応じて
  // 上から下に統一するか列単位でランダムに反転させる。両端は数マス分を同じ色でベタ塗りする。
  // palette は GRADIENT_LEVELS 段階で呼び出し側が用意する。
  const layoutVerticalGradient = () => {
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

  // 黒 → 白の明度グラデーション
  const buildVerticalGradientPattern = () => {
    palette = Array.from({ length: GRADIENT_LEVELS }, (_, i) =>
      p.color(0, 0, (i / (GRADIENT_LEVELS - 1)) * 100),
    );
    layoutVerticalGradient();
  };

  // 色グラデーションの中継色をランダムに 2〜4 色選ぶ。色相は互いに離れたものにし、
  // トーンは toneMode に応じて全色共通か色ごとに個別にする。
  const pickGradientStops = () => {
    const count = p.floor(
      p.random(COLOR_GRADIENT_STOPS_MIN, COLOR_GRADIENT_STOPS_MAX + 1),
    );
    const hueCount = PCCS_HUES.length;
    const hueDistance = (a: number, b: number) => {
      const d = p.abs(a - b) % hueCount;
      return p.min(d, hueCount - d);
    };

    const hueIdxs: number[] = [];
    for (let tries = 0; hueIdxs.length < count && tries < 1000; tries++) {
      const candidate = p.floor(p.random(hueCount));
      if (hueIdxs.every((h) => hueDistance(h, candidate) >= COLOR_GRADIENT_HUE_GAP)) {
        hueIdxs.push(candidate);
      }
    }

    const sharedTone = PCCS_TONES[p.floor(p.random(PCCS_TONES.length))];
    return hueIdxs.map((hueIdx) => ({
      tone:
        toneMode === "same"
          ? sharedTone
          : PCCS_TONES[p.floor(p.random(PCCS_TONES.length))],
      hue: PCCS_HUES[hueIdx],
    }));
  };

  // 中継色の並びを等間隔に置き、隣り合う中継色の間を HSB で補間する。
  // 色相は色相環上の近い側を通る。
  const interpolateStops = (stops: { tone: Tone; hue: Hue }[], t: number) => {
    const segments = stops.length - 1;
    const pos = t * segments;
    const i = p.min(p.floor(pos), segments - 1);
    const f = pos - i;
    const from = stops[i];
    const to = stops[i + 1];
    const hueDelta = ((to.hue.h - from.hue.h + 540) % 360) - 180;
    return p.color(
      (from.hue.h + hueDelta * f + 360) % 360,
      p.lerp(from.tone.s, to.tone.s, f),
      p.lerp(from.tone.b, to.tone.b, f),
    );
  };

  // ランダムな 2〜4 色の間を補間する色グラデーション
  const buildColorGradientPattern = () => {
    const stops = pickGradientStops();
    palette = Array.from({ length: GRADIENT_LEVELS }, (_, i) =>
      interpolateStops(stops, i / (GRADIENT_LEVELS - 1)),
    );
    layoutVerticalGradient();
    return stops;
  };

  const gradientRunHtml = () => {
    const { lower, upper } = gradientRunRange();
    return (
      `<div style="margin-top:4px">両端のベタ塗り: ` +
      `<strong>${lower}〜${upper}</strong> マス連結` +
      (upper < GRADIENT_RUN_MAX
        ? `（グリッド数 ${gridN} に合わせて上限を縮小）`
        : "") +
      `　階調: ${GRADIENT_LEVELS}</div>`
    );
  };

  const directionLabel = () =>
    gradientDirection === "topDown"
      ? "全列とも上から下"
      : "向きは列ごとにランダム反転";

  const updateGradientInfo = () => {
    infoDiv.html(
      `<div>塗り方: 縦グラデーション（黒 → 白 / ${directionLabel()}）</div>` +
        gradientRunHtml(),
    );
  };

  // 中継色の一覧(トーン行 + 色の並び)を表示用 HTML にする
  const gradientStopsHtml = (stops: { tone: Tone; hue: Hue }[]) => {
    const singleTone = stops.every((stop) => stop.tone === stops[0].tone);
    const toneLine = singleTone
      ? `トーン: <strong>${stops[0].tone.key}</strong> ${stops[0].tone.name}（全色共通）`
      : "トーン: 色ごとに個別";
    const stopsHtml = stops
      .map(({ tone, hue }) => {
        const tonePart = singleTone ? "" : `<strong>${tone.key}</strong> ${tone.name} / `;
        return (
          `${swatchHtml(p.color(hue.h, tone.s, tone.b))}` +
          `${tonePart}${hue.no}:${hue.key} ${hue.name}`
        );
      })
      .join(" → ");
    return `${toneLine}</div><div style="margin-top:4px">色: ${stopsHtml}`;
  };

  const updateColorGradientInfo = (stops: { tone: Tone; hue: Hue }[]) => {
    infoDiv.html(
      `<div>塗り方: 色グラデーション（${stops.length}色 / ${directionLabel()}）</div>` +
        `<div style="margin-top:4px">${gradientStopsHtml(stops)}</div>` +
        gradientRunHtml(),
    );
  };

  // 「下 → 1マス右 → 上 → 1マス右 → 下…」と列単位で往復する経路
  const columnWalkOrder = () => {
    const order: number[] = [];
    for (let col = 0; col < gridN; col++) {
      const downward = col % 2 === 0;
      for (let k = 0; k < gridN; k++) {
        const row = downward ? k : gridN - 1 - k;
        order.push(row * gridN + col);
      }
    }
    return order;
  };

  // dir: 0=上 1=右 2=下 3=左。進めない場合は -1 を返す。
  const stepFrom = (idx: number, dir: number) => {
    const col = idx % gridN;
    const row = p.floor(idx / gridN);
    if (dir === 0) return row > 0 ? idx - gridN : -1;
    if (dir === 1) return col < gridN - 1 ? idx + 1 : -1;
    if (dir === 2) return row < gridN - 1 ? idx + gridN : -1;
    return col > 0 ? idx - 1 : -1;
  };

  // 左上から下へ進み、行き止まる or 一定距離進んだら、未塗りの隣接マスから
  // 進む向きをランダムに選び直す自己回避ウォーク。
  // 「行き止まるまで直進」だけにすると未塗り領域の外周をなぞって渦巻きになるため、
  // 直進距離にも上限を設けて上下左右に行き来させている。
  const randomWalkOrder = () => {
    const painted = new Uint8Array(total);
    const order: number[] = [];

    const openDirections = (from: number) => {
      const dirs: number[] = [];
      for (let d = 0; d < 4; d++) {
        const candidate = stepFrom(from, d);
        if (candidate >= 0 && !painted[candidate]) dirs.push(d);
      }
      return dirs;
    };

    const visit = (idx: number) => {
      painted[idx] = 1;
      order.push(idx);
    };

    const newRunLength = () => p.floor(p.random(3, p.max(5, gridN / 4)));

    let pos = 0;
    let dir = 2; // 最初は下向き
    let runLeft = newRunLength();
    visit(pos);

    // 完全な行き止まりに陥ったときの再開位置(前へ進むだけなので全体で O(total))
    let cursor = 0;

    while (order.length < total) {
      if (runLeft > 0) {
        const ahead = stepFrom(pos, dir);
        if (ahead >= 0 && !painted[ahead]) {
          pos = ahead;
          visit(pos);
          runLeft--;
          continue;
        }
      }

      const options = openDirections(pos);
      if (options.length > 0) {
        dir = options[p.floor(p.random(options.length))];
        pos = stepFrom(pos, dir);
      } else {
        // 四方すべて塗り済み。未塗りのマスまで飛んで続きから再開する
        while (cursor < total && painted[cursor]) cursor++;
        pos = cursor;
        const restart = openDirections(pos);
        if (restart.length > 0) dir = restart[p.floor(p.random(restart.length))];
      }

      visit(pos);
      runLeft = newRunLength();
    }

    return order;
  };

  // 左上を起点に「下 → 1マス右 → 上 → 1マス右 → 下…」と蛇行しながら塗り、
  // 2行を1組として「下 → 1マス右 → 上 → 1マス右 → 下…」とジグザグに横へ進み、
  // 端まで来たら下の2行へ移って逆向き(右 → 左)に同じジグザグで戻る経路。
  // 左上から出発する。グリッド数が奇数のときは最後の1行だけ横に進む。
  const rowZigzagWalkOrder = () => {
    const order: number[] = [];
    for (let band = 0; band * 2 < gridN; band++) {
      const top = band * 2;
      const bottom = p.min(top + 1, gridN - 1);
      const rightward = band % 2 === 0;
      for (let k = 0; k < gridN; k++) {
        const col = rightward ? k : gridN - 1 - k;
        // 偶数番目の列は上から下へ、奇数番目は下から上へ通る
        const rows =
          bottom === top ? [top] : k % 2 === 0 ? [top, bottom] : [bottom, top];
        for (const row of rows) order.push(row * gridN + col);
      }
    }
    return order;
  };

  const walkOrderFor = (mode: WalkMode) => {
    if (mode === "random") return randomWalkOrder();
    if (mode === "rowZigzag") return rowZigzagWalkOrder();
    return columnWalkOrder();
  };

  // 経路に沿って 0 → levels-1 → 0 … と1マスにつき1段階ずつ往復する値を各マスに渡す。
  // 端に達したら折り返す(端の値が2マス続かないよう1つ内側へ戻す)。
  // paint の turned は、そのマスを塗った直後に折り返したときだけ true。
  const walkPingPong = (
    levels: number,
    paint: (idx: number, level: number, turned: boolean) => void,
  ) => {
    const order = walkOrderFor(walkMode);
    let level = 0;
    let step = 1;

    for (const idx of order) {
      const current = level;
      let turned = false;
      level += step;
      if (level > levels - 1) {
        level = levels - 2;
        step = -1;
        turned = true;
      } else if (level < 0) {
        level = 1;
        step = 1;
        turned = true;
      }
      paint(idx, current, turned);
    }

    revealOrder = order;
  };

  const walkLabel = () =>
    walkMode === "random"
      ? "左上から出発し、行き止まりごとに進む向きをランダムに選択"
      : walkMode === "rowZigzag"
        ? "左上から 下 → 右 → 上 → 右 と2行をジグザグに進み、端で次の2行へ折り返し"
        : "左上から 下 → 1マス右 → 上 を繰り返し";

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

    let turns = 0;
    walkPingPong(SATURATION_LEVELS, (idx, level, turned) => {
      cellColorIndex[idx] = hueIdx * SATURATION_LEVELS + level;
      if (!turned) return;
      // 2回目の折り返しは彩度0(白)の位置なので、ここで色相を変えても継ぎ目が出ない
      turns++;
      if (turns >= TURNS_PER_HUE) {
        turns = 0;
        if (hueShift === "shift") {
          hueIdx = (hueIdx + hueStep + PCCS_HUES.length) % PCCS_HUES.length;
          usedHues.push(PCCS_HUES[hueIdx]);
        }
      }
    });

    return { usedHues, hueStep };
  };

  // 蛇行の色グラデーション。ランダムな 2〜4 色の間を 1マスにつき1段階で進み、
  // 端の色に達したら折り返して往復する。
  const buildSerpentineColorPattern = () => {
    const stops = pickGradientStops();
    palette = Array.from({ length: GRADIENT_LEVELS }, (_, i) =>
      interpolateStops(stops, i / (GRADIENT_LEVELS - 1)),
    );
    walkPingPong(GRADIENT_LEVELS, (idx, level) => {
      cellColorIndex[idx] = level;
    });
    return stops;
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
      `<div>塗り方: 蛇行グラデーション（${walkLabel()}）</div>` +
        `<div style="margin-top:4px">彩度: 0% ⇄ 100% を1マスにつき1段階` +
        `（${SATURATION_LEVELS}段階）で往復　${hueLine}</div>` +
        `<div style="margin-top:4px">使用色相: ${hueHtml}</div>`,
    );
  };

  const updateSerpentineColorInfo = (stops: { tone: Tone; hue: Hue }[]) => {
    infoDiv.html(
      `<div>塗り方: 蛇行グラデーション（${walkLabel()}）</div>` +
        `<div style="margin-top:4px">変化: ${stops.length}色の色グラデーションを` +
        `1マスにつき1段階（${GRADIENT_LEVELS}段階）で往復</div>` +
        `<div style="margin-top:4px">${gradientStopsHtml(stops)}</div>`,
    );
  };

  const generatePattern = () => {
    total = gridN * gridN;
    cellsPerFrame = p.max(5, p.ceil(total / 90));
    cellColorIndex = new Array(total).fill(-1);

    // 明度/彩度で色が決まる塗り方は、配色パレットを使わず独自に色を組み立てる
    if (
      fillMode === "gradient" ||
      fillMode === "colorGradient" ||
      fillMode === "serpentine"
    ) {
      if (fillMode === "gradient") {
        buildVerticalGradientPattern();
        updateGradientInfo();
      } else if (fillMode === "colorGradient") {
        updateColorGradientInfo(buildColorGradientPattern());
      } else if (serpentineChange === "colorStops") {
        updateSerpentineColorInfo(buildSerpentineColorPattern());
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

      const twoChroma = paletteMode === "chroma2" || paletteMode === "chroma2Only";
      if (twoChroma) {
        const toneIdx2 =
          toneMode === "same"
            ? toneIdx1
            : (toneIdx1 + p.floor(p.random(1, PCCS_TONES.length))) % PCCS_TONES.length;
        // 2色目は色相環上で十分に離れた位置(隣接6段階以内を避ける)から選ぶ
        const offset = p.floor(p.random(6, PCCS_HUES.length - 5));
        const hueIdx2 = (hueIdx1 + offset) % PCCS_HUES.length;
        picks.push({ tone: PCCS_TONES[toneIdx2], hue: PCCS_HUES[hueIdx2] });
      }

      const includeWhite = paletteMode !== "chroma2Only";
      palette = picks.map(({ tone, hue }) => p.color(hue.h, tone.s, tone.b));
      if (includeWhite) palette.push(p.color(0, 0, 100));
      updateChromaInfo(picks, includeWhite);
    }

    // 各色の目標比率をランダムに決定(合計100%)。
    // 区間 [0,1] を palette.length - 1 個の切れ目で分割した各幅を比率とする。
    const cuts = Array.from({ length: palette.length - 1 }, () => p.random()).sort(
      (a, b) => a - b,
    );
    const bounds = [0, ...cuts, 1];
    const targetRatio = bounds.slice(1).map((upper, i) => upper - bounds[i]);

    if (fillMode === "blobGradient") {
      buildBlobGradientPattern(targetRatio);
      appendInfoLine(
        `塗り方: 連結グラデーション` +
          `（上端 約${BLOB_GRADIENT_TOP}マス連結 → 下端 ${BLOB_GRADIENT_BOTTOM}マス）`,
      );
    } else if (constraintEnabled) {
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
    // 配色パレットを使うのはランダム塗りと連結グラデーション。
    // 連結の指定は、連結グラデーションでは塗り方自体が決めるので効かない。
    const usesPalette = fillMode === "random" || fillMode === "blobGradient";
    setRowEnabled(
      directionRow,
      fillMode === "gradient" || fillMode === "colorGradient",
    );
    setRowEnabled(walkRow, fillMode === "serpentine");
    setRowEnabled(serpentineChangeRow, fillMode === "serpentine");
    // 色相変化は彩度の往復のときだけ意味を持つ
    const serpentineColor =
      fillMode === "serpentine" && serpentineChange === "colorStops";
    setRowEnabled(
      hueShiftRow,
      fillMode === "serpentine" && serpentineChange === "saturation",
    );
    setRowEnabled(paletteRow, usesPalette);
    // トーンの同一/個別は有彩色2色の配色と、色グラデーションの中継色に効く
    const twoChroma = paletteMode === "chroma2" || paletteMode === "chroma2Only";
    setRowEnabled(
      toneRow,
      (usesPalette && twoChroma) ||
        fillMode === "colorGradient" ||
        serpentineColor,
    );
    setRowEnabled(constraintRow, fillMode === "random");
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
        { value: "colorGradient", label: "色グラデーション" },
        { value: "serpentine", label: "蛇行グラデーション" },
        { value: "blobGradient", label: "連結グラデーション" },
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

    walkRow = addSegmentedRow<WalkMode>(
      controls,
      "経路",
      [
        { value: "column", label: "列を往復" },
        { value: "rowZigzag", label: "2行でジグザグ" },
        { value: "random", label: "ランダム" },
      ],
      () => walkMode,
      (value) => {
        walkMode = value;
      },
    );

    serpentineChangeRow = addSegmentedRow<SerpentineChange>(
      controls,
      "変化",
      [
        { value: "saturation", label: "彩度の往復" },
        { value: "colorStops", label: "色グラデーション" },
      ],
      () => serpentineChange,
      (value) => {
        serpentineChange = value;
        refreshRowStates();
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
        { value: "chroma2Only", label: "2色" },
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

  // 保存ファイル名: color-grid-{グリッド数}-{有効なパラメータ...}-{時刻}
  // 塗り方に効かない（UI で無効化されている）パラメータは含めない。
  const saveFileName = () => {
    const parts: string[] = ["color-grid", String(gridN), fillMode];

    if (fillMode === "gradient" || fillMode === "colorGradient") {
      parts.push(gradientDirection);
    }
    if (fillMode === "serpentine") {
      parts.push(walkMode, serpentineChange);
      if (serpentineChange === "saturation") parts.push(hueShift);
    }

    const usesPalette = fillMode === "random" || fillMode === "blobGradient";
    if (usesPalette) parts.push(paletteMode);

    const twoChroma =
      paletteMode === "chroma2" || paletteMode === "chroma2Only";
    const serpentineColor =
      fillMode === "serpentine" && serpentineChange === "colorStops";
    if (
      (usesPalette && twoChroma) ||
      fillMode === "colorGradient" ||
      serpentineColor
    ) {
      parts.push(toneMode);
    }

    if (fillMode === "random") {
      parts.push(constraintEnabled ? "constraint" : "noConstraint");
    }

    parts.push(String(Date.now()));
    return parts.join("-");
  };

  p.keyPressed = () => {
    if (p.key === "s" || p.key === "S") {
      p.saveCanvas(saveFileName(), "png");
    }
  };
};
