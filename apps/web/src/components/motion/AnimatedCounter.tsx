import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { useReveal } from './useReveal';

/**
 * Counts a real numeric value up when it enters the viewport. With reduced
 * motion, or if the viewport observer never reports, the final value is shown
 * directly rather than a stale zero.
 */
export function AnimatedCounter({
  value,
  className,
  duration = 1.1,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLSpanElement>({ margin: '-40px', fallbackDelay: 900 });
  const [display, setDisplay] = useState(() => (reduceMotion ? value : 0));
  const displayRef = useRef(display);
  const started = useRef(false);
  displayRef.current = display;

  useEffect(() => {
    if (reduceMotion) {
      started.current = true;
      setDisplay(value);
      return;
    }
    if (!shown) return;

    const initial = !started.current;
    started.current = true;
    const from = initial ? 0 : displayRef.current;
    if (from === value) return;

    let frame = 0;
    const startedAt = performance.now();
    const durationMs = (initial ? duration : 0.5) * 1000;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [shown, value, duration, reduceMotion]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {display.toLocaleString()}
    </span>
  );
}
