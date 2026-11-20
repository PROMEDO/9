/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DASH_EASE = [0.22, 1, 0.36, 1] as const;
export const DASH_SOFT_EASE = [0.19, 1, 0.22, 1] as const;

/**
 * Shared silky, refined & 50% slower dashboard motion presets.
 * Replaces plain vertical jumps with directional silk glides, soft focus settle, and iris blooms.
 */
export function dashTabMotion(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: {
      opacity: 0,
      x: -20,
      scale: 0.982,
      filter: 'blur(4px)',
    },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: 'blur(0px)',
    },
    transition: {
      duration: 1.32,
      ease: DASH_EASE,
    },
  };
}

export function dashSectionMotion(reduced: boolean | null, delay = 0, useInView = false) {
  if (reduced) {
    return {
      initial: false as const,
      ...(useInView
        ? { whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.08 as const } }
        : { animate: { opacity: 1 } }),
      transition: { duration: 0 },
    };
  }
  const target = { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' };
  return {
    initial: {
      opacity: 0,
      x: -14,
      y: 12,
      scale: 0.972,
      filter: 'blur(3.5px)',
    },
    ...(useInView
      ? { whileInView: target, viewport: { once: true, amount: 0.08 as const } }
      : { animate: target }),
    transition: {
      duration: 1.35,
      delay,
      ease: DASH_EASE,
    },
  };
}

export function dashCardMotion(
  reduced: boolean | null,
  idx = 0,
  targetOpacity = 1,
  useInView = false,
  baseDelay = 0.09
) {
  if (reduced) {
    return {
      initial: false as const,
      ...(useInView
        ? { whileInView: { opacity: targetOpacity }, viewport: { once: true, amount: 0.08 as const } }
        : { animate: { opacity: targetOpacity } }),
      transition: { duration: 0 },
    };
  }
  const target = {
    opacity: targetOpacity,
    x: 0,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
  };
  return {
    initial: {
      opacity: 0,
      x: -10,
      y: 16,
      scale: 0.955,
      filter: 'blur(3px)',
    },
    ...(useInView
      ? { whileInView: target, viewport: { once: true, amount: 0.08 as const } }
      : { animate: target }),
    transition: {
      duration: 1.24,
      delay: Math.min(baseDelay + idx * 0.105, 0.58),
      ease: DASH_EASE,
    },
    whileHover: {
      y: -3,
      scale: 1.012,
      transition: { duration: 0.45, ease: DASH_EASE },
    },
    whileTap: {
      scale: 0.985,
      transition: { duration: 0.22, ease: DASH_EASE },
    },
  };
}

export function dashRowMotion(reduced: boolean | null, idx = 0, useInView = true) {
  if (reduced) {
    return {
      initial: false as const,
      ...(useInView
        ? { whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.08 as const } }
        : { animate: { opacity: 1 } }),
      transition: { duration: 0 },
    };
  }
  const target = {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
  };
  return {
    initial: {
      opacity: 0,
      x: -18,
      scale: 0.986,
      filter: 'blur(2.5px)',
    },
    ...(useInView
      ? { whileInView: target, viewport: { once: true, amount: 0.08 as const } }
      : { animate: target }),
    transition: {
      duration: 1.22,
      delay: Math.min(idx * 0.09, 0.54),
      ease: DASH_EASE,
    },
  };
}

export function dashSubTabMotion(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      exit: undefined,
      transition: { duration: 0 },
    };
  }
  return {
    initial: {
      opacity: 0,
      x: -16,
      scale: 0.986,
      filter: 'blur(3px)',
    },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: 'blur(0px)',
    },
    exit: {
      opacity: 0,
      x: 14,
      scale: 0.988,
      filter: 'blur(2px)',
    },
    transition: {
      duration: 0.48,
      ease: DASH_EASE,
    },
  };
}

export function dashModalMotion(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: false as const,
      animate: { opacity: 1 },
      exit: undefined,
      transition: { duration: 0 },
    };
  }
  return {
    initial: {
      opacity: 0,
      scale: 0.92,
      y: 14,
      filter: 'blur(5px)',
    },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
    },
    exit: {
      opacity: 0,
      scale: 0.94,
      y: 10,
      filter: 'blur(4px)',
    },
    transition: {
      duration: 0.86,
      ease: DASH_EASE,
    },
  };
}

export const DASH_SPRING_PILL = {
  type: 'spring' as const,
  stiffness: 190,
  damping: 28,
  mass: 1.25,
};
