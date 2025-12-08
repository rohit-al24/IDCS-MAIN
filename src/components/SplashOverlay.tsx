import React, { useEffect, useState } from "react";
import "./splash.css";

/**
 * SplashOverlay: animated gif (man flying) and IDCS text crossing animation.
 * Sequence:
 *  - Man (gif) flies from left → center, pauses ~1s → continues to right
 *  - IDCS text moves from right → center (behind the gif) → continues left
 *  - onDone() is called when animation completes
 */
export default function SplashOverlay({ onDone, imgSrc }: { onDone?: () => void; imgSrc?: string }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // total animation length must match CSS keyframes durations (ms)
    const total = 3200;
    const tDone = setTimeout(() => {
      setFadeOut(true);
      // small fade delay
      setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 300);
    }, total);
    return () => clearTimeout(tDone);
  }, [onDone]);

  if (!visible) return null;

  const src = imgSrc || '/rocket.gif';

  return (
    <div className={`landing${fadeOut ? ' fade-out' : ''}`}>
      {/* text should be behind the gif so keep lower z-index */}
      <div className="idcs-only idcs-animate splash-text">IDCS</div>
      {/* image placed above text so it appears in front */}
      <img src={src} alt="man flying" className="splash-gif" />
    </div>
  );
}
