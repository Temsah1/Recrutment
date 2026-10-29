import type { Transition, Variants } from 'framer-motion';

/**
 * Shared timing and easing for the whole interface. Keep motion decisions here
 * so public, application and admin surfaces feel like one product.
 */
export const DURATION = {
  instant: 0.12,
  fast: 0.16,
  standard: 0.24,
  entrance: 0.62,
  editorial: 0.95,
  stagger: 0.06,
} as const;

export const EASE = {
  standard: [0.2, 0.7, 0.2, 1],
  emphasized: [0.22, 1, 0.36, 1],
  editorial: [0.76, 0, 0.24, 1],
} as const;

type Bezier = [number, number, number, number];

export const bezier = (value: readonly [number, number, number, number]): Bezier => [
  value[0],
  value[1],
  value[2],
  value[3],
];

export const transition = {
  fast: { duration: DURATION.fast, ease: bezier(EASE.standard) },
  standard: { duration: DURATION.standard, ease: bezier(EASE.emphasized) },
  entrance: { duration: DURATION.entrance, ease: bezier(EASE.emphasized) },
  editorial: { duration: DURATION.editorial, ease: bezier(EASE.editorial) },
} satisfies Record<string, Transition>;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: transition.entrance },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.standard, ease: bezier(EASE.emphasized) } },
};

export const maskLine: Variants = {
  hidden: { y: '110%' },
  show: {
    y: '0%',
    transition: { duration: 0.85, ease: bezier(EASE.editorial) },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.985, y: 20 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.8, ease: bezier(EASE.emphasized) } },
};

export function staggerContainer(staggerChildren: number = DURATION.stagger, delayChildren = 0.04): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren, delayChildren } },
  };
}
