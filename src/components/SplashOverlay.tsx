import React, { useEffect, useState } from "react";
import "./splash.css";

/**
 * SplashOverlay: displays only animated `IDCS` text.
 * Sequence: text animates in, stays, then fades out at ~5s total.
 */
export default function SplashOverlay({ onDone }: { onDone?: () => void }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Show animation for 7s total, then fade and call onDone
    const tFade = setTimeout(() => setFadeOut(true), 7000); // start fade at 7s
    const tDone = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 7600); // allow fade transition to finish
    return () => { clearTimeout(tFade); clearTimeout(tDone); };
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className={`landing${fadeOut ? ' fade-out' : ''}`}>
      <div className="idcs-only idcs-animate" aria-label="splash-idcs">IDCS</div>
    </div>
  );
}
