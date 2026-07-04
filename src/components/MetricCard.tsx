import { useEffect, useRef, useState } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  className?: string;
  animate?: boolean;
}

export function MetricCard({
  label,
  value,
  className = "",
  animate = true,
}: MetricCardProps) {
  const [display, setDisplay] = useState<string | number>(value);
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setDisplay(value);
      prevValue.current = value;
      return;
    }

    if (prevValue.current === value) return;

    const startNumeric =
      typeof prevValue.current === "number" ? prevValue.current : 0;
    prevValue.current = value;
    setFlash(true);
    const flashTimer = window.setTimeout(() => setFlash(false), 600);

    if (!animate || typeof value !== "number") {
      setDisplay(value);
      return () => window.clearTimeout(flashTimer);
    }

    const target = value;
    const startTime = performance.now();
    const duration = 400;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      setDisplay(Math.round(startNumeric + (target - startNumeric) * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
    };
  }, [value, animate]);

  return (
    <div className={`metric-card${flash ? " flash" : ""}`}>
      <div className="label">{label}</div>
      <div className={`value ${className}`}>{display}</div>
    </div>
  );
}
