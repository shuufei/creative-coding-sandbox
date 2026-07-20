import type p5 from "p5";
import { particlesSketch } from "./particles";
import { flowFieldSketch } from "./flow-field";
import { gridPatternSketch } from "./grid-pattern";

export const sketches: Record<string, (p: p5) => void> = {
  particles: particlesSketch,
  "flow-field": flowFieldSketch,
  "grid-pattern": gridPatternSketch,
};

export const defaultSketchName = "flow-field";
