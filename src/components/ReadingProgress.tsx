"use client";

import { useEffect } from "react";

export function ReadingProgress() {
  useEffect(() => {
    const update = () => {
      const documentHeight =
        document.documentElement.scrollHeight -
        window.innerHeight;

      const progress =
        documentHeight > 0
          ? window.scrollY / documentHeight
          : 0;

      const element =
        document.getElementById("reading-progress");

      if (element) {
        element.style.transform = `scaleX(${Math.min(
          1,
          Math.max(0, progress)
        )})`;
      }
    };

    update();

    window.addEventListener("scroll", update, {
      passive: true,
    });

    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="fixed left-0 top-0 z-[100] h-0.5 w-full pointer-events-none">
      <div
        id="reading-progress"
        className="h-full origin-left scale-x-0 bg-[var(--color-primary)]"
      />
    </div>
  );
}