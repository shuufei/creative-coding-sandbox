import type p5 from "p5";

/**
 * 課題4「線による構成・動き / リズム」
 *
 * 制約（課題PDFより）
 * - 画面サイズ 150mm x 150mm
 * - 5本以上、すべて同じ長さ・同じ幅の線
 * - 線同士は重ならない・接しない
 * - 画面から切れない
 * - 線の端は直角（= 角丸なしの矩形）
 *
 * 2パターン
 * - motion : 同じ長さと幅の線による「動き」
 * - rhythm : 同じ長さと幅の線による「リズム表現」
 *
 * 本数・太さ・長さは上記制約の範囲でランダム。
 */

const MM = 150; // 画面サイズ(mm)
const PX_PER_MM = 5;
const SIZE = MM * PX_PER_MM; // 750px

const mm = (v: number) => v * PX_PER_MM;

// --- 制約レンジ（mm） ---
const COUNT_MIN = 5;
const COUNT_MAX = 11;
const WEIGHT_MIN = 1.5;
const WEIGHT_MAX = 6;
const LENGTH_MIN = 30;
const LENGTH_MAX = 120;
const MARGIN_MIN = 4; // 画面から切れないための余白
const MARGIN_MAX = 10;
const CLEARANCE_MIN = 1.5; // 「接しない」を保証する最小クリアランス

type Bar = { cx: number; cy: number; angle: number; len: number; w: number };
type PatternName = "motion" | "rhythm";

type Composition = {
  pattern: PatternName;
  bars: Bar[];
  weight: number; // mm
  length: number; // mm
};

/** 中心・角度・寸法から矩形の4隅を返す */
const cornersOf = (b: Bar, padLen = 0, padW = 0): [number, number][] => {
  const hx = (b.len + padLen) / 2;
  const hy = (b.w + padW) / 2;
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => [b.cx + x * c - y * s, b.cy + x * s + y * c] as [number, number]);
};

/** 分離軸判定。両者を clearance ぶん太らせて重なり・接触の両方を排除する */
const barsConflict = (a: Bar, b: Bar, clearance: number): boolean => {
  const ca = cornersOf(a, clearance, clearance);
  const cb = cornersOf(b, clearance, clearance);
  for (const angle of [a.angle, b.angle]) {
    for (const axis of [
      [Math.cos(angle), Math.sin(angle)],
      [-Math.sin(angle), Math.cos(angle)],
    ]) {
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const [x, y] of ca) {
        const d = x * axis[0] + y * axis[1];
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const [x, y] of cb) {
        const d = x * axis[0] + y * axis[1];
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax <= bMin || bMax <= aMin) return false; // 分離軸が見つかった
    }
  }
  return true;
};

const boundsOf = (bars: Bar[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bars) {
    for (const [x, y] of cornersOf(b)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

/** 構図全体を画面中央に寄せる */
const centerBars = (bars: Bar[]) => {
  const bb = boundsOf(bars);
  const dx = SIZE / 2 - (bb.minX + bb.maxX) / 2;
  const dy = SIZE / 2 - (bb.minY + bb.maxY) / 2;
  for (const b of bars) {
    b.cx += dx;
    b.cy += dy;
  }
};

/**
 * 構図を画面いっぱいに近づける。
 * 全体を等倍スケールするので「同じ長さ・同じ幅」も線間クリアランスも保たれる。
 */
const fitToFrame = (bars: Bar[], marginPx: number, fill: number) => {
  const bb = boundsOf(bars);
  if (bb.w <= 0 || bb.h <= 0) return;
  const avail = SIZE - marginPx * 2;
  let s = Math.min(avail / bb.w, avail / bb.h) * fill;
  // 長さ・太さの上限を超えないように抑える
  s = Math.min(s, mm(LENGTH_MAX) / bars[0].len, mm(WEIGHT_MAX) / bars[0].w);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  for (const b of bars) {
    b.cx = cx + (b.cx - cx) * s;
    b.cy = cy + (b.cy - cy) * s;
    b.len *= s;
    b.w *= s;
  }
  centerBars(bars);
};

/** 余白のゆとりの範囲で構図をずらし、中央固定の単調さを避ける */
const offsetInFrame = (bars: Bar[], marginPx: number, rx: number, ry: number) => {
  const bb = boundsOf(bars);
  const slackX = Math.max(0, (SIZE - marginPx * 2 - bb.w) / 2);
  const slackY = Math.max(0, (SIZE - marginPx * 2 - bb.h) / 2);
  for (const b of bars) {
    b.cx += slackX * rx;
    b.cy += slackY * ry;
  }
};

const validate = (bars: Bar[], margin: number, clearance: number): boolean => {
  const bb = boundsOf(bars);
  // 画面から切れない
  if (bb.minX < margin || bb.minY < margin || bb.maxX > SIZE - margin || bb.maxY > SIZE - margin) {
    return false;
  }
  // 重ならない・接しない
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      if (barsConflict(bars[i], bars[j], clearance)) return false;
    }
  }
  return true;
};

export const lines04MotionRhythmSketch = (p: p5) => {
  let composition: Composition;
  let forcedPattern: PatternName | null = null;

  /**
   * 動き：ピボットを一方向にずらしながら角度を少しずつスイープさせる扇状の構成。
   * イージング指数で「加速する動き」をつくる。
   */
  const buildMotion = (count: number, lenMM: number, wMM: number): Bar[] => {
    const len = mm(lenMM);
    const w = mm(wMM);

    const baseAngle = p.random(p.TWO_PI);
    const sweep = p.radians(p.random(12, 65)) * (p.random() < 0.5 ? -1 : 1);
    const ease = p.random(0.55, 2.2);
    // ピボット位置（線上のどこを軸に回すか）。0=端、0.5=中心
    const pivotT = p.random() < 0.35 ? p.random(0.35, 0.65) : p.random(0, 0.2);

    // ピボットを送る方向と間隔（等比で変化させて疎密をつくる）
    const stepDir = baseAngle + p.HALF_PI * (p.random() < 0.5 ? 1 : -1);
    const ux = Math.cos(stepDir);
    const uy = Math.sin(stepDir);
    const baseStep = mm(p.random(wMM * 2.2 + 3, wMM * 2.2 + 16));
    const ratio = p.random(0.82, 1.28);
    // 線に沿ったドリフト（左右にもずらして流れを出す）
    const driftPer = mm(p.random(-6, 6));

    const bars: Bar[] = [];
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const angle = baseAngle + sweep * Math.pow(t, ease);
      const drift = driftPer * i;
      const px = SIZE / 2 + ux * offset + Math.cos(baseAngle) * drift;
      const py = SIZE / 2 + uy * offset + Math.sin(baseAngle) * drift;
      // ピボットから中心を求める
      const shift = (0.5 - pivotT) * len;
      bars.push({
        cx: px + Math.cos(angle) * shift,
        cy: py + Math.sin(angle) * shift,
        angle,
        len,
        w,
      });
      offset += baseStep * Math.pow(ratio, i);
    }
    centerBars(bars);
    return bars;
  };

  /**
   * リズム：反復する単位（モチーフ）をつくる。
   * a) grid    … 格子に並べ、行ごとに角度をモチーフで切り替える
   * b) spacing … 平行線の間隔を反復パターンで刻む
   */
  const buildRhythm = (count: number, lenMM: number, wMM: number): Bar[] => {
    return p.random() < 0.5
      ? buildRhythmGrid(count, lenMM, wMM)
      : buildRhythmSpacing(count, lenMM, wMM);
  };

  const buildRhythmGrid = (count: number, lenMM: number, wMM: number): Bar[] => {
    const len = mm(lenMM);
    const w = mm(wMM);

    const cols = p.random() < 0.45 ? 2 : p.random() < 0.6 ? 3 : 1;
    // 反復が途切れないよう格子は必ず埋める（欠けた最終行をつくらない）
    const rows = Math.max(2, Math.ceil(count / cols));
    const total = cols * rows;

    const angleA = p.random(p.TWO_PI);
    const angleB = angleA + p.radians(p.random(30, 90)) * (p.random() < 0.5 ? -1 : 1);
    // モチーフ（反復単位）
    const motifs: number[][] = [
      [0, 1],
      [0, 1, 1],
      [0, 0, 1],
      [0, 1, 0, 1, 1],
    ];
    const motif = motifs[p.floor(p.random(motifs.length))];
    const mirrorCols = p.random() < 0.4;

    const cellW = len * p.random(1.05, 1.35) + mm(wMM * 2 + 4);
    const cellH = mm(wMM * 2.6 + p.random(5, 16)) + len * p.random(0.05, 0.35);

    const bars: Bar[] = [];
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const pick = motif[r % motif.length];
      let angle = pick === 0 ? angleA : angleB;
      if (mirrorCols && c % 2 === 1) angle = angleA * 2 - angle;
      bars.push({
        cx: SIZE / 2 + (c - (cols - 1) / 2) * cellW,
        cy: SIZE / 2 + (r - (rows - 1) / 2) * cellH,
        angle,
        len,
        w,
      });
    }
    centerBars(bars);
    return bars;
  };

  const buildRhythmSpacing = (count: number, lenMM: number, wMM: number): Bar[] => {
    const len = mm(lenMM);
    const w = mm(wMM);

    const angle = p.random(p.TWO_PI);
    const normal = angle + p.HALF_PI;
    const ux = Math.cos(normal);
    const uy = Math.sin(normal);

    // 間隔の反復パターン（短短長 など）
    const unit = mm(wMM + p.random(2.5, 9));
    const patterns: number[][] = [
      [1, 2],
      [1, 1, 2],
      [1, 2, 1, 3],
      [1, 1, 3],
    ];
    const gapPattern = patterns[p.floor(p.random(patterns.length))];
    // 線方向のずらしを反復させてシンコペーションを出す
    const slideUnit = p.random() < 0.5 ? 0 : len * p.random(0.06, 0.22);
    const slidePattern = [0, 1, 0, -1];

    const bars: Bar[] = [];
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const slide = slideUnit * slidePattern[i % slidePattern.length];
      bars.push({
        cx: SIZE / 2 + ux * offset + Math.cos(angle) * slide,
        cy: SIZE / 2 + uy * offset + Math.sin(angle) * slide,
        angle,
        len,
        w,
      });
      offset += mm(wMM) + unit * gapPattern[i % gapPattern.length];
    }
    centerBars(bars);
    return bars;
  };

  const generate = () => {
    const pattern: PatternName =
      forcedPattern ?? (p.random() < 0.5 ? "motion" : "rhythm");

    for (let attempt = 0; attempt < 900; attempt++) {
      // 試行を重ねても決まらないときは、本数を段階的に控えめにする
      const relax = Math.min(attempt / 900, 1);
      const count = p.floor(p.random(COUNT_MIN, p.lerp(COUNT_MAX, 7, relax) + 1));
      const weight = p.random(WEIGHT_MIN, WEIGHT_MAX);
      const length = p.random(LENGTH_MIN, LENGTH_MAX);
      const margin = mm(p.random(MARGIN_MIN, MARGIN_MAX));

      const bars =
        pattern === "motion"
          ? buildMotion(count, length, weight)
          : buildRhythm(count, length, weight);

      // 画面に対する占有率を決めてから配置する
      fitToFrame(bars, margin, p.random(0.8, 1));
      // 端に貼りつかない程度にずらす
      offsetInFrame(bars, margin, p.random(-0.7, 0.7), p.random(-0.7, 0.7));

      const finalLength = bars[0].len / PX_PER_MM;
      const finalWeight = bars[0].w / PX_PER_MM;
      if (finalLength < LENGTH_MIN || finalWeight < WEIGHT_MIN) continue;

      const clearance = mm(CLEARANCE_MIN + finalWeight * 0.35);
      if (validate(bars, margin, clearance)) {
        composition = { pattern, bars, weight: finalWeight, length: finalLength };
        render();
        return;
      }
    }

    // 最終フォールバック：確実に成立する等間隔の平行線
    const count = 6;
    const length = 100;
    const weight = 3;
    const gap = mm(12);
    const bars: Bar[] = Array.from({ length: count }, (_, i) => ({
      cx: SIZE / 2,
      cy: SIZE / 2 + (i - (count - 1) / 2) * gap,
      angle: 0,
      len: mm(length),
      w: mm(weight),
    }));
    composition = { pattern, bars, weight, length };
    render();
  };

  const render = () => {
    p.background(255);
    p.noStroke();
    p.fill(20);
    p.rectMode(p.CENTER);
    for (const b of composition.bars) {
      p.push();
      p.translate(b.cx, b.cy);
      p.rotate(b.angle);
      p.rect(0, 0, b.len, b.w); // 端は直角
      p.pop();
    }
    console.log(
      `[lines-04] ${composition.pattern} / 本数:${composition.bars.length} / 長さ:${composition.length.toFixed(1)}mm / 太さ:${composition.weight.toFixed(2)}mm`,
    );
  };

  p.setup = () => {
    p.createCanvas(SIZE, SIZE);
    p.pixelDensity(2);
    generate();
    p.noLoop();
  };

  p.mousePressed = () => {
    if (p.mouseX < 0 || p.mouseX > SIZE || p.mouseY < 0 || p.mouseY > SIZE) return;
    generate();
  };

  p.keyPressed = () => {
    if (p.key === "1") {
      forcedPattern = "motion";
      generate();
    } else if (p.key === "2") {
      forcedPattern = "rhythm";
      generate();
    } else if (p.key === "0") {
      forcedPattern = null;
      generate();
    } else if (p.key === "s" || p.key === "S") {
      p.saveCanvas(`lines-04-${composition.pattern}-${Date.now()}`, "png");
    }
  };
};
