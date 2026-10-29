import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { DURATION, EASE, bezier, fadeUp, staggerContainer } from '../../lib/motion';
import { useReveal } from './useReveal';

export type RevealDirection = 'up' | 'left' | 'right' | 'none';

function offsetFor(direction: RevealDirection, y: number) {
  if (direction === 'left') return { x: -28, y: 0 };
  if (direction === 'right') return { x: 28, y: 0 };
  if (direction === 'none') return { x: 0, y: 0 };
  return { x: 0, y };
}

export function Reveal({
  children,
  delay = 0,
  className,
  y = 18,
  direction = 'up',
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
  direction?: RevealDirection;
  once?: boolean;
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>({ once, margin: '-70px' });
  const offset = offsetFor(direction, y);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, ...offset }}
      animate={shown ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, ...offset }}
      transition={{ duration: DURATION.entrance, delay: reduceMotion ? 0 : delay, ease: bezier(EASE.emphasized) }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({
  children,
  className,
  stagger = DURATION.stagger,
  delay = 0.04,
  trigger = 'view',
  once = true,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  trigger?: 'view' | 'mount';
  once?: boolean;
}) {
  const container = staggerContainer(stagger, delay);

  if (trigger === 'mount') {
    return (
      <MountStagger className={className} container={container}>
        {children}
      </MountStagger>
    );
  }

  return (
    <ViewStagger className={className} container={container} once={once}>
      {children}
    </ViewStagger>
  );
}

function MountStagger({
  children,
  className,
  container,
}: {
  children: ReactNode;
  className?: string;
  container: ReturnType<typeof staggerContainer>;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={container}>
      {children}
    </motion.div>
  );
}

function ViewStagger({
  children,
  className,
  container,
  once,
}: {
  children: ReactNode;
  className?: string;
  container: ReturnType<typeof staggerContainer>;
  once: boolean;
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>({ once, margin: '-80px' });
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={shown ? 'show' : 'hidden'}
      variants={container}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  y = 16,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: bezier(EASE.emphasized) } },
      }}
    >
      {children}
    </motion.div>
  );
}

export { fadeUp };
