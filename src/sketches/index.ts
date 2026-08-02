import type p5 from "p5";
import { particlesSketch } from "./sample/particles";
import { flowFieldSketch } from "./sample/flow-field";
import { gridPatternSketch } from "./grid/grid-pattern";
import { bezierRibbonsSketch } from "./sample/bezier-ribbons";
import { colorGridSketch } from "./grid/color-grid";
import { colorGrid500Sketch } from "./grid/color-grid-500";
import { colorGrid500ScatterSketch } from "./grid/color-grid-500-scatter";
import { organicShapesSketch } from "./sample/organic-shapes";
import { scrambleCrossingSketch } from "./crossing/scramble-crossing";
import { verticalStripesSketch } from "./stripes/vertical-stripes";

export const sketches: Record<string, (p: p5) => void> = {
  particles: particlesSketch,
  "flow-field": flowFieldSketch,
  "grid-pattern": gridPatternSketch,
  "bezier-ribbons": bezierRibbonsSketch,
  "color-grid": colorGridSketch,
  "color-grid-500": colorGrid500Sketch,
  "color-grid-500-scatter": colorGrid500ScatterSketch,
  "organic-shapes": organicShapesSketch,
  "scramble-crossing": scrambleCrossingSketch,
  "vertical-stripes": verticalStripesSketch,
};

export const defaultSketchName = "flow-field";
