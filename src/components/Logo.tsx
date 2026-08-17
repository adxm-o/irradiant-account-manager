import { useEffect, useState } from 'react';

type LogoProps = {
  size?: number;
  animated?: boolean;
  glow?: boolean;
  className?: string;
};

const FLAME =
  'M50 9 C 63 25, 66 39, 57 53 C 49.5 65, 41 73, 36.5 88 C 38 70, 44.5 59, 47.5 45.5 C 50 33.5, 48.5 20, 50 9 Z';

const BRAND_SRC = `${import.meta.env.BASE_URL}logo.png`;

type BrandState = 'unknown' | 'ok' | 'missing';

let brandState: BrandState = 'unknown';
const listeners = new Set<(state: BrandState) => void>();

function probeBrand() {
  if (brandState !== 'unknown' || typeof Image === 'undefined') return;
  const image = new Image();
  image.onload = () => {
    brandState = 'ok';
    listeners.forEach((listener) => listener(brandState));
  };
  image.onerror = () => {
    brandState = 'missing';
    listeners.forEach((listener) => listener(brandState));
  };
  image.src = BRAND_SRC;
}

function useBrandImage() {
  const [state, setState] = useState<BrandState>(brandState);
  useEffect(() => {
    listeners.add(setState);
    probeBrand();
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export default function Logo({ size = 26, animated = true, glow = true, className }: LogoProps) {
  const brand = useBrandImage();

  if (brand === 'ok') {
    return (
      <img
        src={BRAND_SRC}
        width={size}
        height={size}
        alt="Irradiant"
        draggable={false}
        className={`brand-mark ${glow ? 'logo-glow' : ''} ${className ?? ''}`}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${glow ? 'logo-glow' : ''} ${className ?? ''}`}
      aria-label="Irradiant"
      role="img"
    >
      <defs>
        <linearGradient id="irr-gold" x1="18" y1="4" x2="82" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7d5606" />
          <stop offset="0.24" stopColor="#e7b634" />
          <stop offset="0.44" stopColor="#fff6dc" />
          <stop offset="0.62" stopColor="#e9bb3c" />
          <stop offset="0.84" stopColor="#a97d0d" />
          <stop offset="1" stopColor="#6d4904" />
          {animated ? (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              values="0 50 50; 360 50 50"
              dur="9s"
              repeatCount="indefinite"
            />
          ) : null}
        </linearGradient>
        <linearGradient id="irr-ring" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8a6109" />
          <stop offset="0.34" stopColor="#f5c95c" />
          <stop offset="0.54" stopColor="#fff3cf" />
          <stop offset="0.78" stopColor="#d9a527" />
          <stop offset="1" stopColor="#6d4904" />
        </linearGradient>
      </defs>

      <g transform="rotate(-14 50 50)">
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="url(#irr-ring)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray="121 20"
          strokeDashoffset="60"
          fill="none"
        />
      </g>

      <path d={FLAME} fill="url(#irr-gold)" />
      <path d={FLAME} fill="url(#irr-gold)" transform="rotate(180 50 50)" />
    </svg>
  );
}
