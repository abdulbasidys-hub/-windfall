import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
} from "firebase/firestore";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const TOKEN_CA        = "DHreAxThdTjpFaWr1Lvwt1aCnZhfxfJWNmo2dFSypump";
const CREATOR_WALLET  = "DSf8dVXjLbnCmEHbNfEATd37486Pe5m8o1nHNQZGgEd1";
const ST_API_KEY      = import.meta.env.VITE_TRACKER_CODE;
const X_URL           = "https://x.com/REPLACE_YOUR_HANDLE";   // ← update
const COMMUNITY_URL   = "https://x.com/i/communities/REPLACE"; // ← update
const DISTRIBUTION_MS = 5 * 60 * 1000;

// ─── FIREBASE ──────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAdYOWVOY1KSc6Ns1l3CV3sW-Y6kxhJHWg",
  authDomain:        "the-contrarian.firebaseapp.com",
  projectId:         "the-contrarian",
  storageBucket:     "the-contrarian.firebasestorage.app",
  messagingSenderId: "1043559632677",
  appId:             "1:1043559632677:web:4a9bd084a7782c3e98d4cc",
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ─── HELPERS ───────────────────────────────────────────────────────────────
const short   = (a) => a ? `${a.slice(0,4)}...${a.slice(-4)}` : "—";
const fmtSOL  = (n) => (n === null || n === undefined) ? "—" : n < 0.0001 ? "<0.0001" : n.toFixed(4);
const fmtUSD  = (n) => {
  if (n === null || n === undefined) return "—";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01)     return `$${n.toFixed(6)}`;
  if (n < 1)        return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};
const timeAgo = (ms) => {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

// ─── PARTICLES ─────────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i, left: `${(i * 3.7 + 1.1) % 100}%`,
  dur: `${11 + ((i * 3.3) % 13)}s`, delay: `${(i * 1.7) % 14}s`,
  size: i % 5 === 0 ? 3 : 2, gold: i % 3 !== 0,
}));

const R = 108;
const C = 2 * Math.PI * R;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #05050F; --card: rgba(255,255,255,0.033);
    --border: rgba(255,255,255,0.07); --border-gold: rgba(240,192,64,0.22);
    --gold: #F0C040; --gold2: #F5A623; --gold3: #FFE08A;
    --wind: #7FFFCB; --text: #EBEBEB;
    --muted: rgba(255,255,255,0.38); --dim: rgba(255,255,255,0.16);
  }
  html, body, #root {
    height: 100%; background: var(--bg); color: var(--text);
    font-family: 'Space Grotesk', sans-serif; overflow-x: hidden;
  }
  body::before {
    content: ''; position: fixed; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.022; pointer-events: none; z-index: 0;
  }
  .particle { position:fixed; border-radius:50%; pointer-events:none; opacity:0; animation:float linear infinite; z-index:0; }
  @keyframes float {
    0%   { transform:translateY(105vh) translateX(0);  opacity:0; }
    8%   { opacity:0.5; }
    88%  { opacity:0.2; }
    100% { transform:translateY(-8vh) translateX(40px); opacity:0; }
  }
  @keyframes glow-gold {
    0%,100% { box-shadow:0 0 18px rgba(240,192,64,.10),0 0 48px rgba(240,192,64,.04); }
    50%      { box-shadow:0 0 32px rgba(240,192,64,.28),0 0 72px rgba(240,192,64,.10); }
  }
  @keyframes slide-in { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  .slide-in { animation:slide-in .4s ease; }
  @keyframes copy-flash { 0%{background:rgba(127,255,203,.16)} 100%{background:transparent} }
  .copy-flash { animation:copy-flash .6s ease forwards; }
  a { text-decoration:none; }
  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.07); border-radius:2px; }
  @media (max-width:700px) {
    .main-grid  { grid-template-columns:1fr !important; }
    .stats-grid { grid-template-columns:1fr 1fr !important; }
    .how-grid   { grid-template-columns:1fr !important; }
    .nav-links  { display:none !important; }
    .hero-title { font-size:clamp(54px,14vw,80px) !important; }
    .ca-row     { flex-direction:column !important; align-items:flex-start !important; }
  }
`;

export default function App() {
  const [potSOL,    setPotSOL]    = useState(null);
  const [holders,   setHolders]   = useState(null);
  const [price,     setPrice]     = useState(null);
  const [winners,   setWinners]   = useState([]);
  const [stats,     setStats]     = useState(null);
  const [countdown, setCountdown] = useState(DISTRIBUTION_MS);
  const [copiedCA,  setCopiedCA]  = useState(false);
  const nextDistRef = useRef(null);

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    document.title = "$WINDFALL — May the Fortune Find You";
    return () => document.head.removeChild(el);
  }, []);

  // Creator wallet balance via Solana RPC
  const fetchPot = useCallback(async () => {
    try {
      const res = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"getBalance", params:[CREATOR_WALLET] }),
      });
      const data = await res.json();
      if (data?.result?.value !== undefined) setPotSOL(data.result.value / 1e9);
    } catch {}
  }, []);

  // Token data via SolanaTracker — handles all response shapes
  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch(
        `https://data.solanatracker.io/tokens/${TOKEN_CA}`,
        { headers: { "x-api-key": ST_API_KEY } }
      );
      const data = await res.json();

      // Holders
      const h = data?.holders ?? data?.data?.holders ?? null;
      if (h !== null) setHolders(h);

      // Price — try every known location in ST response
      const p = data?.price?.usd
             ?? data?.price
             ?? data?.pools?.[0]?.price?.usd
             ?? data?.pools?.[0]?.price
             ?? data?.data?.price?.usd
             ?? data?.data?.price
             ?? null;
      if (p !== null && !isNaN(p)) setPrice(parseFloat(p));
    } catch {}
  }, []);

  // Firestore: real-time winners
  useEffect(() => {
    const q = query(
      collection(db, "windfall_distributions"),
      orderBy("timestamp", "desc"),
      limit(20)
    );
    return onSnapshot(q, (snap) =>
      setWinners(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  // Firestore: global stats + countdown anchor
  useEffect(() => {
    return onSnapshot(doc(db, "windfall_stats", "global"), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setStats(d);
      if (d.lastDistribution) {
        const nextMs = d.lastDistribution.toMillis() + DISTRIBUTION_MS;
        nextDistRef.current = nextMs;
        setCountdown(Math.max(nextMs - Date.now(), 0));
      }
    });
  }, []);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => {
      if (nextDistRef.current) {
        const rem = nextDistRef.current - Date.now();
        setCountdown(rem > 0 ? rem : 0);
      } else {
        setCountdown((p) => p <= 1000 ? DISTRIBUTION_MS : p - 1000);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Poll every 30s (was 60, cut in half so data feels live)
  useEffect(() => {
    fetchPot(); fetchToken();
    const id = setInterval(() => { fetchPot(); fetchToken(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchPot, fetchToken]);

  const mins    = Math.floor(countdown / 60000);
  const secs    = Math.floor((countdown % 60000) / 1000);
  const cdStr   = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const dashOff = C * (countdown / DISTRIBUTION_MS);

  const copyCA = () => {
    navigator.clipboard.writeText(TOKEN_CA);
    setCopiedCA(true);
    setTimeout(() => setCopiedCA(false), 2000);
  };

  return (
    <div style={{ minHeight:"100vh", position:"relative", zIndex:1 }}>

      {PARTICLES.map((p) => (
        <div key={p.id} className="particle" style={{
          left:p.left, width:p.size, height:p.size,
          background: p.gold ? "var(--gold)" : "var(--wind)",
          animationDuration:p.dur, animationDelay:p.delay,
        }} />
      ))}

      {/* HEADER */}
      <header style={{
        position:"fixed", top:0, left:0, right:0, zIndex:200,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 32px",
        backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
        borderBottom:"1px solid var(--border)", background:"rgba(5,5,15,0.84)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <img src="/logo.png" alt="$WINDFALL"
            style={{ width:34, height:34, borderRadius:8, objectFit:"cover" }} />
          <span style={{
            fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:3,
            background:"linear-gradient(135deg,var(--gold),var(--gold2))",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          }}>$WINDFALL</span>
        </div>
        <div className="nav-links" style={{ display:"flex", gap:28, alignItems:"center" }}>
          <a href={X_URL} target="_blank" rel="noreferrer"
            style={{ color:"var(--muted)", fontSize:16, transition:"color .2s" }}
            onMouseEnter={e => e.currentTarget.style.color="var(--text)"}
            onMouseLeave={e => e.currentTarget.style.color="var(--muted)"}
          >𝕏</a>
          <a href={COMMUNITY_URL} target="_blank" rel="noreferrer"
            style={{ color:"var(--muted)", fontSize:13, letterSpacing:1, transition:"color .2s" }}
            onMouseEnter={e => e.currentTarget.style.color="var(--text)"}
            onMouseLeave={e => e.currentTarget.style.color="var(--muted)"}
          >Community</a>
        </div>
      </header>

      <main style={{ maxWidth:980, margin:"0 auto", padding:"110px 24px 72px" }}>

        {/* HERO */}
        <div style={{ textAlign:"center", marginBottom:56 }}>
          <p style={{
            fontFamily:"'Bebas Neue',sans-serif", fontSize:11,
            letterSpacing:8, color:"var(--wind)", marginBottom:20, opacity:0.7,
          }}>FORTUNE FINDS THE HOLDER</p>
          <h1 className="hero-title" style={{
            fontFamily:"'Bebas Neue',sans-serif",
            fontSize:"clamp(60px,9vw,108px)",
            lineHeight:0.9, letterSpacing:2,
            background:"linear-gradient(150deg,var(--gold3) 0%,var(--gold) 45%,var(--gold2) 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            marginBottom:24,
          }}>
            MAY THE<br />$WINDFALL<br />BE ON YOU
          </h1>
          <p style={{ color:"var(--muted)", fontSize:15, maxWidth:420, margin:"0 auto", lineHeight:1.7 }}>
            Every 5 minutes, one random holder receives all accumulated creator fees.
            288 chances a day. No staking. No tiers. Just hold.
          </p>
        </div>

        {/* STATS */}
        <div className="stats-grid" style={{
          display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:24,
        }}>
          {[
            { label:"CURRENT POT",    value: potSOL !== null ? `◎ ${fmtSOL(potSOL)}` : "—", accent:true },
            { label:"PRICE",          value: price  !== null ? fmtUSD(price)           : "—" },
            { label:"HOLDERS",        value: holders !== null ? holders.toLocaleString() : "—" },
            { label:"TOTAL PAID OUT", value: stats?.totalDistributed ? `◎ ${fmtSOL(stats.totalDistributed)}` : "◎ 0" },
            { label:"ROUNDS DONE",    value: stats?.totalRounds?.toLocaleString() ?? "0" },
          ].map((s) => (
            <div key={s.label} style={{
              background: s.accent ? "rgba(240,192,64,0.06)" : "var(--card)",
              border:`1px solid ${s.accent ? "var(--border-gold)" : "var(--border)"}`,
              borderRadius:12, padding:"18px 20px",
              animation: s.accent ? "glow-gold 3.5s ease-in-out infinite" : "none",
            }}>
              <div style={{ fontSize:9, letterSpacing:3.5, color:"var(--muted)", marginBottom:10 }}>{s.label}</div>
              <div style={{
                fontFamily:"'DM Mono',monospace", fontSize:18, fontWeight:500,
                color: s.accent ? "var(--gold)" : "var(--text)",
              }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* COUNTDOWN + WINNERS */}
        <div className="main-grid" style={{
          display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24,
        }}>

          {/* COUNTDOWN */}
          <div style={{
            background:"var(--card)", border:"1px solid var(--border)",
            borderRadius:16, padding:"40px 24px",
            display:"flex", flexDirection:"column", alignItems:"center", gap:20,
          }}>
            <div style={{ fontSize:9, letterSpacing:4, color:"var(--muted)" }}>NEXT WINDFALL IN</div>
            <div style={{ position:"relative", width:236, height:236 }}>
              <svg width="236" height="236" viewBox="0 0 236 236" style={{ transform:"rotate(-90deg)" }}>
                <defs>
                  <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="var(--gold2)" />
                    <stop offset="100%" stopColor="var(--gold3)" />
                  </linearGradient>
                </defs>
                <circle cx="118" cy="118" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2.5" />
                <circle cx="118" cy="118" r={R} fill="none" stroke="url(#rg)" strokeWidth="2.5"
                  strokeLinecap="round" strokeDasharray={C} strokeDashoffset={dashOff}
                  style={{ transition:"stroke-dashoffset 1s linear" }} />
              </svg>
              <div style={{
                position:"absolute", inset:0, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:4,
              }}>
                <div style={{
                  fontFamily:"'Bebas Neue',sans-serif", fontSize:68, lineHeight:1,
                  background:"linear-gradient(135deg,var(--gold3),var(--gold))",
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                }}>{cdStr}</div>
                <div style={{ fontSize:9, letterSpacing:4, color:"var(--muted)" }}>MM : SS</div>
              </div>
            </div>
            <div style={{ textAlign:"center", lineHeight:1.75 }}>
              <p style={{ fontSize:13, color:"var(--muted)" }}>One random holder wins everything.</p>
              <p style={{ fontSize:13, color:"var(--muted)" }}>Then it resets. Every 5 minutes. Forever.</p>
            </div>
          </div>

          {/* WINNERS FEED */}
          <div style={{
            background:"var(--card)", border:"1px solid var(--border)",
            borderRadius:16, padding:"32px 28px",
            display:"flex", flexDirection:"column", minHeight:420, overflow:"hidden",
          }}>
            <div style={{ fontSize:9, letterSpacing:4, color:"var(--muted)", marginBottom:20 }}>RECENT WINNERS</div>
            <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>
              {winners.length === 0 ? (
                <div style={{
                  flex:1, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center",
                  gap:10, color:"var(--dim)", fontSize:13, textAlign:"center",
                }}>
                  <div style={{ fontSize:32, opacity:0.35 }}>🌬️</div>
                  <div>First windfall incoming…</div>
                </div>
              ) : winners.map((w, i) => (
                <div key={w.id} className="slide-in" style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"13px 0", borderBottom:"1px solid var(--border)",
                  borderTop: i === 0 ? "1px solid var(--border-gold)" : "none",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{
                      width:6, height:6, borderRadius:"50%", flexShrink:0,
                      background: i === 0 ? "var(--gold)" : "rgba(255,255,255,0.10)",
                      boxShadow: i === 0 ? "0 0 8px rgba(240,192,64,0.6)" : "none",
                    }} />
                    <a href={`https://solscan.io/account/${w.winner}`} target="_blank" rel="noreferrer"
                      style={{ fontFamily:"'DM Mono',monospace", fontSize:13,
                        color: i === 0 ? "var(--text)" : "var(--muted)" }}>
                      {short(w.winner)}
                    </a>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:13,
                      color: i === 0 ? "var(--gold)" : "var(--muted)" }}>
                      +◎ {fmtSOL(w.amount)}
                    </div>
                    <div style={{ fontSize:10, color:"var(--dim)", marginTop:2 }}>
                      {w.timestamp ? timeAgo(w.timestamp.toMillis()) : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {winners[0] && (
              <div style={{
                marginTop:20, padding:"12px 16px",
                background:"rgba(240,192,64,0.07)", borderRadius:10,
                border:"1px solid var(--border-gold)",
                display:"flex", alignItems:"center", gap:10,
              }}>
                <span style={{ fontSize:16 }}>🏆</span>
                <div>
                  <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:2 }}>LAST WINNER</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"var(--gold)" }}>
                    {short(winners[0].winner)} · ◎ {fmtSOL(winners[0].amount)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CONTRACT ADDRESS */}
        <div className="ca-row" style={{
          background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:12, padding:"20px 26px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
          gap:16, marginBottom:56, flexWrap:"wrap",
        }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9, letterSpacing:3.5, color:"var(--muted)", marginBottom:8 }}>CONTRACT ADDRESS</div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:13, wordBreak:"break-all" }}>
              {TOKEN_CA}
            </div>
          </div>
          <button onClick={copyCA} className={copiedCA ? "copy-flash" : ""} style={{
            background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)",
            borderRadius:8, color: copiedCA ? "var(--wind)" : "var(--muted)",
            padding:"10px 22px", cursor:"pointer", fontSize:11,
            letterSpacing:2, fontFamily:"'Space Grotesk',sans-serif",
            whiteSpace:"nowrap", transition:"color .2s", flexShrink:0,
          }}>
            {copiedCA ? "COPIED ✓" : "COPY CA"}
          </button>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ borderTop:"1px solid var(--border)", paddingTop:52, marginBottom:56 }}>
          <p style={{ fontSize:9, letterSpacing:5, color:"var(--muted)", marginBottom:32, textAlign:"center" }}>
            HOW IT WORKS
          </p>
          <div className="how-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {[
              { n:"01", icon:"🌊", title:"Hold $WINDFALL",
                body:"Buy and hold. That's the only requirement. No locking, no staking, no complicated anything." },
              { n:"02", icon:"🎲", title:"Every 5 Minutes",
                body:"The engine scans every current holder and picks one completely at random — 288 times a day." },
              { n:"03", icon:"💨", title:"Fortune Finds You",
                body:"All creator fees in that window land directly in your wallet. Then the clock resets and it starts again." },
            ].map((s) => (
              <div key={s.n} style={{
                padding:"28px 24px", background:"var(--card)",
                borderRadius:14, border:"1px solid var(--border)",
              }}>
                <div style={{
                  fontFamily:"'Bebas Neue',sans-serif", fontSize:48,
                  color:"rgba(240,192,64,0.13)", lineHeight:1, marginBottom:4,
                }}>{s.n}</div>
                <div style={{ fontSize:22, marginBottom:10 }}>{s.icon}</div>
                <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>{s.title}</div>
                <div style={{ fontSize:13, color:"var(--muted)", lineHeight:1.65 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ borderTop:"1px solid var(--border)", paddingTop:36, textAlign:"center" }}>
          <div style={{
            fontFamily:"'Bebas Neue',sans-serif", fontSize:18,
            letterSpacing:4, color:"var(--muted)", marginBottom:20,
          }}>MAY THE $WINDFALL BE ON YOU 🌬️</div>
          <div style={{ display:"flex", gap:28, justifyContent:"center", alignItems:"center" }}>
            <a href={X_URL} target="_blank" rel="noreferrer"
              style={{ color:"var(--muted)", fontSize:13 }}>𝕏 Twitter</a>
            <div style={{ width:3, height:3, borderRadius:"50%", background:"var(--border)" }} />
            <a href={COMMUNITY_URL} target="_blank" rel="noreferrer"
              style={{ color:"var(--muted)", fontSize:13 }}>Community</a>
          </div>
        </div>

      </main>
    </div>
  );
}
