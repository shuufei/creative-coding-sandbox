import type p5 from "p5";
import { particlesSketch } from "./sample/particles";
import { flowFieldSketch } from "./sample/flow-field";
import { gridPatternSketch } from "./grid/grid-pattern";
import { bezierRibbonsSketch } from "./sample/bezier-ribbons";
import { colorGridSketch } from "./grid/color-grid";
import { columnFill500Sketch } from "./grid/column-fill-500";
import { columnSolid500Sketch } from "./grid/column-solid-500";
import { columnBlocks500Sketch } from "./grid/column-blocks-500";
import { columnBlocksRandom500Sketch } from "./grid/column-blocks-random-500";
import { triangleGrid50Sketch } from "./grid/triangle-grid-50";
import { triangleRectGrid50x25Sketch } from "./grid/triangle-rect-grid-50x25";
import { organicShapesSketch } from "./sample/organic-shapes";
import { scrambleCrossingSketch } from "./crossing/scramble-crossing";
import { verticalStripesSketch } from "./stripes/vertical-stripes";
import { verticalStripes3Sketch } from "./stripes/vertical-stripes-3";
import { lines04MotionRhythmSketch } from "./lines/lines-04-motion-rhythm";
import { randomCirclesPackedSketch } from "./circles/random-circles-packed";
import { alignedCirclesSketch } from "./circles/aligned-circles";
import { randomTriangleTilingSketch } from "./triangles/random-triangle-tiling";
import { randomGeometrySketch } from "./geometry/random-geometry";

export type SketchEntry = {
  /** URL の ?sketch= に指定する名前 */
  name: string;
  /** 一覧に表示するタイトル */
  title: string;
  /** src/sketches 配下のディレクトリ名 = カテゴリ */
  category: string;
  sketch: (p: p5) => void;
};

// 一覧ページはこの並び順で表示する
export const sketchList: SketchEntry[] = [
  {
    name: "random-geometry",
    title: "Random Geometry",
    category: "geometry",
    sketch: randomGeometrySketch,
  },
  {
    name: "random-triangle-tiling",
    title: "Random Triangle Tiling",
    category: "triangles",
    sketch: randomTriangleTilingSketch,
  },
  {
    name: "aligned-circles",
    title: "Aligned Circles",
    category: "circles",
    sketch: alignedCirclesSketch,
  },
  {
    name: "random-circles-packed",
    title: "Random Circles Packed",
    category: "circles",
    sketch: randomCirclesPackedSketch,
  },
  {
    name: "color-grid",
    title: "Color Grid",
    category: "grid",
    sketch: colorGridSketch,
  },
  {
    name: "grid-pattern",
    title: "Grid Pattern",
    category: "grid",
    sketch: gridPatternSketch,
  },
  {
    name: "triangle-grid-50",
    title: "Triangle Grid 50",
    category: "grid",
    sketch: triangleGrid50Sketch,
  },
  {
    name: "triangle-rect-grid-50x25",
    title: "Triangle / Rect Grid 50x25",
    category: "grid",
    sketch: triangleRectGrid50x25Sketch,
  },
  {
    name: "column-fill-500",
    title: "Column Fill 500",
    category: "grid",
    sketch: columnFill500Sketch,
  },
  {
    name: "column-solid-500",
    title: "Column Solid 500",
    category: "grid",
    sketch: columnSolid500Sketch,
  },
  {
    name: "column-blocks-500",
    title: "Column Blocks 500",
    category: "grid",
    sketch: columnBlocks500Sketch,
  },
  {
    name: "column-blocks-random-500",
    title: "Column Blocks Random 500",
    category: "grid",
    sketch: columnBlocksRandom500Sketch,
  },
  {
    name: "vertical-stripes",
    title: "Vertical Stripes",
    category: "stripes",
    sketch: verticalStripesSketch,
  },
  {
    name: "vertical-stripes-3",
    title: "Vertical Stripes 3",
    category: "stripes",
    sketch: verticalStripes3Sketch,
  },
  {
    name: "lines-04",
    title: "Lines 04 / Motion Rhythm",
    category: "lines",
    sketch: lines04MotionRhythmSketch,
  },
  {
    name: "scramble-crossing",
    title: "Scramble Crossing",
    category: "crossing",
    sketch: scrambleCrossingSketch,
  },
  {
    name: "organic-shapes",
    title: "Organic Shapes",
    category: "sample",
    sketch: organicShapesSketch,
  },
  {
    name: "bezier-ribbons",
    title: "Bezier Ribbons",
    category: "sample",
    sketch: bezierRibbonsSketch,
  },
  {
    name: "flow-field",
    title: "Flow Field",
    category: "sample",
    sketch: flowFieldSketch,
  },
  {
    name: "particles",
    title: "Particles",
    category: "sample",
    sketch: particlesSketch,
  },
];

export const sketches: Record<string, (p: p5) => void> = Object.fromEntries(
  sketchList.map((entry) => [entry.name, entry.sketch]),
);

export const sketchTitles: Record<string, string> = Object.fromEntries(
  sketchList.map((entry) => [entry.name, entry.title]),
);

export const defaultSketchName = "random-geometry";
