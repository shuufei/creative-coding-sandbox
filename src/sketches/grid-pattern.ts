import type p5 from "p5";

export const gridPatternSketch = (p: p5) => {
  const cellSize = 48;
  let seed = 0;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noLoop();
    p.rectMode(p.CENTER);
  };

  p.draw = () => {
    p.noiseSeed(seed);
    p.background(0, 0, 96);

    const cols = p.ceil(p.width / cellSize) + 1;
    const rows = p.ceil(p.height / cellSize) + 1;

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * cellSize;
        const y = j * cellSize;
        const n = p.noise(i * 0.15, j * 0.15);
        const angle = n * p.TWO_PI * 2;
        const size = p.map(n, 0, 1, cellSize * 0.2, cellSize * 0.9);
        const hue = p.map(n, 0, 1, 190, 340);

        p.push();
        p.translate(x, y);
        p.rotate(angle);
        p.noStroke();
        p.fill(hue, 70, 60, 85);
        p.rect(0, 0, size, size * 0.35, 4);
        p.pop();
      }
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    p.redraw();
  };

  p.mousePressed = () => {
    seed = p.random(10000);
    p.redraw();
  };
};
