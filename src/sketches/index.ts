import type p5 from "p5";
import { particlesSketch } from "./particles";
import { flowFieldSketch } from "./flow-field";
import { gridPatternSketch } from "./grid-pattern";
import { bezierRibbonsSketch } from "./bezier-ribbons";
import { colorGridSketch } from "./color-grid";
import { colorGrid500Sketch } from "./color-grid-500";
import { colorGrid500ScatterSketch } from "./color-grid-500-scatter";
import { organicShapesSketch } from "./organic-shapes";

export const sketches: Record<string, (p: p5) => void> = {
  particles: particlesSketch,
  "flow-field": flowFieldSketch,
  "grid-pattern": gridPatternSketch,
  "bezier-ribbons": bezierRibbonsSketch,
  "color-grid": colorGridSketch,
  "color-grid-500": colorGrid500Sketch,
  "color-grid-500-scatter": colorGrid500ScatterSketch,
  "organic-shapes": organicShapesSketch,
};

export const defaultSketchName = "flow-field";
