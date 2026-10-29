import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { DURATION, EASE, bezier } from '../../lib/motion';
import { useReveal } from './useReveal';

const tags = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  p: motion.p,
} as const;

/**
 * Reveals a heading by sliding its text out of a clipped line. Reduced-motion
 * users get the plain, fully visible element with no wrapper.
 */
export function AnimatedHeading({
  as = 'h2',
  children,
  className,
  delay = 0,
  once = true,
}: {
  as?: keyof typeof tags;
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { ref, shown } = useReveal<HTMLSpanElement>({ once, margin: '-60px' });

  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  const Tag = tags[as];
  return (
    <Tag className={className}>
      <span ref={ref} className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
        <motion.span
          className="block"
          initial={{ y: '112%' }}
          animate={{ y: shown ? '0%' : '112%' }}
          transition={{ duration: 0.85, delay, ease: bezier(EASE.editorial) }}
        >
          {children}
        </motion.span>
      </span>
    </Tag>
  );
}

export function AnimatedKicker({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const { ref, shown } = useReveal<HTMLParagraphElement>({ margin: '-40px' });

  return (
    <motion.p
      ref={ref}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.standard, ease: bezier(EASE.emphasized) }}
    >
      {children}
    </motion.p>
  );
}
