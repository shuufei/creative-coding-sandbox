import p5 from "p5";
import { sketches, defaultSketchName } from "./sketches";

const params = new URLSearchParams(window.location.search);
const requested = params.get("sketch");
const name = requested && requested in sketches ? requested : defaultSketchName;

new p5(sketches[name]);

console.log(
  `[creative-coding] running "${name}". Switch with ?sketch=<name>. Available: ${Object.keys(
    sketches,
  ).join(", ")}`,
);
