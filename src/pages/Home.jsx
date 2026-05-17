import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

// ── CONFIG ────────────────────────────────────────────────────────────────
const TOKEN_CA       = "13SVgpzFcZf8vF6Tg1QV7vec82FdJrf4Kg2VEX4xpump";
const CREATOR_WALLET = "DSf8dVXjLbnCmEHbNfEATd37486Pe5m8o1nHNQZGgEd1";
const ST_API_KEY     = import.meta.env.VITE_TRACKER_CODE;
const X_URL          = "https://x.com/windfall_sol?s=21";
const PUMP_URL       = `https://pump.fun/coin/${TOKEN_CA}`;
const DIST_MS        = 5 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────
const short   = (a) => a ? `${a.slice(0,4)}...${a.slice(-4)}` : "—";
const fmtSOL  = (n) => n == null ? "—" : n < 0.0001 ? "<0.0001" : n.toFixed(4);
const fmtUSD  = (n) => {
  if (n == null) return "—";
  if (n < 0.01)  return `$${n.toFixed(6)}`;
  if (n < 1)     return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};
const timeAgo = (ms) => {
  const s = Math.floor((Date.now()-ms)/1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(()=>{
    const h=()=>setW(window.innerWidth);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);
  return w;
}

// ── Floating money particles ──────────────────────────────────────────────
const COINS = Array.from({length:24},(_,i)=>({
  id:i,
  left:`${(i*4.2+1.5)%100}%`,
  dur:`${14+(i*2.3%10)}s`,
  delay:`${(i*1.9)%16}s`,
  size: i%7===0?14:i%4===0?10:7,
  symbol: i%3===0?"$":i%3===1?"◎":"💰",
  opacity: 0.06 + (i%4)*0.04,
}));

// ── Countdown ring ────────────────────────────────────────────────────────
const R = 106, C = 2*Math.PI*R;

function CountdownRing({ countdown }) {
  const mins    = Math.floor(countdown/60000);
  const secs    = Math.floor((countdown%60000)/1000);
  const cdStr   = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const pct     = countdown/DIST_MS;
  const offset  = C*(1-pct);
  const urgent  = countdown < 30000 && countdown > 0;

  return (
    <div style={{position:"relative",width:240,height:240}}>
      <svg width="240" height="240" viewBox="0 0 240 240" style={{transform:"rotate(-90deg)"}}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={urgent?"#FF5733":"#8B6010"}/>
            <stop offset="50%"  stopColor={urgent?"#FF8C00":"#E0AF45"}/>
            <stop offset="100%" stopColor={urgent?"#FFD700":"#FDE9A8"}/>
          </linearGradient>
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx="120" cy="120" r={R} fill="none"
          stroke="rgba(201,146,42,0.06)" strokeWidth="2.5"/>
        {/* Decorative dots at quarters */}
        {[0,90,180,270].map(deg=>(
          <circle key={deg}
            cx={120+R*Math.cos((deg-90)*Math.PI/180)}
            cy={120+R*Math.sin((deg-90)*Math.PI/180)}
            r="2.5" fill="rgba(201,146,42,0.3)"/>
        ))}
        {/* Progress arc */}
        <circle cx="120" cy="120" r={R} fill="none"
          stroke="url(#ringGrad)" strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          filter="url(#ringGlow)"
          style={{transition:"stroke-dashoffset 1s linear"}}/>
      </svg>

      {/* Center content */}
      <div style={{
        position:"absolute",inset:0,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
      }}>
        {/* Ornament top */}
        <div style={{
          fontFamily:"var(--serif)",fontSize:10,letterSpacing:6,
          color:"var(--muted)",marginBottom:4,
        }}>NEXT DRAW</div>

        <div style={{
          fontFamily:"'Cormorant Garamond',serif",
          fontSize:64,fontWeight:600,lineHeight:1,
          color:urgent?"#FF8C00":"var(--gold2)",
          textShadow:urgent
            ?"0 0 40px rgba(255,140,0,0.6)"
            :"0 0 30px rgba(201,146,42,0.3)",
          transition:"color 0.5s, text-shadow 0.5s",
          fontStyle:"italic",
        }}>{cdStr}</div>

        <div style={{
          fontFamily:"var(--sans)",fontSize:8,letterSpacing:5,
          color:"var(--muted)",marginTop:4,
        }}>MM : SS</div>
      </div>
    </div>
  );
}

// ── Gold ornamental divider ────────────────────────────────────────────────
function Divider({ label }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:16,margin:"60px 0 40px"}}>
      <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,var(--border2))"}}/>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 0L7.2 4.8L12 6L7.2 7.2L6 12L4.8 7.2L0 6L4.8 4.8Z"
            fill="rgba(201,146,42,0.5)"/>
        </svg>
        {label && <span style={{fontFamily:"var(--sans)",fontSize:9,letterSpacing:5,color:"var(--muted)",fontWeight:600}}>{label}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 0L7.2 4.8L12 6L7.2 7.2L6 12L4.8 7.2L0 6L4.8 4.8Z"
            fill="rgba(201,146,42,0.5)"/>
        </svg>
      </div>
      <div style={{flex:1,height:1,background:"linear-gradient(90deg,var(--border2),transparent)"}}/>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────
function Header({ navigate, menuOpen, setMenuOpen }) {
  const w = useWindowWidth();
  const isMobile = w < 768;

  return (
    <header style={{
      position:"fixed",top:0,left:0,right:0,zIndex:300,
      height:64,
      display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"0 32px",
      background:"rgba(4,8,15,0.92)",
      borderBottom:"1px solid var(--border)",
      backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
    }}>
      {/* Gold top line */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:"linear-gradient(90deg,transparent 0%,var(--gold) 30%,var(--gold2) 50%,var(--gold) 70%,transparent 100%)",
        opacity:0.6}}/>

      {/* Logo */}
      <button onClick={()=>navigate("home")} style={{
        background:"none",border:"none",cursor:"pointer",
        display:"flex",alignItems:"center",gap:11,
      }}>
        <div style={{
          width:36,height:36,borderRadius:6,overflow:"hidden",
          border:"1px solid var(--border2)",
          boxShadow:"0 0 14px rgba(201,146,42,0.2)",
          flexShrink:0,
        }}>
          <img src="/logo.png" alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{
            fontFamily:"var(--sans)",fontSize:16,fontWeight:900,letterSpacing:4,
            background:"linear-gradient(135deg,var(--gold3),var(--gold2))",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            lineHeight:1,
          }}>$WINDFALL</div>
          <div style={{fontFamily:"var(--mono)",fontSize:7,letterSpacing:3,color:"var(--dim)",marginTop:2}}>ON SOLANA</div>
        </div>
      </button>

      {/* Desktop nav */}
      {!isMobile && (
        <nav style={{display:"flex",alignItems:"center",gap:32}}>
          {[["DRAW",()=>navigate("draw")],["𝕏",()=>window.open(X_URL,"_blank")]].map(([l,fn])=>(
            <button key={l} onClick={fn} style={{
              background:"none",border:"none",cursor:"pointer",
              fontFamily:"var(--sans)",fontSize:l==="𝕏"?18:10,fontWeight:600,
              letterSpacing:l==="𝕏"?0:3,color:"var(--muted)",
              transition:"color 0.2s",
            }}
              onMouseEnter={e=>e.currentTarget.style.color="var(--gold2)"}
              onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
            >{l}</button>
          ))}
          <button onClick={()=>window.open(PUMP_URL,"_blank")} className="btn-gold" style={{fontSize:10,padding:"9px 22px"}}>
            BUY NOW ↗
          </button>
        </nav>
      )}

      {/* Mobile hamburger */}
      {isMobile && (
        <button onClick={()=>setMenuOpen(o=>!o)} style={{
          background:"none",border:"1px solid var(--border2)",borderRadius:3,
          cursor:"pointer",color:"var(--gold2)",padding:"6px 10px",fontSize:14,
        }}>{menuOpen?"✕":"☰"}</button>
      )}
    </header>
  );
}

// ── Main Home ─────────────────────────────────────────────────────────────
export default function Home({ navigate }) {
  const w        = useWindowWidth();
  const isMobile = w < 768;

  const [potSOL,    setPotSOL]    = useState(null);
  const [holders,   setHolders]   = useState(null);
  const [price,     setPrice]     = useState(null);
  const [winners,   setWinners]   = useState([]);
  const [stats,     setStats]     = useState(null);
  const [countdown, setCountdown] = useState(DIST_MS);
  const [copiedCA,  setCopiedCA]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const nextRef = useRef(null);

  // Firestore listeners
  useEffect(()=>{
    const q = query(collection(db,"windfall_distributions"),orderBy("timestamp","desc"),limit(15));
    return onSnapshot(q, snap=>setWinners(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  useEffect(()=>{
    return onSnapshot(doc(db,"windfall_stats","global"), snap=>{
      if (!snap.exists()) return;
      const d = snap.data();
      setStats(d);
      if (d.currentPotSOL !== undefined) setPotSOL(d.currentPotSOL);
      if (d.lastDistribution) {
        const next = d.lastDistribution.toMillis() + DIST_MS;
        nextRef.current = next;
        setCountdown(Math.max(next-Date.now(),0));
      }
    });
  },[]);

  // Countdown tick
  useEffect(()=>{
    const id = setInterval(()=>{
      if (nextRef.current) {
        const rem = nextRef.current - Date.now();
        setCountdown(rem>0?rem:0);
      } else {
        setCountdown(p=>p<=1000?DIST_MS:p-1000);
      }
    },1000);
    return ()=>clearInterval(id);
  },[]);

  // Token data
  const fetchToken = useCallback(async()=>{
    try {
      const res  = await fetch(`https://data.solanatracker.io/tokens/${TOKEN_CA}`,{headers:{"x-api-key":ST_API_KEY}});
      const data = await res.json();
      const h = data?.holders??data?.data?.holders??null;
      if (h!=null) setHolders(h);
      const p = data?.price?.usd??data?.price??data?.pools?.[0]?.price?.usd??data?.pools?.[0]?.price??null;
      if (p!=null&&!isNaN(p)) setPrice(parseFloat(p));
    } catch {}
  },[]);

  const fetchPot = useCallback(async()=>{
    try {
      const res  = await fetch("https://api.mainnet-beta.solana.com",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[CREATOR_WALLET]}),
      });
      const data = await res.json();
      if (data?.result?.value!==undefined) setPotSOL(data.result.value/1e9);
    } catch {}
  },[]);

  useEffect(()=>{
    fetchToken(); fetchPot();
    const id = setInterval(()=>{fetchToken();fetchPot();},30000);
    return ()=>clearInterval(id);
  },[fetchToken,fetchPot]);

  const copyCA = ()=>{
    navigator.clipboard.writeText(TOKEN_CA);
    setCopiedCA(true);
    setTimeout(()=>setCopiedCA(false),2000);
  };

  const urgent = countdown < 30000 && countdown > 0;

  return (
    <div style={{minHeight:"100vh",position:"relative",zIndex:1}}>

      {/* Floating coins */}
      {COINS.map(c=>(
        <div key={c.id} style={{
          position:"fixed",left:c.left,bottom:"-60px",
          fontSize:c.size,lineHeight:1,
          opacity:c.opacity,pointerEvents:"none",zIndex:0,
          animation:`float-coin ${c.dur} linear ${c.delay} infinite`,
        }}>{c.symbol}</div>
      ))}

      <Header navigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen}/>

      {/* Mobile menu */}
      {menuOpen&&(
        <div style={{position:"fixed",top:64,left:0,right:0,zIndex:299,
          background:"rgba(4,8,15,0.97)",borderBottom:"1px solid var(--border)",
          padding:"20px 28px 28px",display:"flex",flexDirection:"column",gap:20}}>
          {[["LIVE DRAW",()=>{navigate("draw");setMenuOpen(false);}],
            ["𝕏 TWITTER",()=>{window.open(X_URL,"_blank");setMenuOpen(false);}],
            ["BUY $WINDFALL",()=>{window.open(PUMP_URL,"_blank");setMenuOpen(false);}]
          ].map(([l,fn])=>(
            <button key={l} onClick={fn} style={{
              background:"none",border:"none",cursor:"pointer",
              fontFamily:"var(--sans)",fontSize:13,fontWeight:600,letterSpacing:2,
              color:"var(--gold2)",textAlign:"left",padding:"8px 0",
              borderBottom:"1px solid var(--border)",
            }}>{l}</button>
          ))}
        </div>
      )}

      <main style={{maxWidth:"var(--max-w)",margin:"0 auto",padding:isMobile?"90px 16px 60px":"100px 28px 80px"}}>

        {/* ── HERO ── */}
        <div style={{
          textAlign:"center",
          paddingBottom:isMobile?60:80,
          paddingTop:isMobile?20:36,
          position:"relative",
        }}>
          {/* Decorative vertical lines */}
          {!isMobile&&[25,75].map(pct=>(
            <div key={pct} style={{
              position:"absolute",top:0,bottom:0,left:`${pct}%`,
              width:1,
              background:`linear-gradient(180deg,transparent,rgba(201,146,42,0.1) 30%,rgba(201,146,42,0.1) 70%,transparent)`,
              pointerEvents:"none",
            }}/>
          ))}

          {/* Subtitle */}
          <div style={{
            display:"inline-flex",alignItems:"center",gap:14,
            padding:"7px 22px",marginBottom:32,
            border:"1px solid var(--border2)",borderRadius:40,
            background:"rgba(201,146,42,0.06)",
          }}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"var(--gold2)",
              boxShadow:"0 0 10px var(--gold-glow)",animation:"blink 2s ease infinite"}}/>
            <span style={{fontFamily:"var(--sans)",fontSize:9,letterSpacing:6,color:"var(--gold2)",fontWeight:700}}>
              LIVE · EVERY 5 MINUTES · FOREVER
            </span>
            <div style={{width:6,height:6,borderRadius:"50%",background:"var(--gold2)",
              boxShadow:"0 0 10px var(--gold-glow)",animation:"blink 2s ease infinite 1s"}}/>
          </div>

          {/* Main headline — Cormorant for editorial luxury */}
          <h1 style={{
            fontFamily:"var(--serif)",
            fontSize:isMobile?"clamp(52px,16vw,80px)":"clamp(72px,9vw,128px)",
            fontWeight:300,lineHeight:0.92,
            fontStyle:"italic",
            letterSpacing:isMobile?1:2,
            marginBottom:isMobile?16:20,
            animation:"fade-rise 0.9s ease both",
          }}>
            <span style={{
              display:"block",
              background:"linear-gradient(160deg,var(--gold4) 0%,var(--gold3) 30%,var(--gold2) 55%,var(--gold) 80%,#8B6010 100%)",
              backgroundSize:"200%",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              animation:"shimmer-text 6s linear infinite",
            }}>
              MAY THE
            </span>
            <span style={{
              display:"block",
              fontWeight:700,fontStyle:"normal",
              fontSize:"1.12em",letterSpacing:isMobile?2:8,
              background:"linear-gradient(135deg,var(--gold4),var(--gold3),var(--gold2),var(--gold4))",
              backgroundSize:"300%",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              animation:"shimmer-text 4s linear infinite",
              textShadow:"none",
            }}>
              $WINDFALL
            </span>
            <span style={{
              display:"block",
              background:"linear-gradient(160deg,var(--gold4) 0%,var(--gold3) 50%,var(--gold) 100%)",
              backgroundSize:"200%",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              animation:"shimmer-text 6s linear infinite 1s",
            }}>
              ON YOU
            </span>
          </h1>

          <p style={{
            fontFamily:"var(--serif)",fontSize:isMobile?16:20,fontWeight:300,
            color:"var(--cream2)",lineHeight:1.8,
            maxWidth:500,margin:"0 auto 44px",
            fontStyle:"italic",
            animation:"fade-rise 1s ease 0.3s both",
          }}>
            Every 5 minutes, one random holder receives all accumulated creator fees.
            288 chances a day. No staking. No tiers. Just hold.
          </p>

          <div style={{
            display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",
            animation:"fade-rise 1s ease 0.5s both",
          }}>
            <button onClick={()=>window.open(PUMP_URL,"_blank")} className="btn-gold btn-lg" style={{fontSize:11,padding:isMobile?"13px 28px":"14px 40px"}}>
              BUY $WINDFALL ↗
            </button>
            <button onClick={()=>navigate("draw")} className="btn-outline" style={{fontSize:11,padding:isMobile?"12px 24px":"13px 36px"}}>
              WATCH LIVE DRAW →
            </button>
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div style={{
          display:"grid",
          gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",
          gap:10,marginBottom:20,
          animation:"fade-rise 0.8s ease 0.2s both",
        }}>
          {[
            {label:"CURRENT POT",   value:potSOL!=null?`◎ ${fmtSOL(potSOL)}`:"—",  accent:true},
            {label:"TOKEN PRICE",   value:price!=null?fmtUSD(price):"—"},
            {label:"HOLDERS",       value:holders!=null?holders.toLocaleString():"—"},
            {label:"TOTAL PAID",    value:stats?.totalDistributed?`◎ ${fmtSOL(stats.totalDistributed)}`:"◎ 0"},
            {label:"BIGGEST WIN",   value:stats?.biggestWin?`◎ ${fmtSOL(stats.biggestWin)}`:"—"},
          ].map((s,i)=>(
            <div key={s.label} className="card" style={{
              padding:isMobile?"14px 12px":"18px 16px",
              background:s.accent?"rgba(201,146,42,0.08)":"rgba(10,20,40,0.6)",
              border:`1px solid ${s.accent?"var(--border3)":"var(--border)"}`,
              animation:s.accent?"glow-pulse 4s ease-in-out infinite":"none",
              animationDelay:`${i*0.3}s`,
              transition:"transform 0.2s",
              cursor:"default",
            }}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}
            >
              {s.accent&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,
                background:"linear-gradient(90deg,transparent,var(--gold2),var(--gold3),var(--gold2),transparent)"}}/>}
              <div style={{fontFamily:"var(--sans)",fontSize:8,letterSpacing:3.5,
                color:s.accent?"var(--gold2)":"var(--muted)",marginBottom:10,fontWeight:700}}>{s.label}</div>
              <div style={{fontFamily:"var(--mono)",fontSize:isMobile?15:18,
                color:s.accent?"var(--gold3)":"var(--cream)",fontWeight:500}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── MAIN GRID ── */}
        <div style={{
          display:"grid",
          gridTemplateColumns:isMobile?"1fr":"1fr 1fr",
          gap:16,marginBottom:16,
        }}>

          {/* Countdown */}
          <div className="card ornate" style={{
            padding:isMobile?"32px 20px":"44px 32px",
            display:"flex",flexDirection:"column",alignItems:"center",gap:28,
            animation:"glow-pulse 5s ease-in-out infinite",
          }}>
            <div style={{fontFamily:"var(--sans)",fontSize:8,letterSpacing:6,color:"var(--muted)",fontWeight:700}}>
              NEXT WINDFALL IN
            </div>

            <CountdownRing countdown={countdown}/>

            {/* Pot display inside card */}
            <div style={{
              width:"100%",padding:"16px 20px",
              background:"rgba(201,146,42,0.06)",
              border:"1px solid var(--border2)",
              borderRadius:3,textAlign:"center",
            }}>
              <div style={{fontFamily:"var(--sans)",fontSize:8,letterSpacing:4,color:"var(--muted)",marginBottom:8,fontWeight:700}}>POT AT STAKE</div>
              <div style={{
                fontFamily:"var(--serif)",fontSize:isMobile?28:36,fontWeight:700,
                fontStyle:"italic",color:"var(--gold2)",lineHeight:1,
                textShadow:"0 0 24px rgba(201,146,42,0.3)",
              }}>◎ {potSOL!=null?fmtSOL(potSOL):"—"}</div>
              {price&&potSOL&&(
                <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)",marginTop:6}}>
                  ≈ {fmtUSD(potSOL*3)} in total value
                </div>
              )}
            </div>

            <p style={{
              fontFamily:"var(--serif)",fontSize:13,fontStyle:"italic",
              color:"var(--muted)",textAlign:"center",lineHeight:1.9,
            }}>
              One random holder wins everything.<br/>
              288 draws per day. Around the clock.
            </p>
          </div>

          {/* Winners feed */}
          <div className="card" style={{
            padding:isMobile?"24px 18px":"32px 26px",
            display:"flex",flexDirection:"column",minHeight:400,
          }}>
            <div style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,
            }}>
              <div style={{fontFamily:"var(--sans)",fontSize:8,letterSpacing:5,color:"var(--muted)",fontWeight:700}}>RECENT WINDFALLS</div>
              {winners.length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"var(--gold2)",
                    boxShadow:"0 0 6px var(--gold-glow)",animation:"blink 1.5s ease infinite"}}/>
                  <span style={{fontFamily:"var(--sans)",fontSize:8,letterSpacing:3,color:"var(--gold2)",fontWeight:700}}>LIVE</span>
                </div>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:1}}>
              {winners.length===0?(
                <div style={{flex:1,display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",gap:16,
                  color:"var(--dim)",textAlign:"center"}}>
                  <div style={{fontSize:48,opacity:0.2}}>🌬️</div>
                  <div style={{fontFamily:"var(--serif)",fontSize:16,fontStyle:"italic",color:"var(--muted)"}}>
                    First windfall incoming…
                  </div>
                </div>
              ):winners.map((w,i)=>(
                <div key={w.id} style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"12px 10px",
                  borderBottom:"1px solid rgba(201,146,42,0.07)",
                  borderTop:i===0?"1px solid var(--border2)":"none",
                  borderRadius:4,margin:"1px 0",
                  background:i===0?"rgba(201,146,42,0.05)":"transparent",
                  animation:i===0?"slide-in-winner 0.35s ease":"none",
                  transition:"background 0.2s",
                  cursor:"default",
                }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(201,146,42,0.04)"}
                  onMouseLeave={e=>e.currentTarget.style.background=i===0?"rgba(201,146,42,0.05)":"transparent"}
                >
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{
                      width:30,height:30,borderRadius:4,flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      background:i===0?"rgba(201,146,42,0.15)":"rgba(255,255,255,0.04)",
                      border:`1px solid ${i===0?"var(--border2)":"var(--border)"}`,
                      fontFamily:"var(--mono)",fontSize:10,
                      color:i===0?"var(--gold2)":"var(--dim)",
                    }}>{i+1}</div>
                    <div>
                      <a href={`https://solscan.io/account/${w.winner}`} target="_blank" rel="noreferrer"
                        style={{fontFamily:"var(--mono)",fontSize:12,
                          color:i===0?"var(--cream)":"var(--muted)",
                          transition:"color 0.2s"}}
                        onMouseEnter={e=>e.currentTarget.style.color="var(--gold2)"}
                        onMouseLeave={e=>e.currentTarget.style.color=i===0?"var(--cream)":"var(--muted)"}
                      >{short(w.winner)}</a>
                      <div style={{fontFamily:"var(--sans)",fontSize:10,color:"var(--dim)",marginTop:2}}>
                        {w.timestamp?timeAgo(w.timestamp.toMillis()):""}
                        {w.holderCount?` · ${w.holderCount.toLocaleString()} holders`:""}
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:500,
                      color:i===0?"var(--gold2)":"var(--muted)"}}>
                      +◎ {fmtSOL(w.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {winners[0]&&(
              <div style={{
                marginTop:20,padding:"14px 18px",
                background:"linear-gradient(135deg,rgba(201,146,42,0.1),rgba(201,146,42,0.03))",
                borderRadius:4,border:"1px solid var(--border2)",
                display:"flex",alignItems:"center",gap:14,
              }}>
                <span style={{fontSize:22}}>🏆</span>
                <div>
                  <div style={{fontFamily:"var(--sans)",fontSize:8,color:"var(--muted)",letterSpacing:4,marginBottom:5,fontWeight:700}}>LAST WINNER</div>
                  <div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--gold2)"}}>
                    {short(winners[0].winner)} · ◎ {fmtSOL(winners[0].amount)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── LIVE DRAW CTA ── */}
        <div style={{
          padding:isMobile?"28px 20px":"36px 40px",
          background:"linear-gradient(135deg,rgba(201,146,42,0.08),rgba(10,20,40,0.8),rgba(201,146,42,0.04))",
          border:"1px solid var(--border2)",borderRadius:4,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          gap:20,flexWrap:"wrap",marginBottom:16,
          position:"relative",overflow:"hidden",
        }}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:1,
            background:"linear-gradient(90deg,transparent,var(--gold2),transparent)"}}/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
            background:"linear-gradient(90deg,transparent,var(--gold),transparent)"}}/>
          <div>
            <div style={{fontFamily:"var(--sans)",fontSize:9,letterSpacing:5,color:"var(--gold2)",marginBottom:8,fontWeight:700}}>TRANSPARENCY</div>
            <div style={{fontFamily:"var(--serif)",fontSize:isMobile?18:24,fontStyle:"italic",color:"var(--cream)",marginBottom:6}}>
              Watch the Draw Happen in Real Time
            </div>
            <div style={{fontFamily:"var(--sans)",fontSize:12,color:"var(--muted)",lineHeight:1.7}}>
              See every holder in the pool. Watch the random selection unfold live.<br/>
              Provably fair. Completely transparent.
            </div>
          </div>
          <button onClick={()=>navigate("draw")} className="btn-gold" style={{flexShrink:0}}>
            ENTER THE DRAW ROOM →
          </button>
        </div>

        {/* ── CONTRACT ADDRESS ── */}
        <div className="card" style={{
          padding:isMobile?"18px 16px":"22px 28px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          gap:16,flexWrap:"wrap",marginBottom:16,
        }}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"var(--sans)",fontSize:8,letterSpacing:4,color:"var(--muted)",marginBottom:8,fontWeight:700}}>CONTRACT ADDRESS</div>
            <div style={{fontFamily:"var(--mono)",fontSize:isMobile?10:12,color:"var(--cream2)",wordBreak:"break-all",lineHeight:1.6}}>
              {TOKEN_CA}
            </div>
          </div>
          <button onClick={copyCA} className={copiedCA?"btn-gold":"btn-outline"} style={{flexShrink:0}}>
            {copiedCA?"COPIED ✓":"COPY CA"}
          </button>
        </div>

        <Divider label="HOW IT WORKS"/>

        {/* ── HOW IT WORKS ── */}
        <div style={{
          display:"grid",
          gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",
          gap:14,marginBottom:14,
        }}>
          {[
            {n:"I",  icon:"🌊", title:"Just Hold",
              body:"Buy $WINDFALL and hold. That's the full requirement. No locking, no staking, no tiers. Every holder is automatically eligible."},
            {n:"II", icon:"🎲", title:"Every 5 Minutes",
              body:"The engine runs 288 times per day. Each time it scans all current holders and selects one at complete random."},
            {n:"III",icon:"💨", title:"Fortune Finds You",
              body:"All accumulated creator fees land directly in the winner's wallet. Then the clock resets. This runs on-chain, forever."},
          ].map((s,i)=>(
            <div key={s.n} className="card" style={{
              padding:isMobile?"24px 18px":"32px 24px",
              transition:"transform 0.2s, border-color 0.2s, box-shadow 0.2s",
            }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.boxShadow="0 12px 40px rgba(201,146,42,0.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.boxShadow="none";}}
            >
              <div style={{
                fontFamily:"var(--serif)",fontSize:56,fontWeight:300,
                fontStyle:"italic",color:"rgba(201,146,42,0.1)",lineHeight:1,marginBottom:10,
              }}>{s.n}</div>
              <div style={{fontSize:28,marginBottom:14}}>{s.icon}</div>
              <div style={{fontFamily:"var(--sans)",fontSize:13,fontWeight:700,
                letterSpacing:1,marginBottom:12,color:"var(--cream)"}}>{s.title}</div>
              <div style={{fontFamily:"var(--serif)",fontSize:14,fontStyle:"italic",
                color:"var(--muted)",lineHeight:1.8}}>{s.body}</div>
            </div>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <Divider/>
        <div style={{textAlign:"center",paddingBottom:20}}>
          <div style={{
            fontFamily:"var(--serif)",fontSize:isMobile?22:30,fontStyle:"italic",fontWeight:300,
            marginBottom:8,letterSpacing:2,
          }}>
            <span className="gold-text">May the $WINDFALL on you 🌬️</span>
          </div>
          <div style={{fontFamily:"var(--sans)",fontSize:9,letterSpacing:5,color:"var(--dim)",marginBottom:24,fontWeight:600}}>
            288 ROUNDS · EVERY DAY · ON SOLANA
          </div>
          <div style={{display:"flex",gap:32,justifyContent:"center",alignItems:"center",flexWrap:"wrap"}}>
            {[[X_URL,"𝕏 Twitter"],[PUMP_URL,"Buy $WINDFALL"]].map(([href,label])=>(
              <a key={label} href={href} target="_blank" rel="noreferrer"
                style={{fontFamily:"var(--sans)",fontSize:12,color:"var(--muted)",
                  letterSpacing:1,transition:"color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.color="var(--gold2)"}
                onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
              >{label}</a>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
