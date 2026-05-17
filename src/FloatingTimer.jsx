import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const DIST_MS = 5 * 60 * 1000;

const fmtTime = (ms) => {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};

export default function FloatingTimer() {
  const [countdown, setCountdown] = useState(DIST_MS);
  const [visible,   setVisible]   = useState(true);
  const winAtRef   = useRef(null);
  const lockedRef  = useRef(false);

  useEffect(() => {
    return onSnapshot(doc(db, "windfall_stats", "global"), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.lastDistribution) {
        const nextMs = d.lastDistribution.toMillis() + DIST_MS;
        if (nextMs > Date.now()) {
          winAtRef.current  = nextMs;
          lockedRef.current = false;
        }
      }
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!winAtRef.current) return;
      const rem = winAtRef.current - Date.now();
      if (rem <= 0) {
        setCountdown(0);
        lockedRef.current = true;
        return;
      }
      if (lockedRef.current) return;
      setCountdown(rem);
    }, 200);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  const urgent  = countdown > 0 && countdown < 30_000;
  const color   = urgent ? "#FFE000" : "rgba(255,255,255,0.9)";
  const bgColor = urgent ? "rgba(13,63,130,0.97)" : "rgba(13,63,130,0.92)";
  const borderC = urgent ? "rgba(255,224,0,0.5)"  : "rgba(255,255,255,0.2)";
  const glow    = urgent
    ? "0 0 24px rgba(255,224,0,0.3), 0 4px 20px rgba(0,0,0,0.5)"
    : "0 0 16px rgba(255,255,255,0.08), 0 4px 20px rgba(0,0,0,0.4)";

  return (
    <div style={{
      position:       "fixed",
      bottom:         24,
      right:          24,
      zIndex:         999,
      display:        "flex",
      alignItems:     "center",
      gap:            10,
      padding:        "10px 16px",
      background:     bgColor,
      border:         `1px solid ${borderC}`,
      borderRadius:   40,
      backdropFilter: "blur(16px)",
      boxShadow:      glow,
      transition:     "border-color 0.3s, box-shadow 0.3s",
      userSelect:     "none",
    }}>
      {/* Live dot */}
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: urgent ? "#FFE000" : "rgba(255,255,255,0.7)",
        boxShadow:  urgent ? "0 0 8px rgba(255,224,0,0.8)" : "0 0 6px rgba(255,255,255,0.4)",
        animation:  "blink 1.5s ease infinite",
        flexShrink: 0,
      }}/>

      {/* Timer */}
      <div style={{
        fontFamily:   "'Barlow Condensed', 'JetBrains Mono', monospace",
        fontSize:     19,
        fontWeight:   700,
        color,
        letterSpacing: "-0.03em",
        lineHeight:   1,
        textShadow:   urgent ? "0 0 20px rgba(255,224,0,0.5)" : "none",
        transition:   "color 0.3s, text-shadow 0.3s",
      }}>
        {fmtTime(countdown)}
      </div>

      {/* Close */}
      <button
        onClick={() => setVisible(false)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.3)", fontSize: 13,
          lineHeight: 1, padding: "0 0 0 2px", transition: "color 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}
        onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
      >×</button>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
    </div>
  );
}
