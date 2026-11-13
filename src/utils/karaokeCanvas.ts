import {
  BackgroundConfig,
  KaraokeStyle,
  LyricLine,
  SongMetadata,
} from '../types/karaoke';
import { getActiveLyricState, getWordSweepProgress } from './lyricsTiming';

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  timelineTime: number;
  totalDuration: number;
  metadata: SongMetadata;
  lines: LyricLine[];
  style: KaraokeStyle;
  background: BackgroundConfig;
  bgImage: HTMLImageElement | null;
}

interface MeasuredWord {
  text: string;
  width: number;
  progress: number;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timelineTime: number,
  totalDuration: number,
  background: BackgroundConfig,
  bgImage: HTMLImageElement | null
) {
  ctx.fillStyle = '#0B0D12';
  ctx.fillRect(0, 0, width, height);

  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    const progress = totalDuration > 0 ? Math.min(1, timelineTime / totalDuration) : 0;
    const zoom = background.kenBurns ? 1 + progress * 0.06 : 1;

    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
    const canvasRatio = width / height;

    let drawW = width;
    let drawH = height;
    if (imgRatio > canvasRatio) {
      drawH = height * zoom;
      drawW = drawH * imgRatio;
    } else {
      drawW = width * zoom;
      drawH = drawW / imgRatio;
    }

    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;

    ctx.save();
    if (background.blurPx > 0) {
      ctx.filter = `blur(${background.blurPx}px)`;
    }
    ctx.drawImage(bgImage, dx, dy, drawW, drawH);
    ctx.restore();
  } else {
    // Rich studio radial fallback gradient
    const grad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      width * 0.05,
      width * 0.5,
      height * 0.5,
      width * 0.75
    );
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(0.55, '#111827');
    grad.addColorStop(1, '#090B0F');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Measured contrast scrim
  ctx.fillStyle = `rgba(6, 8, 12, ${background.dimOpacity})`;
  ctx.fillRect(0, 0, width, height);

  // Subtle top/bottom vignette for stage focus
  const vignette = ctx.createLinearGradient(0, 0, 0, height);
  vignette.addColorStop(0, 'rgba(0,0,0,0.42)');
  vignette.addColorStop(0.35, 'rgba(0,0,0,0.08)');
  vignette.addColorStop(0.65, 'rgba(0,0,0,0.08)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawIntroCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timelineTime: number,
  metadata: SongMetadata,
  style: KaraokeStyle
) {
  const introDur = Math.max(0.1, metadata.introDuration);
  const fadeOutStart = Math.max(0, introDur - 0.55);
  let alpha = 1;
  if (introDur > 0.8 && timelineTime > fadeOutStart) {
    alpha = Math.max(0, (introDur - timelineTime) / 0.55);
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const scale = width / 1280;
  const centerX = width / 2;
  const centerY = height / 2;

  // Artist label
  const artist = (metadata.artist || 'Artista').trim();
  ctx.font = `600 ${Math.round(24 * scale)}px "${style.fontFamily}", "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = style.activeColor;
  ctx.fillText(artist.toUpperCase(), centerX, centerY - 68 * scale);

  // Song Title
  const title = (metadata.title || 'Titolo della Canzone').trim();
  const titleSize = Math.round(64 * scale);
  ctx.font = `800 ${titleSize}px "${style.fontFamily}", "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  if (style.showStroke) {
    ctx.lineWidth = Math.max(3, 6 * scale);
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(title, centerX, centerY, width * 0.84);
  }
  ctx.fillText(title, centerX, centerY, width * 0.84);

  // Clean hairline accent rule
  const ruleW = 140 * scale;
  ctx.fillStyle = style.activeColor;
  drawRoundedRect(ctx, centerX - ruleW / 2, centerY + 54 * scale, ruleW, 3 * scale, 2);
  ctx.fill();

  // Countdown bar & seconds before song begins
  const remaining = Math.max(0, introDur - timelineTime);
  const progress = Math.min(1, timelineTime / introDur);
  const barW = 240 * scale;
  const barH = 5 * scale;
  const barY = centerY + 96 * scale;

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  drawRoundedRect(ctx, centerX - barW / 2, barY, barW, barH, 3);
  ctx.fill();

  ctx.fillStyle = style.activeColor;
  drawRoundedRect(ctx, centerX - barW / 2, barY, Math.max(4, barW * progress), barH, 3);
  ctx.fill();

  ctx.font = `500 ${Math.round(18 * scale)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(241,245,249,0.78)';
  ctx.fillText(`Inizia tra ${Math.ceil(remaining)}s`, centerX, barY + 28 * scale);

  ctx.restore();
}

function wrapMeasuredWords(
  ctx: CanvasRenderingContext2D,
  words: MeasuredWord[],
  maxWidth: number,
  spaceWidth: number
): MeasuredWord[][] {
  const rows: MeasuredWord[][] = [];
  let currentRow: MeasuredWord[] = [];
  let currentWidth = 0;

  words.forEach((w) => {
    const addition = currentRow.length === 0 ? w.width : spaceWidth + w.width;
    if (currentRow.length > 0 && currentWidth + addition > maxWidth) {
      rows.push(currentRow);
      currentRow = [w];
      currentWidth = w.width;
    } else {
      currentRow.push(w);
      currentWidth += addition;
    }
  });

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  return rows;
}

function drawKaraokeLine(
  ctx: CanvasRenderingContext2D,
  line: LyricLine,
  songTime: number,
  centerX: number,
  centerY: number,
  maxWidth: number,
  fontSize: number,
  style: KaraokeStyle,
  opacity: number,
  highlightActiveWords: boolean
): number {
  const fontSpec = `${style.fontWeight} ${fontSize}px "${style.fontFamily}", "Plus Jakarta Sans", sans-serif`;
  ctx.save();
  ctx.font = fontSpec;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = opacity;

  const spaceWidth = ctx.measureText(' ').width * 1.15;
  const measured: MeasuredWord[] = line.words.map((w) => ({
    text: w.text,
    width: ctx.measureText(w.text).width,
    progress: highlightActiveWords ? getWordSweepProgress(w, songTime) : 0,
  }));

  const rows = wrapMeasuredWords(ctx, measured, maxWidth, spaceWidth);
  const rowGap = fontSize * 1.24;
  const totalBlockHeight = rows.length * rowGap;
  let startY = centerY - totalBlockHeight / 2 + rowGap / 2;

  rows.forEach((row) => {
    const rowWidth =
      row.reduce((sum, w) => sum + w.width, 0) + Math.max(0, row.length - 1) * spaceWidth;
    let cursorX = centerX - rowWidth / 2;

    row.forEach((w) => {
      // Base inactive text + crisp legibility stroke/shadow
      if (style.showStroke) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, fontSize * 0.11);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.strokeText(w.text, cursorX, startY);
        ctx.restore();
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = fontSize * 0.22;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = style.inactiveColor;
        ctx.fillText(w.text, cursorX, startY);
        ctx.restore();
      }

      ctx.fillStyle = style.inactiveColor;
      ctx.fillText(w.text, cursorX, startY);

      // Progressive sweep fill for active words
      if (w.progress > 0) {
        const fillWidth = w.width * w.progress;
        ctx.save();
        ctx.beginPath();
        ctx.rect(
          cursorX - 2,
          startY - fontSize * 0.75,
          fillWidth + 2,
          fontSize * 1.5
        );
        ctx.clip();

        if (style.showStroke) {
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(3, fontSize * 0.11);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.strokeText(w.text, cursorX, startY);
        }
        ctx.fillStyle = style.activeColor;
        ctx.fillText(w.text, cursorX, startY);
        ctx.restore();
      }

      cursorX += w.width + spaceWidth;
    });

    startY += rowGap;
  });

  ctx.restore();
  return totalBlockHeight;
}

export function renderKaraokeFrame(params: RenderFrameParams) {
  const {
    ctx,
    width,
    height,
    timelineTime,
    totalDuration,
    metadata,
    lines,
    style,
    background,
    bgImage,
  } = params;

  drawBackground(ctx, width, height, timelineTime, totalDuration, background, bgImage);

  const scale = width / 1280;
  const introDur = Math.max(0, metadata.introDuration);

  // Subtle persistent top-left song tag during lyrics
  if (timelineTime >= introDur) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${Math.round(16 * scale)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.65)';
    const label = [metadata.title, metadata.artist].filter(Boolean).join(' · ');
    if (label) {
      ctx.fillText(label, 36 * scale, 28 * scale);
    }
    ctx.restore();
  }

  // Intro screen before the song starts
  if (introDur > 0 && timelineTime < introDur) {
    drawIntroCard(ctx, width, height, timelineTime, metadata, style);
    return;
  }

  const songTime = Math.max(0, timelineTime - introDur);
  const state = getActiveLyricState(lines, songTime);

  const primaryFontSize = Math.round(style.fontSize * scale);
  const secondaryFontSize = Math.round(style.fontSize * 0.72 * scale);
  const maxWidth = width * 0.84;
  const baseCenterY = style.verticalPosition === 'lower' ? height * 0.66 : height * 0.48;

  if (!state.currentLine && !state.prevLine) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(24 * scale)}px "${style.fontFamily}", sans-serif`;
    ctx.fillStyle = 'rgba(241, 245, 249, 0.65)';
    ctx.fillText('Intermezzo strumentale', width / 2, baseCenterY);
    ctx.restore();
    return;
  }

  // Lead-in beat dots just before a verse starts after silence
  if (state.countdownBeforeLine !== null && state.currentLine) {
    const dotsCount = 3;
    const activeDots = Math.max(1, Math.min(3, Math.ceil(3.0 - state.countdownBeforeLine)));
    const dotY = baseCenterY - primaryFontSize * 1.3;
    ctx.save();
    for (let i = 0; i < dotsCount; i += 1) {
      const dx = width / 2 + (i - 1) * 26 * scale;
      ctx.beginPath();
      ctx.arc(dx, dotY, 6 * scale, 0, Math.PI * 2);
      ctx.fillStyle = i < activeDots ? style.activeColor : 'rgba(255,255,255,0.28)';
      ctx.fill();
    }
    ctx.restore();
  }

  // Optional previous line (3-line mode)
  if (style.visibleLines === 3 && state.prevLine && state.currentLine) {
    drawKaraokeLine(
      ctx,
      state.prevLine,
      songTime,
      width / 2,
      baseCenterY - primaryFontSize * 1.55,
      maxWidth,
      secondaryFontSize,
      style,
      0.35,
      false
    );
  }

  // Current active line
  let primaryHeight = primaryFontSize * 1.25;
  if (state.currentLine) {
    primaryHeight = drawKaraokeLine(
      ctx,
      state.currentLine,
      songTime,
      width / 2,
      baseCenterY,
      maxWidth,
      primaryFontSize,
      style,
      1,
      true
    );
  }

  // Next upcoming line preview
  if (state.nextLine) {
    drawKaraokeLine(
      ctx,
      state.nextLine,
      songTime,
      width / 2,
      baseCenterY + primaryHeight / 2 + secondaryFontSize * 1.35,
      maxWidth,
      secondaryFontSize,
      style,
      0.56,
      false
    );
  }
}
