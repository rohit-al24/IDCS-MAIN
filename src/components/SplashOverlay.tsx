import React, { useEffect, useState } from "react";
import "./splash.css";

/**
 * SplashOverlay: animated gif (man flying) and IDCS text crossing animation.
 * Sequence:
 *  - Man (gif) flies from left → center, pauses ~1s → continues to right
 *  - IDCS text moves from right → center (behind the gif) → continues left
 *  - onDone() is called when animation completes
 */
export default function SplashOverlay({ onDone, videoSrc }: { onDone?: () => void; videoSrc?: string }) {
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const handleVideoEnd = () => {
    setFadeOut(true);
    setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 700); // match CSS fade duration
  };
  const handleVideoError = () => {
    setError(true);
    setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 700);
    }, 1200);
  };

  if (!visible) return null;

  return (
    <div className={`splash-fullscreen${fadeOut ? ' splash-fadeout' : ''}`}>
      {error ? (
        <div className="splash-error-msg" style={{ color: '#fff', fontSize: '2rem', textAlign: 'center', margin: 'auto' }}>
          Unable to load splash video.<br />Please check <b>public/intro.mp4</b>.<br />
        </div>
      ) : (
        <video
          className="splash-video-full"
          src={videoSrc || '/intro.mp4'}
          autoPlay
          playsInline
          muted
          onEnded={handleVideoEnd}
          onError={handleVideoError}
          onClick={() => {
            setFadeOut(true);
            setTimeout(() => {
              setVisible(false);
              onDone?.();
            }, 700);
          }}
          style={{ cursor: 'pointer' }}
          title="Click to skip"
        />
      )}
    </div>
  );
}
