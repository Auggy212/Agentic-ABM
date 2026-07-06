import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
}

interface Orb {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  opacity: number;
}

const CYAN = "0, 212, 255";
const VIOLET = "139, 92, 246";
const BLUE = "59, 130, 246";

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const COUNT = Math.min(Math.floor((W * H) / 14000), 90);
    const ORB_COUNT = 6;
    const CONNECTION_DIST = 160;
    const colors = [CYAN, VIOLET, BLUE];

    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random() * 0.8 + 0.2,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 1.5 + 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: Math.random() * 0.5 + 0.3,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.02 + 0.005,
    }));

    const orbs: Orb[] = Array.from({ length: ORB_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random() * 0.5 + 0.3,
      radius: Math.random() * 120 + 60,
      color: Math.random() > 0.5 ? CYAN : VIOLET,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      opacity: Math.random() * 0.06 + 0.02,
    }));

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", resize);

    const draw = () => {
      timeRef.current += 0.008;
      const t = timeRef.current;

      ctx.clearRect(0, 0, W, H);

      // Draw orbs (blurred glow spheres)
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        if (orb.x < -orb.radius) orb.x = W + orb.radius;
        if (orb.x > W + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = H + orb.radius;
        if (orb.y > H + orb.radius) orb.y = -orb.radius;

        const scaledR = orb.radius * orb.z;
        const grd = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, scaledR);
        grd.addColorStop(0, `rgba(${orb.color}, ${orb.opacity * 1.5})`);
        grd.addColorStop(0.5, `rgba(${orb.color}, ${orb.opacity})`);
        grd.addColorStop(1, `rgba(${orb.color}, 0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, scaledR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update + draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.25 * ((a.z + b.z) / 2);
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, `rgba(${a.color}, ${alpha})`);
            grad.addColorStop(1, `rgba(${b.color}, ${alpha})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = ((a.z + b.z) / 2) * 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const pulseOpacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse + t));
        const scaledSize = p.size * p.z * (0.9 + 0.1 * Math.sin(p.pulse));

        // Outer glow
        const glowGrd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, scaledSize * 6);
        glowGrd.addColorStop(0, `rgba(${p.color}, ${pulseOpacity * 0.5})`);
        glowGrd.addColorStop(1, `rgba(${p.color}, 0)`);
        ctx.fillStyle = glowGrd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, scaledSize * 6, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = `rgba(${p.color}, ${pulseOpacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, scaledSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle horizontal scanlines
      ctx.fillStyle = "rgba(0, 212, 255, 0.008)";
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        opacity: 1,
      }}
    />
  );
}
