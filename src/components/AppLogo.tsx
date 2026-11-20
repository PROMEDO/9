/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SupportedLanguage } from '../types';
import { trByLang } from '../utils/i18n';

interface AppLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  lang?: SupportedLanguage;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 36,
  className = '',
  style,
  lang = 'ar',
}) => {
  const appName = trByLang(lang, 'منيو بلس', 'مینیۆ پڵەس', 'Menu+');
  const height = size;
  const width = Math.round(size * 1.85);

  return (
    <span
      className={`inline-flex items-center shrink-0 select-none ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        verticalAlign: 'middle',
        ...style,
      }}
      aria-label={appName}
    >
      <img
        src="/assets/logo.png"
        alt={appName}
        style={{
          height: `${height}px`,
          width: `${width}px`,
          maxWidth: '100%',
          objectFit: 'contain',
          display: 'block',
          filter: 'drop-shadow(0 4px 12px rgba(16, 185, 129, 0.25))',
        }}
        draggable={false}
      />
    </span>
  );
};
