import type p5 from "p5";

// 保存するときの pixelDensity の倍率。canvas 1辺の px にこれを掛けた大きさで保存する
// (1000 x 1000 の 4倍 = 4000 x 4000 px。ブラウザの canvas の上限を超えないようここまで)
export const saveScales = [1, 2, 4] as const;
export type SaveScale = (typeof saveScales)[number];

/**
 * pixelDensity を一時的に上げて描き直し、その解像度で PNG 保存する。
 *
 * pixelDensity を変えると canvas は作り直されて中身が消えるので、
 * render には「いまの状態を1枚まるごと描く」処理を渡す。
 * 保存したあとは元の pixelDensity に戻して、もう一度描き直す。
 */
export const saveHighRes = (
  p: p5,
  fileName: string,
  scale: SaveScale,
  render: () => void,
) => {
  const prev = p.pixelDensity();
  p.pixelDensity(scale);
  render();
  p.saveCanvas(fileName, "png");
  p.pixelDensity(prev);
  render();
};
