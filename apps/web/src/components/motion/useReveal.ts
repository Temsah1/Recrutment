import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

interface RevealOptions {
  once?: boolean;
  margin?:
    | `${number}px`
    | `${number}px ${number}px`
    | `${number}px ${number}px ${number}px`
    | `${number}px ${number}px ${number}px ${number}px`;
  fallbackDelay?: number;
}

/**
 * Viewport visibility with a fail-open path. If IntersectionObserver is
 * unavailable or never reports an element that is on screen, it is revealed
 * shortly after mount. Elements below the fold stay hidden until they are
 * scrolled near, and the scroll check keeps working even when the observer
 * never fires.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>({
  once = true,
  margin = '-70px',
  fallbackDelay = 1200,
}: RevealOptions = {}) {
  const ref = useRef<T>(null);
  const reduceMotion = useReducedMotion();
  const [inView, setInView] = useState(false);
  const [fallback, setFallback] = useState(false);
  const shown = inView || fallback || Boolean(reduceMotion);

  useEffect(() => {
    if (shown) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setFallback(true);
      return;
    }

    let observer: IntersectionObserver | undefined;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) {
            setInView(true);
            if (once) observer?.disconnect();
          } else if (!once) {
            setInView(false);
          }
        },
        { rootMargin: margin },
      );
      observer.observe(node);
    } catch {
      setFallback(true);
    }

    const nearViewport = () => {
      const rect = node.getBoundingClientRect();
      return rect.top < window.innerHeight + 120 && rect.bottom > -120;
    };

    const timer = window.setTimeout(() => {
      if (nearViewport()) setFallback(true);
    }, fallbackDelay);

    const onScroll = () => {
      if (nearViewport()) setFallback(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [shown, once, margin, fallbackDelay]);

  return { ref, shown, reduceMotion };
}
