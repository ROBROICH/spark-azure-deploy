import { useEffect, useRef } from 'react';

type ConfettiPiece = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  settled: boolean;
  wobble: number;
  wobbleSpeed: number;
};

type NavigatorWithDeviceMemory = Navigator & {
  deviceMemory?: number;
};

const COLORS = [
  '#22C55E',
  '#0EA5E9',
  '#FACC15',
  '#F97316',
  '#EC4899',
  '#8B5CF6',
] as const;
const MIN_PIECES = 700;
const MAX_PIECES = 2600;
const LOW_END_MIN_PIECES = 520;
const PIXELS_PER_PIECE = 1900;
const ENTRY_BAND_HEIGHT = 420;
const PILE_BIN_WIDTH = 8;
const FRAME_SAMPLE_COUNT = 24;
const SLOW_FRAME_MS = 24;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getHardwareScale = () => {
  const cores = navigator.hardwareConcurrency;
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 4;
  const coreScale = cores <= 4 ? 0.58 : cores <= 8 ? 0.82 : 1;
  const memoryScale = memory <= 4 ? 0.75 : 1;
  const pixelRatioScale = window.devicePixelRatio > 1.5 ? 0.75 : 1;

  return coreScale * memoryScale * pixelRatioScale;
};

const getCanvasPixelRatio = () => {
  const hardwareScale = getHardwareScale();
  const maxPixelRatio = hardwareScale < 0.7 ? 1 : 1.5;

  return Math.min(window.devicePixelRatio || 1, maxPixelRatio);
};

const getPieceCount = (width: number, height: number) => {
  const baseCount = clamp(
    (width * height) / PIXELS_PER_PIECE,
    MIN_PIECES,
    MAX_PIECES,
  );
  const scaledCount = baseCount * getHardwareScale();

  return Math.round(clamp(scaledCount, LOW_END_MIN_PIECES, MAX_PIECES));
};

const createPiece = (width: number, height: number): ConfettiPiece => ({
  x: Math.random() * width,
  y: -ENTRY_BAND_HEIGHT - Math.random() * height * 0.75,
  width: 5 + Math.random() * 8,
  height: 2 + Math.random() * 5,
  color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0],
  velocityX: -0.9 + Math.random() * 1.8,
  velocityY: 1.6 + Math.random() * 3.2,
  rotation: Math.random() * Math.PI * 2,
  rotationSpeed: -0.16 + Math.random() * 0.32,
  settled: false,
  wobble: Math.random() * Math.PI * 2,
  wobbleSpeed: 0.025 + Math.random() * 0.035,
});

const createStaticPiece = (width: number, height: number): ConfettiPiece => ({
  ...createPiece(width, height),
  y: Math.random() * height,
  velocityX: 0,
  velocityY: 0,
  rotationSpeed: 0,
  settled: true,
});

/**
 * Renders a lazy full-viewport canvas confetti animation behind the finalize dialog.
 *
 * The particle count scales with viewport area so ultrawide screens stay visually filled.
 */
const FinalExportConfetti = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const piecesRef = useRef<ConfettiPiece[]>([]);
  const pileHeightsRef = useRef<number[]>([]);

  // eslint-disable-next-line no-restricted-syntax, custom-size/limit-logic-function-lines -- canvas animation lifecycle is an isolated visual effect for one export celebration.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const prefersReducedMotion =
      window.matchMedia(REDUCED_MOTION_QUERY).matches;
    let animationFrame = 0;
    let resizeFrame = 0;
    let isCancelled = false;
    let previousFrameTime = 0;
    let sampledFrameCount = 0;
    let sampledFrameTimeTotal = 0;
    let hasAdaptedToFrameTime = false;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    const setCanvasSize = () => {
      const pixelRatio = getCanvasPixelRatio();
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      canvas.width = viewportWidth * pixelRatio;
      canvas.height = viewportHeight * pixelRatio;
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawPiece = (piece: ConfettiPiece) => {
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      context.fillRect(
        -piece.width / 2,
        -piece.height / 2,
        piece.width,
        piece.height,
      );
      context.restore();
    };

    const drawStaticCanvas = () => {
      setCanvasSize();
      context.clearRect(0, 0, viewportWidth, viewportHeight);

      const nextPieceCount = getPieceCount(viewportWidth, viewportHeight);
      piecesRef.current = Array.from({ length: nextPieceCount }, () =>
        createStaticPiece(viewportWidth, viewportHeight),
      );

      for (const piece of piecesRef.current) {
        drawPiece(piece);
      }
    };

    const resizeCanvas = () => {
      setCanvasSize();

      const nextPieceCount = getPieceCount(viewportWidth, viewportHeight);
      pileHeightsRef.current = Array.from(
        { length: Math.ceil(viewportWidth / PILE_BIN_WIDTH) },
        () => 0,
      );
      while (piecesRef.current.length < nextPieceCount) {
        piecesRef.current.push(createPiece(viewportWidth, viewportHeight));
      }
      piecesRef.current.length = nextPieceCount;
    };

    const reduceFallingPieces = () => {
      piecesRef.current = piecesRef.current.filter(
        (piece, index) => piece.settled || index % 3 !== 0,
      );
    };

    const shouldReduceForFrameTime = (now: number) => {
      if (previousFrameTime <= 0 || hasAdaptedToFrameTime) {
        previousFrameTime = now;
        return false;
      }

      sampledFrameCount += 1;
      sampledFrameTimeTotal += now - previousFrameTime;
      previousFrameTime = now;

      if (sampledFrameCount !== FRAME_SAMPLE_COUNT) {
        return false;
      }

      hasAdaptedToFrameTime = true;
      return sampledFrameTimeTotal / FRAME_SAMPLE_COUNT > SLOW_FRAME_MS;
    };

    const settlePiece = (piece: ConfettiPiece) => {
      const binIndex = clamp(
        Math.floor(piece.x / PILE_BIN_WIDTH),
        0,
        pileHeightsRef.current.length - 1,
      );
      const pileHeight = pileHeightsRef.current[binIndex] ?? 0;
      pileHeightsRef.current[binIndex] = pileHeight + piece.height * 0.35;
      piece.y = viewportHeight - pileHeight - piece.height / 2;
      piece.rotationSpeed = 0;
      piece.settled = true;
    };

    /**
     * Advances falling pieces, stacks settled pieces at the bottom, and redraws the canvas.
     */
    const draw = (now: number) => {
      if (shouldReduceForFrameTime(now)) {
        reduceFallingPieces();
      }

      let hasFallingPiece = false;
      context.clearRect(0, 0, viewportWidth, viewportHeight);

      for (const piece of piecesRef.current) {
        if (piece.settled) {
          drawPiece(piece);
          continue;
        }

        hasFallingPiece = true;
        piece.wobble += piece.wobbleSpeed;
        piece.x += piece.velocityX + Math.sin(piece.wobble) * 0.55;
        piece.y += piece.velocityY + 2.4;
        piece.rotation += piece.rotationSpeed;

        if (piece.x < -30) {
          piece.x = viewportWidth + 30;
        } else if (piece.x > viewportWidth + 30) {
          piece.x = -30;
        }

        if (piece.y >= viewportHeight - piece.height / 2) {
          settlePiece(piece);
        }
        drawPiece(piece);
      }

      if (hasFallingPiece && !isCancelled) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const scheduleResizeCanvas = () => {
      if (resizeFrame !== 0) {
        return;
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        if (prefersReducedMotion) {
          drawStaticCanvas();
        } else {
          resizeCanvas();
        }
      });
    };

    window.addEventListener('resize', scheduleResizeCanvas);

    if (prefersReducedMotion) {
      drawStaticCanvas();
      animationFrame = window.requestAnimationFrame(() => {
        canvas.style.opacity = '1';
      });
    } else {
      resizeCanvas();
      canvas.style.opacity = '1';
      animationFrame = window.requestAnimationFrame(draw);
    }

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrame);
      if (resizeFrame !== 0) {
        window.cancelAnimationFrame(resizeFrame);
      }
      window.removeEventListener('resize', scheduleResizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[49] opacity-0 transition-opacity duration-500"
    />
  );
};

export default FinalExportConfetti;
