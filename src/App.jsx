import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, query,
  orderBy, limit, onSnapshot, doc,
} from "firebase/firestore";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const TOKEN_CA        = "13SVgpzFcZf8vF6Tg1QV7vec82FdJrf4Kg2VEX4xpump";
const CREATOR_WALLET  = "DSf8dVXjLbnCmEHbNfEATd37486Pe5m8o1nHNQZGgEd1";
const ST_API_KEY      = import.meta.env.VITE_TRACKER_CODE;
const X_URL           = "https://x.com/windfall_sol?s=21";
const COMMUNITY_URL   = "https://x.com/windfall_sol?s=21";
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
const short  = (a) => a ? `${a.slice(0,4)}...${a.slice(-4)}` : "—";
const fmtSOL = (n) => (n == null) ? "—" : n < 0.0001 ? "<0.0001" : n.toFixed(4);
const fmtUSD = (n) => {
  if (n == null) return "—";
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

const R = 108;
const C = 2 * Math.PI * R;

// ─── STYLES ────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

  :root {
    --navy:    #050B1A;
    --navy2:   #091225;
    --navy3:   #0D1B35;
    --gold:    #D4A843;
    --gold2:   #F0C840;
    --gold3:   #FFE08A;
    --gold4:   #B8891E;
    --champagne: #F5E6C8;
    --text:    #EEE8DA;
    --muted:   rgba(245,230,200,0.45);
    --dim:     rgba(245,230,200,0.18);
    --border:  rgba(212,168,67,0.12);
    --border2: rgba(212,168,67,0.28);
    --card:    rgba(9,18,37,0.8);
  }

  html, body, #root {
    height:100%; background:var(--navy);
    color:var(--text); font-family:'Space Grotesk',sans-serif;
    overflow-x:hidden;
  }

  /* Rich navy background with subtle radial */
  body::before {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
    background:
      radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,168,67,0.08) 0%, transparent 60%),
      radial-gradient(ellipse 50% 40% at 20% 100%, rgba(212,168,67,0.04) 0%, transparent 50%),
      radial-gradient(ellipse 50% 40% at 80% 100%, rgba(30,60,120,0.3) 0%, transparent 50%);
  }

  /* Fine diagonal linen texture */
  body::after {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 2px,
      rgba(212,168,67,0.012) 2px,
      rgba(212,168,67,0.012) 4px
    );
  }

  /* Gold particle */
  .particle {
    position:fixed; border-radius:50%; pointer-events:none;
    opacity:0; animation:float linear infinite; z-index:0;
  }
  @keyframes float {
    0%   { transform:translateY(105vh) rotate(0deg);   opacity:0; }
    6%   { opacity:0.6; }
    90%  { opacity:0.15; }
    100% { transform:translateY(-8vh) rotate(360deg);  opacity:0; }
  }

  /* Pulse ring on countdown */
  @keyframes pulse-ring {
    0%   { box-shadow:0 0 0 0 rgba(212,168,67,0.4); }
    70%  { box-shadow:0 0 0 24px rgba(212,168,67,0); }
    100% { box-shadow:0 0 0 0 rgba(212,168,67,0); }
  }

  @keyframes glow-gold {
    0%,100% { box-shadow:0 0 20px rgba(212,168,67,.08), 0 0 60px rgba(212,168,67,.03); }
    50%      { box-shadow:0 0 40px rgba(212,168,67,.22), 0 0 80px rgba(212,168,67,.08); }
  }
  @keyframes shimmer {
    0%   { background-position:-200% center; }
    100% { background-position:200% center; }
  }
  @keyframes slide-in  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fade-up   { from{opacity:0;transform:translateY(24px)}  to{opacity:1;transform:translateY(0)} }
  @keyframes copy-flash { 0%{background:rgba(212,168,67,.2)} 100%{background:transparent} }

  .slide-in  { animation:slide-in .35s ease; }
  .fade-up   { animation:fade-up .6s ease both; }
  .copy-flash { animation:copy-flash .6s ease forwards; }

  /* Ornamental divider */
  .ornament {
    display:flex; align-items:center; gap:16px;
    margin:0 auto 40px; max-width:600px;
  }
  .ornament::before,.ornament::after {
    content:''; flex:1; height:1px;
    background:linear-gradient(90deg, transparent, rgba(212,168,67,0.35), transparent);
  }

  /* Stat card hover */
  .stat-card {
    transition: transform .2s ease, box-shadow .2s ease;
  }
  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(212,168,67,0.1);
  }

  /* Winner row hover */
  .winner-row {
    transition: background .2s ease;
  }
  .winner-row:hover { background: rgba(212,168,67,0.04) !important; }

  /* How card hover */
  .how-card { transition: transform .2s, border-color .2s, box-shadow .2s; }
  .how-card:hover {
    transform:translateY(-3px);
    border-color:rgba(212,168,67,0.35) !important;
    box-shadow:0 12px 40px rgba(212,168,67,0.1);
  }

  a { text-decoration:none; }
  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-thumb { background:rgba(212,168,67,0.15); border-radius:2px; }

  @media (max-width:700px) {
    .main-grid  { grid-template-columns:1fr !important; }
    .stats-grid { grid-template-columns:1fr 1fr !important; }
    .how-grid   { grid-template-columns:1fr !important; }
    .nav-links  { display:none !important; }
    .hero-title { font-size:clamp(52px,14vw,80px) !important; }
    .ca-row     { flex-direction:column !important; align-items:flex-start !important; }
  }
`;

// ─── Gold rule ornament SVG ─────────────────────────────────────────────────
const GoldRule = () => (
  <div style={{ display:"flex", alignItems:"center", gap:12, margin:"0 auto 48px", maxWidth:560 }}>
    <div style={{ flex:1, height:1, background:"linear-gradient(90deg,transparent,rgba(212,168,67,0.4))" }}/>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" fill="rgba(212,168,67,0.6)"/>
    </svg>
    <div style={{ flex:1, height:1, background:"linear-gradient(90deg,rgba(212,168,67,0.4),transparent)" }}/>
  </div>
);

export default function App() {
  const [potSOL,    setPotSOL]    = useState(null);
  const [holders,   setHolders]   = useState(null);
  const [price,     setPrice]     = useState(null);
  const [winners,   setWinners]   = useState([]);
  const [stats,     setStats]     = useState(null);
  const [countdown, setCountdown] = useState(DISTRIBUTION_MS);
  const [copiedCA,  setCopiedCA]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const nextDistRef = useRef(null);

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
    document.title = "$WINDFALL — May the Fortune Find You";
    return () => document.head.removeChild(el);
  }, []);

  const fetchPot = useCallback(async () => {
    try {
      const res = await fetch("https://api.mainnet-beta.solana.com", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[CREATOR_WALLET]}),
      });
      const data = await res.json();
      if (data?.result?.value !== undefined) setPotSOL(data.result.value / 1e9);
    } catch {}
  }, []);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch(`https://data.solanatracker.io/tokens/${TOKEN_CA}`, {
        headers:{"x-api-key":ST_API_KEY},
      });
      const data = await res.json();
      const h = data?.holders ?? data?.data?.holders ?? null;
      if (h !== null) setHolders(h);
      const p = data?.price?.usd ?? data?.price ?? data?.pools?.[0]?.price?.usd
             ?? data?.pools?.[0]?.price ?? data?.data?.price?.usd ?? data?.data?.price ?? null;
      if (p !== null && !isNaN(p)) setPrice(parseFloat(p));
    } catch {}
  }, []);

  useEffect(() => {
    const q = query(collection(db,"windfall_distributions"),orderBy("timestamp","desc"),limit(20));
    return onSnapshot(q,(snap)=>setWinners(snap.docs.map(d=>({id:d.id,...d.data()}))));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db,"windfall_stats","global"),(snap)=>{
      if (!snap.exists()) return;
      const d = snap.data();
      setStats(d);
      if (d.currentPotSOL !== undefined) setPotSOL(d.currentPotSOL);
      if (d.lastDistribution) {
        const nextMs = d.lastDistribution.toMillis() + DISTRIBUTION_MS;
        nextDistRef.current = nextMs;
        setCountdown(Math.max(nextMs - Date.now(), 0));
      }
    });
  }, []);

  useEffect(() => {
    const id = setInterval(()=>{
      if (nextDistRef.current) {
        const rem = nextDistRef.current - Date.now();
        setCountdown(rem > 0 ? rem : 0);
      } else {
        setCountdown(p => p <= 1000 ? DISTRIBUTION_MS : p - 1000);
      }
    }, 1000);
    return ()=>clearInterval(id);
  }, []);

  useEffect(() => {
    fetchPot(); fetchToken();
    const id = setInterval(()=>{fetchPot();fetchToken();},30_000);
    return ()=>clearInterval(id);
  }, [fetchPot,fetchToken]);

  const mins   = Math.floor(countdown/60000);
  const secs   = Math.floor((countdown%60000)/1000);
  const cdStr  = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const dashOff = C * (countdown/DISTRIBUTION_MS);
  const urgent  = countdown < 30000 && countdown > 0;

  const copyCA = ()=>{
    navigator.clipboard.writeText(TOKEN_CA);
    setCopiedCA(true);
    setTimeout(()=>setCopiedCA(false),2000);
  };

  const PARTICLES = Array.from({length:30},(_,i)=>({
    id:i, left:`${(i*3.4+1.2)%100}%`,
    dur:`${12+(i*2.9%11)}s`, delay:`${(i*1.6)%15}s`,
    size: i%6===0?3:i%3===0?2:1.5,
  }));

  return (
    <div style={{minHeight:"100vh",position:"relative",zIndex:1}}>

      {/* Gold particles */}
      {PARTICLES.map(p=>(
        <div key={p.id} className="particle" style={{
          left:p.left, width:p.size, height:p.size,
          background:`rgba(212,168,67,${0.3+p.id%3*0.15})`,
          animationDuration:p.dur, animationDelay:p.delay,
          boxShadow:`0 0 ${p.size*2}px rgba(212,168,67,0.4)`,
        }}/>
      ))}

      {/* ── HEADER ── */}
      <header style={{
        position:"fixed",top:0,left:0,right:0,zIndex:200,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 32px", height:66,
        backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
        background:"rgba(5,11,26,0.92)",
        borderBottom:"1px solid var(--border2)",
      }}>
        {/* Left top and bottom gold lines */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,
          background:"linear-gradient(90deg,transparent,var(--gold),var(--gold2),var(--gold),transparent)"}}/>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{
            width:38,height:38,borderRadius:10,overflow:"hidden",
            border:"1px solid var(--border2)",
            boxShadow:"0 0 16px rgba(212,168,67,0.2)",
          }}>
            <img src="/logo.png" alt="$WINDFALL" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
          <div>
            <div style={{
              fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:4,lineHeight:1,
              background:"linear-gradient(135deg,var(--gold3),var(--gold),var(--gold2))",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            }}>$WINDFALL</div>
            <div style={{fontSize:8,letterSpacing:4,color:"var(--dim)",marginTop:1}}>ON SOLANA</div>
          </div>
        </div>

        <nav className="nav-links" style={{display:"flex",gap:32,alignItems:"center"}}>
          {[["𝕏",X_URL],["Community",COMMUNITY_URL]].map(([label,href])=>(
            <a key={label} href={href} target="_blank" rel="noreferrer" style={{
              color:"var(--muted)",fontSize:label==="𝕏"?18:13,
              letterSpacing:1,transition:"color .2s",
            }}
              onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"}
              onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
            >{label}</a>
          ))}
          <a href={`https://pump.fun/coin/${TOKEN_CA}`} target="_blank" rel="noreferrer" style={{
            padding:"8px 22px",
            background:"linear-gradient(135deg,var(--gold4),var(--gold),var(--gold2))",
            borderRadius:6,color:"#0A0800",fontWeight:700,fontSize:12,letterSpacing:2,
            boxShadow:"0 2px 16px rgba(212,168,67,0.3)",
            transition:"all .2s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 28px rgba(212,168,67,0.5)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 16px rgba(212,168,67,0.3)";e.currentTarget.style.transform="translateY(0)";}}
          >BUY NOW ↗</a>
        </nav>

        {/* Mobile menu btn */}
        <button onClick={()=>setMenuOpen(o=>!o)} style={{
          display:"none",background:"none",border:"1px solid var(--border2)",
          borderRadius:6,cursor:"pointer",color:"var(--gold)",padding:"6px 10px",fontSize:14,
        }} className="mobile-menu-btn">{menuOpen?"✕":"☰"}</button>
      </header>

      {/* Mobile menu */}
      {menuOpen&&(
        <div style={{position:"fixed",top:66,left:0,right:0,zIndex:199,
          background:"rgba(5,11,26,0.98)",borderBottom:"1px solid var(--border2)",
          padding:"20px 32px 28px",display:"flex",flexDirection:"column",gap:20}}>
          {[["𝕏 Twitter",X_URL],["Community",COMMUNITY_URL],["Buy $WINDFALL",`https://pump.fun/coin/${TOKEN_CA}`]].map(([l,h])=>(
            <a key={l} href={h} target="_blank" rel="noreferrer"
              style={{color:"var(--gold)",fontSize:14,letterSpacing:1}}
              onClick={()=>setMenuOpen(false)}>{l}</a>
          ))}
        </div>
      )}

      <main style={{maxWidth:1020,margin:"0 auto",padding:"100px 24px 80px"}}>

        {/* ── HERO ── */}
        <div style={{textAlign:"center",marginBottom:68,paddingTop:20}} className="fade-up">

          {/* Badge */}
          <div style={{
            display:"inline-flex",alignItems:"center",gap:10,
            padding:"6px 20px",marginBottom:28,
            border:"1px solid var(--border2)",borderRadius:40,
            background:"rgba(212,168,67,0.06)",
          }}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"var(--gold)",
              boxShadow:"0 0 8px var(--gold)",animation:"pulse-ring 2s ease infinite",display:"inline-block"}}/>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:10,
              letterSpacing:5,color:"var(--gold)",fontWeight:600}}>LIVE · EVERY 5 MINUTES · FOREVER</span>
          </div>

          <h1 className="hero-title" style={{
            fontFamily:"'Bebas Neue',sans-serif",
            fontSize:"clamp(64px,10vw,120px)",
            lineHeight:0.88,letterSpacing:3,
            background:"linear-gradient(160deg,var(--gold3) 0%,var(--gold) 40%,var(--gold2) 70%,var(--champagne) 100%)",
            backgroundSize:"200%",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            animation:"shimmer 6s linear infinite",
            marginBottom:28,
          }}>
            MAY THE<br/>
            <span style={{
              WebkitTextFillColor:"transparent",
              background:"linear-gradient(135deg,var(--gold3),var(--gold2),var(--gold))",
              backgroundSize:"200%",
              WebkitBackgroundClip:"text",
              animation:"shimmer 4s linear infinite",
              fontSize:"1.1em",letterSpacing:6,
            }}>$WINDFALL</span><br/>
            ON YOU
          </h1>

          <p style={{color:"var(--muted)",fontSize:16,maxWidth:460,margin:"0 auto 36px",lineHeight:1.8,fontWeight:300}}>
            Every 5 minutes, one random holder receives all accumulated creator fees.
            <br/>288 chances a day. No staking. No tiers. Just hold.
          </p>

          <div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap"}}>
            <a href={`https://pump.fun/coin/${TOKEN_CA}`} target="_blank" rel="noreferrer" style={{
              padding:"14px 36px",
              background:"linear-gradient(135deg,var(--gold4),var(--gold),var(--gold2))",
              borderRadius:8,color:"#080500",fontWeight:700,fontSize:13,letterSpacing:3,
              boxShadow:"0 4px 24px rgba(212,168,67,0.35),0 0 60px rgba(212,168,67,0.1)",
              transition:"all .2s",display:"inline-block",
            }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 6px 36px rgba(212,168,67,0.55),0 0 80px rgba(212,168,67,0.15)";e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 4px 24px rgba(212,168,67,0.35),0 0 60px rgba(212,168,67,0.1)";e.currentTarget.style.transform="translateY(0)";}}
            >BUY $WINDFALL ↗</a>
            <a href={X_URL} target="_blank" rel="noreferrer" style={{
              padding:"14px 32px",
              background:"transparent",
              border:"1px solid var(--border2)",
              borderRadius:8,color:"var(--gold)",fontWeight:600,fontSize:13,letterSpacing:2,
              transition:"all .2s",display:"inline-block",
            }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(212,168,67,0.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
            >𝕏 FOLLOW</a>
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div className="stats-grid" style={{
          display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:28,
        }}>
          {[
            {label:"CURRENT POT",   value:potSOL!==null?`◎ ${fmtSOL(potSOL)}`:"—",  accent:true},
            {label:"TOKEN PRICE",   value:price!==null?fmtUSD(price):"—"},
            {label:"HOLDERS",       value:holders!==null?holders.toLocaleString():"—"},
            {label:"TOTAL PAID OUT",value:stats?.totalDistributed?`◎ ${fmtSOL(stats.totalDistributed)}`:"◎ 0"},
            {label:"ROUNDS DONE",   value:stats?.totalRounds?.toLocaleString()??"0"},
          ].map((s,i)=>(
            <div key={s.label} className="stat-card" style={{
              background:s.accent?"rgba(212,168,67,0.07)":"rgba(9,18,37,0.6)",
              border:`1px solid ${s.accent?"var(--border2)":"var(--border)"}`,
              borderRadius:10,padding:"18px 16px",
              animation:s.accent?"glow-gold 4s ease-in-out infinite":"none",
              animationDelay:`${i*0.2}s`,
              position:"relative",overflow:"hidden",
            }}>
              {s.accent&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,
                background:"linear-gradient(90deg,transparent,var(--gold),var(--gold2),var(--gold),transparent)"}}/>}
              <div style={{fontSize:8,letterSpacing:3.5,color:"var(--muted)",marginBottom:10,fontWeight:500}}>{s.label}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:17,fontWeight:500,
                color:s.accent?"var(--gold)":"var(--text)"}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── COUNTDOWN + WINNERS ── */}
        <div className="main-grid" style={{
          display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28,
        }}>

          {/* COUNTDOWN */}
          <div style={{
            background:"var(--card)",
            border:"1px solid var(--border2)",
            borderRadius:16,padding:"44px 28px",
            display:"flex",flexDirection:"column",alignItems:"center",gap:24,
            position:"relative",overflow:"hidden",
            boxShadow:"inset 0 1px 0 rgba(212,168,67,0.1), 0 20px 60px rgba(0,0,0,0.4)",
          }}>
            {/* Corner ornaments */}
            <div style={{position:"absolute",top:16,left:16,width:20,height:20,
              borderTop:"1px solid var(--gold)",borderLeft:"1px solid var(--gold)",opacity:0.4}}/>
            <div style={{position:"absolute",top:16,right:16,width:20,height:20,
              borderTop:"1px solid var(--gold)",borderRight:"1px solid var(--gold)",opacity:0.4}}/>
            <div style={{position:"absolute",bottom:16,left:16,width:20,height:20,
              borderBottom:"1px solid var(--gold)",borderLeft:"1px solid var(--gold)",opacity:0.4}}/>
            <div style={{position:"absolute",bottom:16,right:16,width:20,height:20,
              borderBottom:"1px solid var(--gold)",borderRight:"1px solid var(--gold)",opacity:0.4}}/>

            <div style={{fontSize:9,letterSpacing:5,color:"var(--muted)",fontWeight:600}}>NEXT WINDFALL IN</div>

            <div style={{position:"relative",width:236,height:236}}>
              <svg width="236" height="236" viewBox="0 0 236 236" style={{transform:"rotate(-90deg)"}}>
                <defs>
                  <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={urgent?"#FF6B35":"var(--gold4)"}/>
                    <stop offset="100%" stopColor={urgent?"#FF3333":"var(--gold3)"}/>
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
                <circle cx="118" cy="118" r={R} fill="none"
                  stroke="rgba(212,168,67,0.06)" strokeWidth="3"/>
                <circle cx="118" cy="118" r={R} fill="none"
                  stroke="url(#rg)" strokeWidth="3"
                  strokeLinecap="round" strokeDasharray={C} strokeDashoffset={dashOff}
                  filter="url(#glow)"
                  style={{transition:"stroke-dashoffset 1s linear"}}/>
              </svg>
              <div style={{
                position:"absolute",inset:0,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,
              }}>
                <div style={{
                  fontFamily:"'Bebas Neue',sans-serif",fontSize:72,lineHeight:1,
                  color:urgent?"#FF6B35":"var(--gold)",
                  textShadow:urgent?"0 0 40px rgba(255,107,53,0.6)":"0 0 40px rgba(212,168,67,0.4)",
                  transition:"color 0.5s, text-shadow 0.5s",
                }}>{cdStr}</div>
                <div style={{fontSize:8,letterSpacing:5,color:"var(--muted)"}}>MM : SS</div>
              </div>
            </div>

            <div style={{textAlign:"center",lineHeight:2}}>
              <p style={{fontSize:13,color:"var(--muted)"}}>One random holder wins everything.</p>
              <p style={{fontSize:13,color:"var(--muted)"}}>288 times a day. No exceptions.</p>
            </div>

            <div style={{
              width:"100%",padding:"12px 20px",
              background:"rgba(212,168,67,0.07)",
              border:"1px solid var(--border2)",borderRadius:8,
              textAlign:"center",
            }}>
              <div style={{fontSize:9,letterSpacing:4,color:"var(--muted)",marginBottom:6}}>CURRENT POT</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,
                color:"var(--gold)",letterSpacing:2,lineHeight:1}}>
                ◎ {potSOL!==null?fmtSOL(potSOL):"—"}
              </div>
            </div>
          </div>

          {/* WINNERS FEED */}
          <div style={{
            background:"var(--card)",border:"1px solid var(--border)",
            borderRadius:16,padding:"32px 28px",
            display:"flex",flexDirection:"column",minHeight:420,overflow:"hidden",
            position:"relative",
            boxShadow:"inset 0 1px 0 rgba(212,168,67,0.06), 0 20px 60px rgba(0,0,0,0.4)",
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <div style={{fontSize:9,letterSpacing:4,color:"var(--muted)",fontWeight:600}}>RECENT WINNERS</div>
              {winners.length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"var(--gold)",
                    boxShadow:"0 0 6px var(--gold)",animation:"pulse-ring 2s ease infinite"}}/>
                  <span style={{fontSize:9,letterSpacing:3,color:"var(--gold)"}}>LIVE</span>
                </div>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
              {winners.length===0?(
                <div style={{flex:1,display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",gap:12,
                  color:"var(--dim)",fontSize:13,textAlign:"center"}}>
                  <div style={{fontSize:40,opacity:0.3}}>🌬️</div>
                  <div style={{letterSpacing:2,fontSize:11}}>FIRST WINDFALL INCOMING</div>
                </div>
              ):winners.map((w,i)=>(
                <div key={w.id} className={`winner-row${i===0?" slide-in":""}`} style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"13px 10px",
                  borderBottom:"1px solid rgba(212,168,67,0.06)",
                  borderTop:i===0?"1px solid var(--border2)":"none",
                  borderRadius:6,margin:"1px 0",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{
                      width:28,height:28,borderRadius:6,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      background:i===0?"rgba(212,168,67,0.15)":"rgba(255,255,255,0.04)",
                      border:`1px solid ${i===0?"var(--border2)":"var(--border)"}`,
                      fontFamily:"'DM Mono',monospace",fontSize:10,
                      color:i===0?"var(--gold)":"var(--dim)",fontWeight:500,
                    }}>{i+1}</div>
                    <div>
                      <a href={`https://solscan.io/account/${w.winner}`} target="_blank" rel="noreferrer"
                        style={{fontFamily:"'DM Mono',monospace",fontSize:12,
                          color:i===0?"var(--text)":"var(--muted)",
                          transition:"color .2s"}}
                        onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"}
                        onMouseLeave={e=>e.currentTarget.style.color=i===0?"var(--text)":"var(--muted)"}
                      >{short(w.winner)}</a>
                      <div style={{fontSize:10,color:"var(--dim)",marginTop:2}}>
                        {w.timestamp?timeAgo(w.timestamp.toMillis()):""}
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:500,
                      color:i===0?"var(--gold)":"var(--muted)"}}>
                      +◎ {fmtSOL(w.amount)}
                    </div>
                    {w.usdAmount&&<div style={{fontSize:10,color:"var(--dim)",marginTop:2}}>
                      {fmtUSD(w.usdAmount)}
                    </div>}
                  </div>
                </div>
              ))}
            </div>

            {winners[0]&&(
              <div style={{
                marginTop:20,padding:"14px 18px",
                background:"linear-gradient(135deg,rgba(212,168,67,0.1),rgba(212,168,67,0.04))",
                borderRadius:10,border:"1px solid var(--border2)",
                display:"flex",alignItems:"center",gap:14,
              }}>
                <div style={{fontSize:22}}>🏆</div>
                <div>
                  <div style={{fontSize:9,color:"var(--muted)",letterSpacing:3,marginBottom:4}}>LAST WINNER</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:"var(--gold)",fontWeight:500}}>
                    {short(winners[0].winner)} · ◎ {fmtSOL(winners[0].amount)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CONTRACT ADDRESS ── */}
        <div className="ca-row" style={{
          background:"rgba(9,18,37,0.6)",border:"1px solid var(--border)",
          borderRadius:12,padding:"22px 28px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          gap:16,marginBottom:72,flexWrap:"wrap",position:"relative",overflow:"hidden",
        }}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:1,
            background:"linear-gradient(90deg,transparent,rgba(212,168,67,0.2),transparent)"}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:8,letterSpacing:4,color:"var(--muted)",marginBottom:8,fontWeight:600}}>CONTRACT ADDRESS</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"var(--text)",wordBreak:"break-all",lineHeight:1.6}}>
              {TOKEN_CA}
            </div>
          </div>
          <button onClick={copyCA} className={copiedCA?"copy-flash":""} style={{
            background:copiedCA?"rgba(212,168,67,0.15)":"rgba(212,168,67,0.08)",
            border:"1px solid var(--border2)",
            borderRadius:8,color:copiedCA?"var(--gold)":"var(--muted)",
            padding:"11px 26px",cursor:"pointer",fontSize:11,
            letterSpacing:2,fontFamily:"'Space Grotesk',sans-serif",
            whiteSpace:"nowrap",transition:"all .2s",flexShrink:0,fontWeight:600,
          }}
            onMouseEnter={e=>{if(!copiedCA){e.currentTarget.style.color="var(--gold)";e.currentTarget.style.borderColor="var(--gold)";}}  }
            onMouseLeave={e=>{if(!copiedCA){e.currentTarget.style.color="var(--muted)";e.currentTarget.style.borderColor="var(--border2)";}}}
          >{copiedCA?"COPIED ✓":"COPY CA"}</button>
        </div>

        {/* ── HOW IT WORKS ── */}
        <GoldRule/>
        <p style={{fontSize:9,letterSpacing:6,color:"var(--muted)",textAlign:"center",marginBottom:40,fontWeight:600}}>
          HOW IT WORKS
        </p>
        <div className="how-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:72}}>
          {[
            {n:"01",icon:"🌊",title:"Hold $WINDFALL",
              body:"Buy and hold. That's the only requirement. No locking, no staking, no complexity. Just hold and you're eligible."},
            {n:"02",icon:"🎲",title:"Every 5 Minutes",
              body:"The engine scans all current holders and picks one completely at random — 288 times a day, around the clock."},
            {n:"03",icon:"💨",title:"Fortune Finds You",
              body:"All creator fees accumulated in that window land directly in the winner's wallet. Then the clock resets. Forever."},
          ].map((s,i)=>(
            <div key={s.n} className="how-card" style={{
              padding:"32px 26px",
              background:"rgba(9,18,37,0.6)",
              borderRadius:14,border:"1px solid var(--border)",
              position:"relative",overflow:"hidden",
              animationDelay:`${i*0.15}s`,
            }}>
              {/* Top accent */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:2,
                background:`linear-gradient(90deg,transparent,rgba(212,168,67,${0.2+i*0.1}),transparent)`}}/>
              <div style={{
                fontFamily:"'Bebas Neue',sans-serif",fontSize:52,
                color:"rgba(212,168,67,0.08)",lineHeight:1,marginBottom:8,
              }}>{s.n}</div>
              <div style={{fontSize:28,marginBottom:14}}>{s.icon}</div>
              <div style={{fontSize:15,fontWeight:600,marginBottom:12,color:"var(--champagne)"}}>{s.title}</div>
              <div style={{fontSize:13,color:"var(--muted)",lineHeight:1.75}}>{s.body}</div>
            </div>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:40,textAlign:"center"}}>
          <div style={{
            fontFamily:"'Bebas Neue',sans-serif",fontSize:20,
            letterSpacing:5,marginBottom:6,
            background:"linear-gradient(135deg,var(--gold3),var(--gold),var(--gold2))",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          }}>MAY THE $WINDFALL ON YOU 🌬️</div>
          <div style={{fontSize:11,color:"var(--dim)",letterSpacing:3,marginBottom:28}}>
            288 ROUNDS · EVERY DAY · ON SOLANA
          </div>
          <div style={{display:"flex",gap:32,justifyContent:"center",alignItems:"center"}}>
            <a href={X_URL} target="_blank" rel="noreferrer"
              style={{color:"var(--muted)",fontSize:13,transition:"color .2s"}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"}
              onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
            >𝕏 Twitter</a>
            <div style={{width:3,height:3,borderRadius:"50%",background:"var(--border2)"}}/>
            <a href={COMMUNITY_URL} target="_blank" rel="noreferrer"
              style={{color:"var(--muted)",fontSize:13,transition:"color .2s"}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"}
              onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
            >Community</a>
          </div>
        </div>

      </main>
    </div>
  );
}
