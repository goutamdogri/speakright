import { useEffect, useRef, useState } from 'react';
import type { DisplayCorrection, ListeningState } from '@speakright/shared';

declare global {
  interface Window {
    speakright: any;
  }
}

export function Overlay() {
  const [correction, setCorrection] = useState<DisplayCorrection | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [listening, setListening] = useState<ListeningState>('disabled');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubCorrection = window.speakright?.onCorrection?.((data: DisplayCorrection) => {
      setCorrection(data);
      setDismissed(false);
    });
    const unsubState = window.speakright?.onListeningState?.((state: ListeningState) => {
      setListening(state);
    });
    return () => {
      unsubCorrection?.();
      unsubState?.();
    };
  }, []);

  // The transparent window must track its content size or tall corrections get
  // clipped by the fixed-height window. Report dimensions up so the OS window
  // resizes to fit everything.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => {
      // scrollHeight includes child margins; add a little bottom breathing room.
      window.speakright?.resizeOverlay?.(el.scrollWidth, el.scrollHeight + 8);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [correction, dismissed, listening]);

  if (!correction || dismissed) {
    // Idle state: a faint pill so the overlay doesn't look like a broken window.
    return (
      <div ref={rootRef} style={{ width: '100vw' }} className="flex items-start justify-end">
        <div
          className="pointer-events-none select-none rounded-full border px-3 py-1.5 mt-2 mr-2 text-[11px] font-medium shadow-sm backdrop-blur-xl"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            borderColor: 'rgba(255, 255, 255, 0.4)',
            color: listening === 'listening' ? '#4ade80' : 'rgba(255,255,255,0.85)',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.25)',
          }}
        >
          {listening === 'listening'
            ? '● Listening — corrections appear here'
            : 'SpeakRight — press Ctrl+Alt+E to listen'}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto"
      style={{ width: '100vw' }}
    >
      <div className="rounded-xl overflow-hidden mx-2 mt-2 mb-2 backdrop-blur-xl"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.78)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.28)',
        }}
      >
        <div className="px-4 py-3">
          {/* Original — neutral/red */}
          <div className="text-[13px] font-semibold text-red-500/80 uppercase tracking-wide mb-1">
            Original
          </div>
          <p className="text-sm text-slate-600 line-through decoration-red-400 decoration-1 leading-snug">
            {correction.original}
          </p>

          {/* Corrected — green accent */}
          {correction.hasCorrection && (
            <>
              <div className="mt-3 text-[13px] font-semibold text-green-600 uppercase tracking-wide mb-1">
                Correction
              </div>
              <p className="text-sm font-medium text-green-700 leading-snug">
                {correction.corrected}
              </p>
            </>
          )}

          {/* Why — concise structured explanation */}
          {correction.explanation && (
            <>
              <div className="mt-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Why
              </div>
              <div className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">
                {correction.explanation}
              </div>
            </>
          )}
        </div>

        {/* Progress / age indicator */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-green-400/60 transition-all duration-1000"
            style={{ width: '5%' }}
          />
        </div>
      </div>
    </div>
  );
}