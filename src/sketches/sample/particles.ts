import type p5 from "p5";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

export const particlesSketch = (p: p5) => {
  const particles: Particle[] = [];
  const maxParticles = 400;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.background(0);
  };

  p.draw = () => {
    p.background(0, 0, 6, 20);

    if (particles.length < maxParticles) {
      particles.push({
        x: p.mouseX || p.width / 2,
        y: p.mouseY || p.height / 2,
        vx: p.random(-1, 1),
        vy: p.random(-1, 1),
        hue: p.random(360),
      });
    }

    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < 0 || particle.x > p.width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > p.height) particle.vy *= -1;

      p.noStroke();
      p.fill(particle.hue, 80, 100, 60);
      p.circle(particle.x, particle.y, 6);
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};
