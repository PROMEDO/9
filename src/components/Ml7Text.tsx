/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

interface Ml7TextProps {
  text: string;
  mode?: 'mount' | 'inView';
  delay?: number;
  stagger?: number;
  isRtl?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export const Ml7Text: React.FC<Ml7TextProps> = ({
  text,
  mode = 'inView',
  delay = 0,
  stagger = 0.13,
  isRtl = true,
  className,
  style,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.05 });
  const cleanText = String(text || '').trim();

  if (!cleanText) return null;

  if (prefersReducedMotion) {
    return (
      <span className={className} style={style}>
        {cleanText}
      </span>
    );
  }

  const shouldAnimate = mode === 'mount' || isInView;
  const words = cleanText.split(/\s+/).filter(Boolean);
  let globalIndex = 0;

  return (
    <span ref={containerRef} className={`ml7 ${className || ''}`.trim()} style={style}>
      {words.map((word, wIdx) => {
        const isArabicWord = ARABIC_SCRIPT_RE.test(word);
        const tokens = isArabicWord ? [word] : Array.from(word);
        const tokenStep = isArabicWord ? stagger : Math.min(0.09, stagger * 0.72);

        return (
          <React.Fragment key={`${word}-${wIdx}`}>
            <span
              className="ml7-text-wrapper"
              style={{
                whiteSpace: 'nowrap',
              }}
            >
              {tokens.map((token, tIdx) => {
                const idx = globalIndex++;
                const tokenDelay = delay + idx * tokenStep;
                const initialState = {
                  y: '1.1em',
                  x: isRtl ? '-0.55em' : '0.55em',
                  rotateZ: isRtl ? -180 : 180,
                  opacity: 0,
                };
                const targetState = {
                  y: 0,
                  x: 0,
                  rotateZ: 0,
                  opacity: 1,
                };

                return (
                  <motion.span
                    key={`${wIdx}-${tIdx}`}
                    className="ml7-letter"
                    style={{
                      transformOrigin: isRtl ? '100% 100%' : '0 100%',
                    }}
                    initial={initialState}
                    animate={shouldAnimate ? targetState : initialState}
                    transition={{
                      duration: 1.5,
                      delay: tokenDelay,
                      ease: [0.19, 1, 0.22, 1],
                    }}
                  >
                    {token}
                  </motion.span>
                );
              })}
            </span>
            {wIdx < words.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </span>
  );
};
