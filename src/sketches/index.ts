import type p5 from "p5";
import { particlesSketch } from "./sample/particles";
import { flowFieldSketch } from "./sample/flow-field";
import { gridPatternSketch } from "./grid/grid-pattern";
import { bezierRibbonsSketch } from "./sample/bezier-ribbons";
import { colorGridSketch } from "./grid/color-grid";
import { colorGrid500Sketch } from "./grid/color-grid-500";
import { colorGrid500ScatterSketch } from "./grid/color-grid-500-scatter";
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
import { randomTriangleTilingSketch } from "./triangles/random-triangle-tiling";

export const sketches: Record<string, (p: p5) => void> = {
  particles: particlesSketch,
  "flow-field": flowFieldSketch,
  "grid-pattern": gridPatternSketch,
  "bezier-ribbons": bezierRibbonsSketch,
  "color-grid": colorGridSketch,
  "color-grid-500": colorGrid500Sketch,
  "color-grid-500-scatter": colorGrid500ScatterSketch,
  "column-fill-500": columnFill500Sketch,
  "column-solid-500": columnSolid500Sketch,
  "column-blocks-500": columnBlocks500Sketch,
  "column-blocks-random-500": columnBlocksRandom500Sketch,
  "triangle-grid-50": triangleGrid50Sketch,
  "triangle-rect-grid-50x25": triangleRectGrid50x25Sketch,
  "organic-shapes": organicShapesSketch,
  "scramble-crossing": scrambleCrossingSketch,
  "vertical-stripes": verticalStripesSketch,
  "vertical-stripes-3": verticalStripes3Sketch,
  "lines-04": lines04MotionRhythmSketch,
  "random-circles-packed": randomCirclesPackedSketch,
  "random-triangle-tiling": randomTriangleTilingSketch,
};

export const defaultSketchName = "random-triangle-tiling";
