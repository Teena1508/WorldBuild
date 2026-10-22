"use client";

import React, { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  twinkleSpeed: number;
  alpha: number;
  baseAlpha: number;
}

export function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    // Color palette: antique gold, subtle lavender, pale starlight, cool celestial ice
    const starColors = [
      "rgba(250, 228, 143, ", // bright gold
      "rgba(212, 175, 55, ",  // antique gold
      "rgba(207, 208, 245, ", // lavender glow
      "rgba(235, 238, 255, ", // diamond starlight
      "rgba(143, 142, 176, ", // deep muted lavender
    ];

    const starCount = Math.min(Math.floor((width * height) / 8000), 160);
    const stars: Star[] = [];

    for (let i = 0; i < starCount; i++) {
      const colorPrefix = starColors[Math.floor(Math.random() * starColors.length)];
      const baseAlpha = 0.2 + Math.random() * 0.7;
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 2 + 0.5,
        size: Math.random() * 1.8 + 0.4,
        color: colorPrefix,
        twinkleSpeed: 0.005 + Math.random() * 0.02,
        alpha: baseAlpha,
        baseAlpha: baseAlpha,
      });
    }

    let time = 0;
    let mouseX = width / 2;
    let mouseY = height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Parallax offset
      const targetOffsetX = (mouseX - width / 2) * 0.025;
      const targetOffsetY = (mouseY - height / 2) * 0.025;

      time += 0.03;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!prefersReducedMotion) {
          star.y -= 0.12 * star.z;
          if (star.y < 0) {
            star.y = height;
            star.x = Math.random() * width;
          }
          star.alpha = star.baseAlpha + Math.sin(time * star.twinkleSpeed * 10 + i) * 0.25;
          star.alpha = Math.max(0.1, Math.min(1, star.alpha));
        }

        const renderX = star.x + targetOffsetX * star.z;
        const renderY = star.y + targetOffsetY * star.z;

        ctx.beginPath();
        ctx.arc(renderX, renderY, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `${star.color}${star.alpha})`;
        ctx.fill();

        // Subtle glow for larger stars
        if (star.size > 1.4) {
          ctx.beginPath();
          ctx.arc(renderX, renderY, star.size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `${star.color}${star.alpha * 0.18})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
      aria-hidden="true"
    />
  );
}
