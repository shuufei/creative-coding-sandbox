import type p5 from "p5";

interface Walker {
  x: number;
  y: number;
  hue: number;
}

export const flowFieldSketch = (p: p5) => {
  const walkers: Walker[] = [];
  const walkerCount = 800;
  let zOffset = 0;

  const setupWalkers = () => {
    walkers.length = 0;
    for (let i = 0; i < walkerCount; i++) {
      walkers.push({
        x: p.random(p.width),
        y: p.random(p.height),
        hue: p.random(360),
      });
    }
  };

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.background(220, 30, 8);
    setupWalkers();
  };

  p.draw = () => {
    for (const walker of walkers) {
      const angle =
        p.noise(walker.x * 0.005, walker.y * 0.005, zOffset) * p.TWO_PI * 2;
      const vx = p.cos(angle);
      const vy = p.sin(angle);

      p.stroke(walker.hue, 70, 90, 8);
      p.strokeWeight(1.5);
      p.point(walker.x, walker.y);

      walker.x += vx;
      walker.y += vy;

      if (walker.x < 0 || walker.x > p.width || walker.y < 0 || walker.y > p.height) {
        walker.x = p.random(p.width);
        walker.y = p.random(p.height);
      }
    }
    zOffset += 0.0015;
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    p.background(220, 30, 8);
  };

  p.keyPressed = () => {
    if (p.key === "c" || p.key === "C") {
      p.background(220, 30, 8);
    }
  };
};
