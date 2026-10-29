import { motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DURATION, EASE, bezier } from '../../lib/motion';

/**
 * A short, opacity-led route entrance. The key change replays the animation
 * without delaying unmount, so navigation and tests stay instant.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.standard, ease: bezier(EASE.emphasized) }}
    >
      {children}
    </motion.div>
  );
}
