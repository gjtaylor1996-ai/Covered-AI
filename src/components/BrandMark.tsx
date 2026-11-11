import type { CSSProperties } from "react";

/**
 * The Covered logo mark: a cream "C" with an amber dot on a dark tile. Same
 * artwork as public/icon.svg (the favicon and app icon), drawn inline so it
 * is crisp at any size and needs no extra request. The word "Covered" always
 * sits beside it, so the mark itself is hidden from screen readers.
 */
export function BrandMark({ size = 38, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <rect width="512" height="512" rx="108" fill="#1F2623" />
      <rect x="0.5" y="0.5" width="511" height="511" rx="107.5" fill="none" stroke="#3A423E" strokeWidth="1" />
      <path
        d="M 336 176 C 336 140 306 112 268 112 L 244 112 C 194 112 154 152 154 202 L 154 310 C 154 360 194 400 244 400 L 268 400 C 306 400 336 372 336 336"
        fill="none"
        stroke="#E7E1CE"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <circle cx="360" cy="256" r="20" fill="#E19A33" />
    </svg>
  );
}
