/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MenuThemeShape } from '../types';

interface SeasonalMenuDecorProps {
  shape: MenuThemeShape;
  isLight?: boolean;
}

const RamadanLanternSvg: React.FC<{ color?: string; glow?: string; size?: number }> = ({
  color = '#F59E0B',
  glow = '#FDE047',
  size = 48,
}) => (
  <svg width={size} height={size * 1.48} viewBox="0 0 48 72" fill="none" aria-hidden="true">
    <line x1="24" y1="0" x2="24" y2="12" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="24" cy="13" r="2.8" fill={glow} />
    <path d="M15 18 L33 18 L28 13 L20 13 Z" fill={color} />
    <path
      d="M13 20 C9 29 9 41 15 50 L33 50 C39 41 39 29 35 20 Z"
      fill="rgba(245,158,11,0.24)"
      stroke={color}
      strokeWidth="2.4"
    />
    <ellipse cx="24" cy="35" rx="6.2" ry="10" fill={glow} opacity="0.92" />
    <path d="M24 22 L24 48" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <path d="M14 35 L34 35" stroke={color} strokeWidth="1.5" opacity="0.85" />
    <path d="M15 50 L33 50 L29.5 58 L18.5 58 Z" fill={color} />
    <path d="M24 58 L24 66" stroke={glow} strokeWidth="2" strokeLinecap="round" />
    <circle cx="24" cy="68" r="2.4" fill={glow} />
  </svg>
);

const CrescentStarSvg: React.FC<{ color?: string; size?: number }> = ({
  color = '#FDE047',
  size = 38,
}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path
      d="M24.5 7.5C17.6 8.2 12.2 14 12.2 21C12.2 28.5 18.2 34.5 25.7 34.5C28.9 34.5 31.8 33.4 34.1 31.5C32.2 32.1 30.2 32.2 28.2 31.6C22.2 29.8 18.8 23.5 20.6 17.5C21.7 13.7 24.4 10.7 27.8 9.2C26.7 8 25.7 7.4 24.5 7.5Z"
      fill={color}
    />
    <path
      d="M31 12L32.2 15.1L35.4 15.6L33 17.8L33.6 21L30.8 19.4L28 21L28.6 17.8L26.2 15.6L29.4 15.1L31 12Z"
      fill={color}
    />
  </svg>
);

const IslamicOctagramSvg: React.FC<{ color?: string; size?: number }> = ({
  color = '#F59E0B',
  size = 34,
}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect x="9" y="9" width="22" height="22" stroke={color} strokeWidth="1.8" fill="none" opacity="0.82" />
    <rect
      x="9"
      y="9"
      width="22"
      height="22"
      transform="rotate(45 20 20)"
      stroke={color}
      strokeWidth="1.8"
      fill="none"
      opacity="0.82"
    />
    <circle cx="20" cy="20" r="4" fill={color} opacity="0.9" />
  </svg>
);

const BalloonSvg: React.FC<{ color: string; shine?: string; size?: number }> = ({
  color,
  shine = '#FFFFFF',
  size = 36,
}) => (
  <svg width={size} height={size * 1.68} viewBox="0 0 40 68" fill="none" aria-hidden="true">
    <ellipse cx="20" cy="20" rx="14.5" ry="18" fill={color} />
    <ellipse cx="14.5" cy="14" rx="3.5" ry="6.5" transform="rotate(-20 14.5 14)" fill={shine} opacity="0.52" />
    <path d="M17.5 37.5 L22.5 37.5 L20 41 Z" fill={color} />
    <path
      d="M20 41 Q24 47 18 54 T21 66"
      stroke="rgba(255,255,255,0.7)"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const FireworkBurstSvg: React.FC<{ color1: string; color2: string; size?: number }> = ({
  color1,
  color2,
  size = 64,
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    {Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      const x1 = 32 + Math.cos(angle) * 7;
      const y1 = 32 + Math.sin(angle) * 7;
      const x2 = 32 + Math.cos(angle) * 26;
      const y2 = 32 + Math.sin(angle) * 26;
      const cx = 32 + Math.cos(angle) * 29;
      const cy = 32 + Math.sin(angle) * 29;
      const col = i % 2 === 0 ? color1 : color2;
      return (
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="2.3" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="2.4" fill={col} />
        </g>
      );
    })}
    <circle cx="32" cy="32" r="4.5" fill="#FFFFFF" opacity="0.95" />
  </svg>
);

export const SeasonalMenuOverlay: React.FC<SeasonalMenuDecorProps> = ({ shape }) => {
  const prefersReducedMotion = useReducedMotion();

  if (shape !== 'ramadan' && shape !== 'eid' && shape !== 'newyear') {
    return null;
  }

  if (shape === 'ramadan') {
    const stars = [
      { top: '9%', left: '14%', size: 16, delay: 0, char: '✦' },
      { top: '16%', right: '17%', size: 13, delay: 0.7, char: '★' },
      { top: '31%', left: '6%', size: 15, delay: 1.4, char: '✦' },
      { top: '46%', right: '5%', size: 16, delay: 0.4, char: '✧' },
      { top: '65%', left: '9%', size: 13, delay: 1.1, char: '★' },
      { top: '79%', right: '10%', size: 15, delay: 1.7, char: '✦' },
    ];

    return (
      <div className="pm-seasonal-overlay is-ramadan" aria-hidden="true">
        {/* Top Ornamental Garland Arch */}
        <svg className="pm-ramadan-garland" viewBox="0 0 400 32" preserveAspectRatio="none">
          <path d="M0 6 Q100 24 200 8 Q300 24 400 6" stroke="#F59E0B" strokeWidth="1.6" fill="none" opacity="0.55" />
          {[40, 100, 160, 200, 240, 300, 360].map((cx, i) => (
            <circle key={cx} cx={cx} cy={i === 3 ? 8 : 15} r={i === 3 ? 3.5 : 2.3} fill="#FDE047" opacity="0.88" />
          ))}
        </svg>

        {/* Hanging Corner Lanterns */}
        <motion.div
          className="pm-season-corner is-right"
          style={{ transformOrigin: 'top center' }}
          animate={prefersReducedMotion ? undefined : { rotate: [-6, 6, -6] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <RamadanLanternSvg size={48} color="#F59E0B" glow="#FDE047" />
        </motion.div>

        <motion.div
          className="pm-season-corner is-left"
          style={{ transformOrigin: 'top center' }}
          animate={prefersReducedMotion ? undefined : { rotate: [5.5, -5.5, 5.5] }}
          transition={{ duration: 4.1, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }}
        >
          <RamadanLanternSvg size={42} color="#FBBF24" glow="#FEF08A" />
        </motion.div>

        {/* Rotating Islamic Geometric Emblem */}
        <motion.div
          className="pm-season-emblem is-left"
          animate={prefersReducedMotion ? undefined : { rotate: [0, 360], opacity: [0.55, 0.9, 0.55] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        >
          <IslamicOctagramSvg size={36} color="#F59E0B" />
        </motion.div>

        {/* Glowing Crescent */}
        <motion.div
          className="pm-season-float-moon"
          animate={prefersReducedMotion ? undefined : { y: [0, -9, 0], scale: [0.96, 1.06, 0.96], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <CrescentStarSvg size={42} color="#FDE047" />
        </motion.div>

        {/* Twinkling Stars */}
        {stars.map((st, idx) => (
          <motion.span
            key={idx}
            className="pm-season-star"
            style={{ top: st.top, left: st.left, right: st.right, fontSize: `${st.size}px`, color: '#FDE047' }}
            animate={prefersReducedMotion ? undefined : { scale: [0.75, 1.45, 0.75], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 2.8 + (idx % 3) * 0.65, repeat: Infinity, ease: 'easeInOut', delay: st.delay }}
          >
            {st.char}
          </motion.span>
        ))}
      </div>
    );
  }

  if (shape === 'eid') {
    const confettiDots = [
      { top: '12%', left: '15%', color: '#FBBF24', symbol: '★', delay: 0 },
      { top: '19%', right: '16%', color: '#34D399', symbol: '✦', delay: 0.5 },
      { top: '36%', left: '7%', color: '#F472B6', symbol: '🎉', delay: 1.0 },
      { top: '50%', right: '6%', color: '#FBBF24', symbol: '◆', delay: 0.3 },
      { top: '68%', left: '11%', color: '#38BDF8', symbol: '★', delay: 1.3 },
      { top: '81%', right: '11%', color: '#EC4899', symbol: '✨', delay: 0.8 },
    ];

    return (
      <div className="pm-seasonal-overlay is-eid" aria-hidden="true">
        {/* Festive Bunting Flags Top String */}
        <svg className="pm-eid-bunting" viewBox="0 0 400 40" preserveAspectRatio="none">
          <path d="M0 5 Q200 24 400 5" stroke="#FBBF24" strokeWidth="2.2" fill="none" opacity="0.85" />
          {[
            { x: 18, c: '#10B981' },
            { x: 58, c: '#F59E0B' },
            { x: 98, c: '#EC4899' },
            { x: 138, c: '#38BDF8' },
            { x: 178, c: '#FBBF24' },
            { x: 218, c: '#10B981' },
            { x: 258, c: '#EC4899' },
            { x: 298, c: '#F59E0B' },
            { x: 338, c: '#38BDF8' },
          ].map((flag, idx) => (
            <polygon
              key={idx}
              points={`${flag.x},11 ${flag.x + 28},11 ${flag.x + 14},33`}
              fill={flag.c}
              opacity="0.92"
            />
          ))}
        </svg>

        {/* Swaying Eid Balloons */}
        <motion.div
          className="pm-season-corner is-right"
          animate={prefersReducedMotion ? undefined : { y: [0, -12, 0], rotate: [-5, 5, -5] }}
          transition={{ duration: 3.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BalloonSvg color="#10B981" size={38} />
        </motion.div>

        <motion.div
          className="pm-season-corner is-left"
          animate={prefersReducedMotion ? undefined : { y: [0, -14, 0], rotate: [5, -5, 5] }}
          transition={{ duration: 4.3, repeat: Infinity, ease: 'easeInOut', delay: 0.45 }}
        >
          <BalloonSvg color="#F59E0B" size={36} />
        </motion.div>

        <motion.div
          className="pm-season-emblem is-left"
          animate={prefersReducedMotion ? undefined : { y: [0, -10, 0], rotate: [-6, 6, -6] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
        >
          <BalloonSvg color="#EC4899" size={28} />
        </motion.div>

        {confettiDots.map((c, idx) => (
          <motion.span
            key={idx}
            className="pm-season-star"
            style={{ top: c.top, left: c.left, right: c.right, color: c.color, fontSize: '15px' }}
            animate={
              prefersReducedMotion
                ? undefined
                : { y: [-6, 7, -6], rotate: [0, 28, -28, 0], scale: [0.9, 1.3, 0.9], opacity: [0.55, 1, 0.55] }
            }
            transition={{ duration: 3.0 + (idx % 3) * 0.55, repeat: Infinity, ease: 'easeInOut', delay: c.delay }}
          >
            {c.symbol}
          </motion.span>
        ))}
      </div>
    );
  }

  // newyear
  const snowParticles = [
    { left: '7%', delay: 0, dur: 6.8, char: '❄', color: '#BAE6FD', size: 17 },
    { left: '19%', delay: 1.5, dur: 7.9, char: '✦', color: '#FDE047', size: 14 },
    { left: '34%', delay: 0.4, dur: 8.4, char: '❄', color: '#E0F2FE', size: 18 },
    { left: '51%', delay: 2.1, dur: 7.2, char: '✨', color: '#FBBF24', size: 15 },
    { left: '67%', delay: 0.9, dur: 7.6, char: '❄', color: '#BAE6FD', size: 16 },
    { left: '82%', delay: 2.6, dur: 7.4, char: '✦', color: '#F472B6', size: 15 },
    { left: '92%', delay: 1.2, dur: 8.1, char: '❄', color: '#38BDF8', size: 15 },
  ];

  return (
    <div className="pm-seasonal-overlay is-newyear" aria-hidden="true">
      {/* Animated Fireworks Bursts */}
      <motion.div
        className="pm-season-firework is-right"
        animate={prefersReducedMotion ? undefined : { scale: [0.65, 1.22, 0.72], opacity: [0.45, 1, 0.45], rotate: [0, 18, 0] }}
        transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <FireworkBurstSvg color1="#FBBF24" color2="#38BDF8" size={72} />
      </motion.div>

      <motion.div
        className="pm-season-firework is-left"
        animate={prefersReducedMotion ? undefined : { scale: [0.7, 1.25, 0.7], opacity: [0.45, 1, 0.45], rotate: [0, -18, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 1.0 }}
      >
        <FireworkBurstSvg color1="#F472B6" color2="#FDE047" size={64} />
      </motion.div>

      <motion.div
        className="pm-season-firework is-center"
        animate={prefersReducedMotion ? undefined : { scale: [0.6, 1.15, 0.65], opacity: [0.25, 0.85, 0.25], rotate: [0, 24, 0] }}
        transition={{ duration: 4.0, repeat: Infinity, ease: 'easeInOut', delay: 1.9 }}
      >
        <FireworkBurstSvg color1="#38BDF8" color2="#A78BFA" size={52} />
      </motion.div>

      {/* Falling Snowflakes & Golden Confetti */}
      {snowParticles.map((p, idx) => (
        <motion.span
          key={idx}
          className="pm-newyear-flake"
          style={{ left: p.left, color: p.color, fontSize: `${p.size}px` }}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  y: ['-6vh', '104vh'],
                  x: [0, idx % 2 === 0 ? 18 : -18, 0],
                  rotate: [0, idx % 2 === 0 ? 180 : -180],
                  opacity: [0, 0.95, 0.9, 0],
                }
          }
          transition={{
            duration: p.dur,
            repeat: Infinity,
            ease: 'linear',
            delay: p.delay,
          }}
        >
          {p.char}
        </motion.span>
      ))}
    </div>
  );
};

export const SeasonalHeroRibbon: React.FC<{ shape: MenuThemeShape }> = ({ shape }) => {
  const prefersReducedMotion = useReducedMotion();
  if (shape !== 'ramadan' && shape !== 'eid' && shape !== 'newyear') return null;

  const meta =
    shape === 'ramadan'
      ? {
          iconRight: '🌙',
          iconLeft: '🏮',
          badge: 'رمضان كريم',
          text: 'أجواء وعروض شهر رمضان المبارك',
          symbols: ['✨', '🕌', '⭐'],
          cls: 'is-ramadan',
        }
      : shape === 'eid'
      ? {
          iconRight: '🎉',
          iconLeft: '🎈',
          badge: 'عيد سعيد',
          text: 'كل عام وأنتم بخير • احتفلوا معنا بأجمل العروض',
          symbols: ['🎁', '✨', '🎊'],
          cls: 'is-eid',
        }
      : {
          iconRight: '🎆',
          iconLeft: '❄️',
          badge: 'سنة جديدة سعيدة',
          text: 'أجواء احتفالية وعروض العام الجديد',
          symbols: ['🥂', '✨', '🎇'],
          cls: 'is-newyear',
        };

  return (
    <motion.div
      className={`pm-seasonal-ribbon ${meta.cls}`}
      initial={prefersReducedMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.span
        className="pm-seasonal-ribbon-icon"
        aria-hidden="true"
        animate={prefersReducedMotion ? undefined : { rotate: [-8, 8, -8], scale: [1, 1.14, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        {meta.iconRight}
      </motion.span>

      <div className="pm-seasonal-ribbon-center">
        <span className="pm-seasonal-ribbon-badge">{meta.badge}</span>
        <span className="pm-seasonal-ribbon-text">{meta.text}</span>
      </div>

      <motion.span
        className="pm-seasonal-ribbon-icon"
        aria-hidden="true"
        animate={prefersReducedMotion ? undefined : { rotate: [8, -8, 8], scale: [1, 1.14, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      >
        {meta.iconLeft}
      </motion.span>
    </motion.div>
  );
};
