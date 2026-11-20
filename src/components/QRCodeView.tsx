/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, Printer } from 'lucide-react';

export type QrDotStyle = 'square' | 'dots' | 'rounded' | 'diamond';
export type QrBgPreset = 'white' | 'cream' | 'dark' | 'emerald' | 'gold';
export type QrFramePreset = 'minimal' | 'table' | 'classic' | 'badge';

export const QR_BG_THEMES: Record<
  QrBgPreset,
  {
    label: string;
    cardBg: string;
    cardBg2: string;
    qrTileBg: string;
    textColor: string;
    subColor: string;
    borderColor: string;
    defaultQrColor: string;
    swatch: string;
  }
> = {
  white: {
    label: 'أبيض نقي',
    cardBg: '#ffffff',
    cardBg2: '#f8fafc',
    qrTileBg: '#ffffff',
    textColor: '#0f172a',
    subColor: '#475569',
    borderColor: '#e2e8f0',
    defaultQrColor: '#0f172a',
    swatch: '#ffffff',
  },
  cream: {
    label: 'كريمي دافئ',
    cardBg: '#fdf6ec',
    cardBg2: '#f5ebd9',
    qrTileBg: '#fffdf9',
    textColor: '#292018',
    subColor: '#6b5b4a',
    borderColor: '#e6d5bc',
    defaultQrColor: '#451a03',
    swatch: '#f7e9d3',
  },
  dark: {
    label: 'داكن فاخر',
    cardBg: '#0f172a',
    cardBg2: '#1e293b',
    qrTileBg: '#ffffff',
    textColor: '#f8fafc',
    subColor: '#94a3b8',
    borderColor: '#334155',
    defaultQrColor: '#0f172a',
    swatch: '#0f172a',
  },
  emerald: {
    label: 'زمردي أنيق',
    cardBg: '#064e3b',
    cardBg2: '#047857',
    qrTileBg: '#ffffff',
    textColor: '#ecfdf5',
    subColor: '#a7f3d0',
    borderColor: '#10b981',
    defaultQrColor: '#064e3b',
    swatch: '#059669',
  },
  gold: {
    label: 'ذهبي ملكي',
    cardBg: '#181410',
    cardBg2: '#2d2314',
    qrTileBg: '#fffbeb',
    textColor: '#fef3c7',
    subColor: '#fcd34d',
    borderColor: '#d97706',
    defaultQrColor: '#78350f',
    swatch: 'linear-gradient(135deg, #f59e0b, #b45309)',
  },
};

export function getLocalizedQrBgLabel(preset: QrBgPreset): string {
  return QR_BG_THEMES[preset]?.label || 'أبيض نقي';
}

interface QRCodeViewProps {
  url: string;
  restaurantName?: string;
  logoUrl?: string;
  size?: number;
  dotStyle?: QrDotStyle;
  bgPreset?: QrBgPreset;
  framePreset?: QrFramePreset;
  qrColor?: string;
  showLogo?: boolean;
  hideActions?: boolean;
  onCopied?: () => void;
  isStore?: boolean;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function isFinderCell(row: number, col: number, count: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= count - 7;
  const inBottomLeft = row >= count - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function drawStyledQrToCanvas(
  canvas: HTMLCanvasElement,
  url: string,
  pixelSize: number,
  dotStyle: QrDotStyle,
  fgColor: string,
  tileBg: string,
  restaurantName: string,
  logoImg: HTMLImageElement | null,
  showLogo: boolean
) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const modules = qr.modules;
  const count = modules.size;
  const marginModules = 2;
  const totalModules = count + marginModules * 2;

  const scale = 2;
  canvas.width = pixelSize * scale;
  canvas.height = pixelSize * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = tileBg;
  ctx.fillRect(0, 0, pixelSize, pixelSize);

  const cell = pixelSize / totalModules;
  const offset = marginModules * cell;
  ctx.fillStyle = fgColor;

  // Center logo clearing box if enabled
  const centerClearModules = showLogo ? Math.floor(count * 0.22) : 0;
  const centerMin = Math.floor((count - centerClearModules) / 2);
  const centerMax = centerMin + centerClearModules;

  // Draw data modules
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules.get(r, c)) continue;
      if (isFinderCell(r, c, count)) continue;
      if (showLogo && r >= centerMin && r < centerMax && c >= centerMin && c < centerMax) {
        continue;
      }

      const x = offset + c * cell;
      const y = offset + r * cell;

      if (dotStyle === 'dots') {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.41, 0, Math.PI * 2);
        ctx.fill();
      } else if (dotStyle === 'rounded') {
        drawRoundedRect(ctx, x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.28);
        ctx.fill();
      } else if (dotStyle === 'diamond') {
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        const rHalf = cell * 0.48;
        ctx.beginPath();
        ctx.moveTo(cx, cy - rHalf);
        ctx.lineTo(cx + rHalf, cy);
        ctx.lineTo(cx, cy + rHalf);
        ctx.lineTo(cx - rHalf, cy);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x, y, cell + 0.35, cell + 0.35);
      }
    }
  }

  // Draw the 3 Finder Patterns cleanly according to dotStyle
  const finderOrigins: Array<[number, number]> = [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ];
  const outerRadius = dotStyle === 'square' ? 0 : dotStyle === 'diamond' ? cell * 0.9 : cell * 1.65;
  const innerRadius = dotStyle === 'square' ? 0 : dotStyle === 'dots' ? cell * 1.4 : cell * 0.85;

  for (const [fr, fc] of finderOrigins) {
    const fx = offset + fc * cell;
    const fy = offset + fr * cell;
    const outerSize = 7 * cell;

    ctx.fillStyle = fgColor;
    drawRoundedRect(ctx, fx, fy, outerSize, outerSize, outerRadius);
    ctx.fill();

    ctx.fillStyle = tileBg;
    drawRoundedRect(ctx, fx + cell, fy + cell, 5 * cell, 5 * cell, Math.max(0, outerRadius - cell * 0.4));
    ctx.fill();

    ctx.fillStyle = fgColor;
    if (dotStyle === 'dots') {
      ctx.beginPath();
      ctx.arc(fx + outerSize / 2, fy + outerSize / 2, cell * 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawRoundedRect(ctx, fx + 2 * cell, fy + 2 * cell, 3 * cell, 3 * cell, innerRadius);
      ctx.fill();
    }
  }

  // Optional center logo or restaurant initials badge
  if (showLogo) {
    const boxSize = centerClearModules * cell * 0.92;
    const bx = (pixelSize - boxSize) / 2;
    const by = (pixelSize - boxSize) / 2;

    ctx.fillStyle = tileBg;
    drawRoundedRect(ctx, bx - 4, by - 4, boxSize + 8, boxSize + 8, boxSize * 0.28);
    ctx.fill();

    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, bx, by, boxSize, boxSize, boxSize * 0.24);
    ctx.stroke();

    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      ctx.save();
      drawRoundedRect(ctx, bx + 2, by + 2, boxSize - 4, boxSize - 4, boxSize * 0.2);
      ctx.clip();
      ctx.drawImage(logoImg, bx + 2, by + 2, boxSize - 4, boxSize - 4);
      ctx.restore();
    } else {
      ctx.fillStyle = fgColor;
      ctx.font = `900 ${Math.round(boxSize * 0.44)}px Tajawal, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((restaurantName || 'M').slice(0, 2), pixelSize / 2, pixelSize / 2 + 1);
    }
  }
}

export const QRCodeView: React.FC<QRCodeViewProps> = ({
  url,
  restaurantName,
  logoUrl,
  size = 210,
  dotStyle = 'rounded',
  bgPreset = 'white',
  framePreset = 'table',
  qrColor,
  showLogo = false,
  hideActions = false,
  onCopied,
  isStore = false,
}) => {
  const displayRestName = restaurantName || 'مشروعي';
  const scanOpenText = isStore ? 'امسح الكود بالكاميرا لفتح المتجر والطلب' : 'امسح الكود بالكاميرا لفتح المنيو والطلب';
  const scanShortText = isStore ? 'امسح الكود لفتح المتجر والطلب' : 'امسح الكود لفتح المنيو والطلب';
  const scanInstantBadge = 'امسح للطلب الفوري 📱';
  const scanDirectText = 'امسح الكود للطلب المباشر 📱';
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardDataUrl, setCardDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const bgTheme = QR_BG_THEMES[bgPreset] || QR_BG_THEMES.white;
  const effectiveQrColor = qrColor || bgTheme.defaultQrColor;

  const qrTileBg = useMemo(() => {
    return bgPreset === 'cream' ? '#fffdf9' : bgPreset === 'gold' ? '#fffbeb' : '#ffffff';
  }, [bgPreset]);

  useEffect(() => {
    if (!url) return;
    let active = true;

    const renderAll = (loadedLogo: HTMLImageElement | null) => {
      if (!active) return;

      if (qrCanvasRef.current) {
        drawStyledQrToCanvas(
          qrCanvasRef.current,
          url,
          size,
          dotStyle,
          effectiveQrColor,
          qrTileBg,
          displayRestName,
          loadedLogo,
          showLogo
        );
      }

      // Render high-res composite stand card for clean PNG download & Print
      const outCanvas = document.createElement('canvas');
      const W = 760;
      const H = framePreset === 'minimal' ? 800 : 960;
      outCanvas.width = W;
      outCanvas.height = H;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      const fontStack = 'Tajawal, sans-serif';

      // Background card gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, bgTheme.cardBg);
      grad.addColorStop(1, bgTheme.cardBg2);
      ctx.fillStyle = grad;
      drawRoundedRect(ctx, 0, 0, W, H, 42);
      ctx.fill();

      // Frame border if classic or badge
      if (framePreset === 'classic') {
        ctx.strokeStyle = bgTheme.borderColor;
        ctx.lineWidth = 10;
        drawRoundedRect(ctx, 22, 22, W - 44, H - 44, 30);
        ctx.stroke();
      } else if (framePreset === 'badge') {
        ctx.strokeStyle = bgTheme.borderColor;
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, 14, 14, W - 28, H - 28, 36);
        ctx.stroke();
      }

      // Top text (non-minimal frames)
      if (framePreset !== 'minimal') {
        ctx.fillStyle = bgTheme.textColor;
        ctx.textAlign = 'center';
        ctx.font = `900 42px ${fontStack}`;
        ctx.fillText(displayRestName, W / 2, 118);

        ctx.fillStyle = bgTheme.subColor;
        ctx.font = `600 24px ${fontStack}`;
        ctx.fillText(scanOpenText, W / 2, 166);
      }

      // White QR inner tile
      const tileSize = 510;
      const tileX = (W - tileSize) / 2;
      const tileY = framePreset === 'minimal' ? 110 : 215;
      ctx.fillStyle = qrTileBg;
      drawRoundedRect(ctx, tileX, tileY, tileSize, tileSize, 32);
      ctx.fill();
      ctx.strokeStyle = bgTheme.borderColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw crisp styled QR onto offscreen canvas then composite
      const qrOff = document.createElement('canvas');
      drawStyledQrToCanvas(
        qrOff,
        url,
        460,
        dotStyle,
        effectiveQrColor,
        qrTileBg,
        displayRestName,
        loadedLogo,
        showLogo
      );
      ctx.drawImage(qrOff, tileX + 25, tileY + 25, 460, 460);

      // Bottom caption / badge
      if (framePreset === 'minimal') {
        ctx.fillStyle = bgTheme.textColor;
        ctx.textAlign = 'center';
        ctx.font = `800 32px ${fontStack}`;
        ctx.fillText(displayRestName, W / 2, tileY + tileSize + 88);
      } else if (framePreset === 'badge') {
        const pillW = 360;
        const pillH = 62;
        const pillX = (W - pillW) / 2;
        const pillY = tileY + tileSize + 72;
        ctx.fillStyle = effectiveQrColor;
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 31);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `800 26px ${fontStack}`;
        ctx.fillText(scanInstantBadge, W / 2, pillY + 40);
      } else {
        ctx.fillStyle = bgTheme.textColor;
        ctx.textAlign = 'center';
        ctx.font = `800 28px ${fontStack}`;
        ctx.fillText(scanDirectText, W / 2, tileY + tileSize + 92);
      }

      try {
        setCardDataUrl(outCanvas.toDataURL('image/png'));
      } catch {
        // Fallback without cross-origin logo if tainted
        drawStyledQrToCanvas(qrOff, url, 460, dotStyle, effectiveQrColor, qrTileBg, displayRestName, null, false);
        ctx.drawImage(qrOff, tileX + 25, tileY + 25, 460, 460);
        setCardDataUrl(outCanvas.toDataURL('image/png'));
      }
    };

    if (showLogo && logoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => renderAll(img);
      img.onerror = () => renderAll(null);
      img.src = logoUrl;
    } else {
      renderAll(null);
    }

    return () => {
      active = false;
    };
  }, [url, size, dotStyle, bgPreset, framePreset, effectiveQrColor, qrTileBg, displayRestName, logoUrl, showLogo, bgTheme, scanOpenText, scanInstantBadge, scanDirectText]);

  const handleDownload = () => {
    if (!cardDataUrl) return;
    const safeName = `QR-${displayRestName.replace(/\s+/g, '-')}.png`;
    const a = document.createElement('a');
    a.href = cardDataUrl;
    a.download = safeName;
    a.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handlePrint = () => {
    document.body.classList.add('printing-active');
    const cleanup = () => {
      document.body.classList.remove('printing-active');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1200);
    }, 60);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
      {cardDataUrl && (
        <div className="print-only-sheet" dir="rtl" style={{ textAlign: 'center' }}>
          <img
            src={cardDataUrl}
            alt={`كود QR ${displayRestName}`}
            style={{ width: '360px', maxWidth: '90vw', height: 'auto', margin: '30px auto', display: 'block', borderRadius: '20px' }}
          />
        </div>
      )}

      {/* Styled Live Preview Stand Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '330px',
          background: `linear-gradient(155deg, ${bgTheme.cardBg}, ${bgTheme.cardBg2})`,
          color: bgTheme.textColor,
          borderRadius: '24px',
          padding: framePreset === 'minimal' ? '20px' : '24px 20px',
          border:
            framePreset === 'classic'
              ? `4px double ${bgTheme.borderColor}`
              : framePreset === 'badge'
              ? `2px solid ${bgTheme.borderColor}`
              : `1px solid ${bgTheme.borderColor}`,
          boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          transition: 'all 0.2s ease',
        }}
      >
        {framePreset !== 'minimal' && (
          <div>
            <b style={{ display: 'block', fontSize: '18px', fontWeight: 900, color: bgTheme.textColor }}>
              {displayRestName}
            </b>
            <span style={{ display: 'block', fontSize: '11.5px', color: bgTheme.subColor, marginTop: '3px' }}>
              {scanShortText}
            </span>
          </div>
        )}

        <div
          style={{
            background: qrTileBg,
            padding: '12px',
            borderRadius: '18px',
            border: `1px solid ${bgTheme.borderColor}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <canvas
            ref={qrCanvasRef}
            style={{
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: '8px',
              display: 'block',
            }}
          />
        </div>

        {framePreset === 'minimal' ? (
          <b style={{ fontSize: '15px', fontWeight: 800, color: bgTheme.textColor }}>{displayRestName}</b>
        ) : framePreset === 'badge' ? (
          <span
            style={{
              background: effectiveQrColor,
              color: '#ffffff',
              padding: '6px 16px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 800,
            }}
          >
            {scanInstantBadge}
          </span>
        ) : (
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: bgTheme.textColor }}>
            {scanDirectText}
          </span>
        )}
      </div>

      {!hideActions && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleDownload}
            className="btn p"
            style={{ fontSize: '13px', padding: '9px 16px', borderRadius: '12px', fontWeight: 800 }}
          >
            <Download size={15} />
            <span>تحميل PNG</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="btn"
            style={{ fontSize: '13px', padding: '9px 16px', borderRadius: '12px', fontWeight: 700 }}
          >
            <Printer size={15} />
            <span>طباعة للستاند</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="btn"
            style={{ fontSize: '13px', padding: '9px 16px', borderRadius: '12px', fontWeight: 700 }}
          >
            {copied ? <Check size={15} color="var(--brand-ink, var(--brand))" /> : <Copy size={15} />}
            <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
