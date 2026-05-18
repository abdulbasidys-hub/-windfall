import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

const TOKEN_CA       = "uxDfdiZbMkNESavsHKb3cKpXSHawWQfS9rspVzbpump";
const ST_API_KEY     = import.meta.env.VITE_TRACKER_CODE;
const X_URL          = "https://x.com/windfallcoin";
const PUMP_URL       = `https://pump.fun/coin/${TOKEN_CA}`;
const DIST_MS        = 5 * 60 * 1000;

const short   = (a) => a ? `${a.slice(0,4)}...${a.slice(-4)}` : "—";
const fmtSOL  = (n) => n == null ? "—" : n < 0.0001 ? "<0.0001" : n.toFixed(4);
const fmtUSD  = (n) => {
  if (n == null) return "—";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1)    return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};
const timeAgo = (ms) => {
  const s = Math.floor((Date.now()-ms)/1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

function useWindowWidth() {
  const [w,setW]=useState(window.innerWidth);
  useEffect(()=>{
    const h=()=>setW(window.innerWidth);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);
  return w;
}

// ── Falling money bills ───────────────────────────────────────────────────
const BILLS = Array.from({length:18},(_,i)=>({
  id:i,
  left:`${(i*5.8+2)%100}%`,
  dur:`${10+(i*2.1%8)}s`,
  delay:`${(i*1.7)%12}s`,
  size: i%5===0?28:i%3===0?22:16,
  rotation: (i%3===0?1:-1) * (15+i%20),
  dx: (i%2===0?40:-40)*(0.5+i%3*0.3),
}));

// ── Ring countdown ────────────────────────────────────────────────────────
const R=100, C=2*Math.PI*R;

function Ring({ countdown }) {
  const m   = Math.floor(countdown/60000);
  const s   = Math.floor((countdown%60000)/1000);
  const str = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  const off = C * (countdown/DIST_MS);
  const hot = countdown < 30000 && countdown > 0;

  return (
    <div style={{position:"relative",width:220,height:220}}>
      <svg width="220" height="220" viewBox="0 0 220 220" style={{transform:"rotate(-90deg)"}}>
        <defs>
          <linearGradient id="wRing" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={hot?"#FF6B35":"rgba(255,255,255,0.3)"}/>
            <stop offset="100%" stopColor={hot?"#FFE000":"rgba(255,255,255,0.9)"}/>
          </linearGradient>
          <filter id="wGlow">
            <feGaussianBlur stdDeviation="5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="110" cy="110" r={R} fill="none"
          stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
        {[0,90,180,270].map(d=>(
          <circle key={d}
            cx={110+R*Math.cos((d-90)*Math.PI/180)}
            cy={110+R*Math.sin((d-90)*Math.PI/180)}
            r="3" fill="rgba(255,255,255,0.25)"/>
        ))}
        <circle cx="110" cy="110" r={R} fill="none"
          stroke="url(#wRing)" strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off}
          filter="url(#wGlow)"
          style={{transition:"stroke-dashoffset 1s linear"}}/>
      </svg>
      <div style={{
        position:"absolute",inset:0,
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      }}>
        <div style={{fontFamily:"var(--display)",fontSize:8,letterSpacing:6,
          color:"rgba(255,255,255,0.5)",marginBottom:6}}>NEXT DRAW</div>
        <div style={{
          fontFamily:"var(--display)",fontSize:60,fontWeight:900,lineHeight:1,
          color:hot?"#FFE000":"var(--white)",
          textShadow:hot
            ?"0 0 30px rgba(255,224,0,0.6)"
            :"0 0 30px rgba(255,255,255,0.4)",
          transition:"color 0.5s, text-shadow 0.5s",
          letterSpacing:-1,
        }}>{str}</div>
        <div style={{fontFamily:"var(--body)",fontSize:8,letterSpacing:5,
          color:"rgba(255,255,255,0.4)",marginTop:6}}>MM : SS</div>
      </div>
    </div>
  );
}

// ── Ticker bar ────────────────────────────────────────────────────────────
function Ticker({ potSOL, totalDistributed, holders, rounds }) {
  const items = [
    `💰 CURRENT POT  ◎ ${fmtSOL(potSOL)}`,
    `🌬️ TOTAL PAID  ◎ ${fmtSOL(totalDistributed)}`,
    `👥 HOLDERS  ${holders?.toLocaleString()??"—"}`,
    `🎲 ROUNDS  ${rounds?.toLocaleString()??"0"}`,
    `⚡ EVERY 5 MINUTES`,
    `💰 CURRENT POT  ◎ ${fmtSOL(potSOL)}`,
    `🌬️ TOTAL PAID  ◎ ${fmtSOL(totalDistributed)}`,
    `👥 HOLDERS  ${holders?.toLocaleString()??"—"}`,
    `🎲 ROUNDS  ${rounds?.toLocaleString()??"0"}`,
    `⚡ EVERY 5 MINUTES`,
  ];
  return (
    <div style={{
      overflow:"hidden",
      borderBottom:"1px solid var(--border)",
      borderTop:"1px solid var(--border)",
      background:"rgba(0,0,0,0.15)",
      padding:"10px 0",
    }}>
      <div style={{display:"flex",gap:56,animation:"ticker 22s linear infinite",
        whiteSpace:"nowrap",width:"max-content"}}>
        {items.map((item,i)=>(
          <span key={i} style={{fontFamily:"var(--mono)",fontSize:10,
            color:"rgba(255,255,255,0.55)",letterSpacing:2}}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
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

  useEffect(()=>{
    const q = query(collection(db,"windfall_distributions"),orderBy("timestamp","desc"),limit(12));
    return onSnapshot(q,snap=>setWinners(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  useEffect(()=>{
    return onSnapshot(doc(db,"windfall_stats","global"),snap=>{
      if (!snap.exists()) return;
      const d = snap.data();
      setStats(d);
      if (d.currentPotSOL!==undefined) setPotSOL(d.currentPotSOL);
      if (d.lastDistribution) {
        const next = d.lastDistribution.toMillis()+DIST_MS;
        nextRef.current = next;
        setCountdown(Math.max(next-Date.now(),0));
      }
    });
  },[]);

  useEffect(()=>{
    const id=setInterval(()=>{
      if (nextRef.current) {
        const r=nextRef.current-Date.now();
        setCountdown(r>0?r:0);
      } else {
        setCountdown(p=>p<=1000?DIST_MS:p-1000);
      }
    },1000);
    return ()=>clearInterval(id);
  },[]);

  const fetchToken = useCallback(async()=>{
    try {
      const res=await fetch(`https://data.solanatracker.io/tokens/${TOKEN_CA}`,{headers:{"x-api-key":ST_API_KEY}});
      const data=await res.json();
      const h=data?.holders??data?.data?.holders??null;
      if (h!=null) setHolders(h);
      const p=data?.price?.usd??data?.price??data?.pools?.[0]?.price?.usd??null;
      if (p!=null&&!isNaN(p)) setPrice(parseFloat(p));
    } catch {}
  },[]);

  useEffect(()=>{
    fetchToken();
    const tokenId = setInterval(fetchToken, 60_000);
    return ()=>clearInterval(tokenId);
  },[fetchToken]);

  const copyCA=()=>{
    navigator.clipboard.writeText(TOKEN_CA);
    setCopiedCA(true);
    setTimeout(()=>setCopiedCA(false),2000);
  };

  const hot = countdown < 30000 && countdown > 0;

  return (
    <div style={{minHeight:"100vh",position:"relative",zIndex:1}}>

      {/* Falling money bills */}
      {BILLS.map(b=>(
        <div key={b.id} style={{
          position:"fixed",left:b.left,top:"-60px",
          fontSize:b.size,lineHeight:1,
          opacity:0,pointerEvents:"none",zIndex:0,
          animation:`bill-fall ${b.dur} linear ${b.delay} infinite`,
          "--r":`${b.rotation}deg`,
          "--dx":`${b.dx}px`,
          filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
        }}>💵</div>
      ))}

      {/* ── HEADER ── */}
      <header style={{
        position:"fixed",top:0,left:0,right:0,zIndex:300,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:isMobile?"0 16px":"0 32px",height:60,
        background:"rgba(13,63,130,0.85)",
        backdropFilter:"blur(20px)",
        borderBottom:"1px solid var(--border)",
      }}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)"}}/>

        <button onClick={()=>navigate("home")} style={{
          background:"none",border:"none",cursor:"pointer",
          display:"flex",alignItems:"center",gap:10,
        }}>
          <div style={{
            width:34,height:34,borderRadius:8,overflow:"hidden",
            border:"1px solid var(--border2)",
            boxShadow:"0 0 12px rgba(255,255,255,0.15)",
          }}>
            <img src="/logo.png" alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
          <span style={{
            fontFamily:"var(--display)",fontSize:20,fontWeight:900,letterSpacing:4,
            color:"var(--white)",
            textShadow:"0 0 20px rgba(255,255,255,0.4)",
          }}>$WINDFALL</span>
        </button>

        {!isMobile&&(
          <nav style={{display:"flex",alignItems:"center",gap:32}}>
            <button onClick={()=>navigate("draw")} style={{
              background:"none",border:"none",cursor:"pointer",
              fontFamily:"var(--display)",fontSize:13,fontWeight:700,
              letterSpacing:3,color:"rgba(255,255,255,0.7)",
              transition:"color 0.2s",
            }}
              onMouseEnter={e=>e.currentTarget.style.color="var(--white)"}
              onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.7)"}
            >LIVE DRAW</button>
            <a href={X_URL} target="_blank" rel="noreferrer" style={{
              fontFamily:"var(--display)",fontSize:18,
              color:"rgba(255,255,255,0.7)",transition:"color 0.2s",
            }}
              onMouseEnter={e=>e.currentTarget.style.color="var(--white)"}
              onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.7)"}
            >𝕏</a>
            <button onClick={()=>window.open(PUMP_URL,"_blank")} className="btn-white" style={{fontSize:11,padding:"9px 22px"}}>
              BUY NOW ↗
            </button>
          </nav>
        )}

        {isMobile&&(
          <button onClick={()=>setMenuOpen(o=>!o)} style={{
            background:"none",border:"1px solid var(--border2)",
            borderRadius:4,cursor:"pointer",color:"var(--white)",
            padding:"6px 12px",fontSize:14,
          }}>{menuOpen?"✕":"☰"}</button>
        )}
      </header>

      {menuOpen&&(
        <div style={{position:"fixed",top:60,left:0,right:0,zIndex:299,
          background:"rgba(13,63,130,0.97)",borderBottom:"1px solid var(--border)",
          padding:"20px 20px 28px",display:"flex",flexDirection:"column",gap:18}}>
          {[["LIVE DRAW",()=>{navigate("draw");setMenuOpen(false);}],
            ["𝕏 TWITTER",()=>{window.open(X_URL);setMenuOpen(false);}],
            ["BUY $WINDFALL",()=>{window.open(PUMP_URL);setMenuOpen(false);}]
          ].map(([l,fn])=>(
            <button key={l} onClick={fn} style={{
              background:"none",border:"none",cursor:"pointer",
              fontFamily:"var(--display)",fontSize:16,fontWeight:700,letterSpacing:3,
              color:"var(--white)",textAlign:"left",padding:"10px 0",
              borderBottom:"1px solid var(--border)",
            }}>{l}</button>
          ))}
        </div>
      )}

      {/* Ticker */}
      <div style={{marginTop:60}}>
        <Ticker potSOL={potSOL} totalDistributed={stats?.totalDistributed}
          holders={holders} rounds={stats?.totalRounds}/>
      </div>

      {/* ── HERO ── */}
      <section style={{
        position:"relative",
        padding:isMobile?"48px 16px 56px":"72px 28px 80px",
        maxWidth:"var(--max-w)",margin:"0 auto",
        textAlign:"center",
        overflow:"hidden",
      }}>
        {/* Sunburst rays — matching the logo */}
        <div style={{
          position:"absolute",top:"-20%",left:"50%",
          transform:"translateX(-50%)",
          width:isMobile?400:800,height:isMobile?300:500,
          background:"radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,255,255,0.12) 0%, transparent 65%)",
          pointerEvents:"none",
          animation:"sunburst 4s ease-in-out infinite",
        }}/>

        {/* Live badge */}
        <div style={{
          display:"inline-flex",alignItems:"center",gap:10,
          padding:"6px 18px",marginBottom:28,
          border:"1px solid var(--border2)",borderRadius:40,
          background:"rgba(255,255,255,0.08)",
        }}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"var(--money)",
            boxShadow:"0 0 10px rgba(126,200,80,0.8)",animation:"blink 1.5s ease infinite"}}/>
          <span style={{fontFamily:"var(--display)",fontSize:11,letterSpacing:5,
            color:"var(--white)",fontWeight:700}}>
            LIVE · 288 DRAWS DAILY · ON SOLANA
          </span>
        </div>

        {/* ── THE HEADLINE — this is the centrepiece ── */}
        <div style={{
          fontFamily:"var(--display)",
          fontSize:isMobile?"clamp(64px,18vw,96px)":"clamp(88px,11vw,140px)",
          fontWeight:900,lineHeight:0.88,
          letterSpacing:-1,
          marginBottom:isMobile?20:28,
          animation:"fade-rise 0.8s ease both",
        }}>
          <div style={{color:"rgba(255,255,255,0.85)"}}>MAY THE</div>
          <div style={{
            background:"linear-gradient(180deg,var(--white) 0%,rgba(255,255,255,0.75) 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            textShadow:"none",
            filter:"drop-shadow(0 0 40px rgba(255,255,255,0.35))",
            fontSize:"1.15em",
            letterSpacing:-2,
          }}>$WINDFALL</div>
          <div style={{color:"rgba(255,255,255,0.85)"}}>ON YOU</div>
        </div>

        <p style={{
          fontFamily:"var(--body)",fontSize:isMobile?15:18,fontWeight:300,
          color:"rgba(255,255,255,0.65)",lineHeight:1.8,
          maxWidth:480,margin:"0 auto 40px",
          animation:"fade-rise 0.9s ease 0.2s both",
        }}>
          Every 5 minutes, one random $WINDFALL holder receives all accumulated creator fees.
          288 chances a day. Just hold.
        </p>

        <div style={{
          display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",
          animation:"fade-rise 0.9s ease 0.35s both",
        }}>
          <button onClick={()=>window.open(PUMP_URL,"_blank")} className="btn-white"
            style={{fontSize:12,padding:isMobile?"12px 28px":"14px 40px"}}>
            BUY $WINDFALL ↗
          </button>
          <button onClick={()=>navigate("draw")} className="btn-outline-white"
            style={{fontSize:12,padding:isMobile?"11px 24px":"13px 36px"}}>
            WATCH LIVE DRAW →
          </button>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{
        maxWidth:"var(--max-w)",margin:"0 auto",
        padding:isMobile?"0 16px 40px":"0 28px 48px",
      }}>
        <div style={{
          display:"grid",
          gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",
          gap:10,
        }}>
          {[
            {label:"CURRENT POT",   value:potSOL!=null?`◎ ${fmtSOL(potSOL)}`:"—",   highlight:true},
            {label:"TOKEN PRICE",   value:price!=null?fmtUSD(price):"—"},
            {label:"HOLDERS",       value:holders!=null?holders.toLocaleString():"—"},
            {label:"TOTAL PAID OUT",value:stats?.totalDistributed?`◎ ${fmtSOL(stats.totalDistributed)}`:"◎ 0"},
            {label:"BIGGEST WIN",   value:stats?.biggestWin?`◎ ${fmtSOL(stats.biggestWin)}`:"—"},
          ].map((s,i)=>(
            <div key={s.label} className="card" style={{
              padding:isMobile?"14px 12px":"18px 16px",
              background:s.highlight?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.06)",
              border:`1px solid ${s.highlight?"var(--border3)":"var(--border)"}`,
              animation:s.highlight?"glow-white 4s ease-in-out infinite":"none",
              animationDelay:`${i*0.3}s`,
              transition:"transform 0.2s",
            }}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}
            >
              {s.highlight&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,
                background:"linear-gradient(90deg,transparent,var(--white),transparent)",opacity:0.5}}/>}
              <div style={{fontFamily:"var(--display)",fontSize:8,letterSpacing:4,
                color:s.highlight?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.5)",
                marginBottom:10,fontWeight:700}}>{s.label}</div>
              <div style={{fontFamily:"var(--mono)",fontSize:isMobile?14:17,
                color:"var(--white)",fontWeight:s.highlight?700:400}}>{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COUNTDOWN + WINNERS ── */}
      <section style={{
        maxWidth:"var(--max-w)",margin:"0 auto",
        padding:isMobile?"0 16px 40px":"0 28px 48px",
      }}>
        <div style={{
          display:"grid",
          gridTemplateColumns:isMobile?"1fr":"1fr 1fr",
          gap:14,
        }}>

          {/* Countdown */}
          <div className="card" style={{
            padding:isMobile?"32px 20px":"44px 32px",
            display:"flex",flexDirection:"column",alignItems:"center",gap:24,
            background:"rgba(255,255,255,0.06)",
            animation:"glow-white 6s ease-in-out infinite",
          }}>
            {/* Corner marks */}
            {[[0,0,"top","left"],[0,0,"top","right"],[0,0,"bottom","left"],[0,0,"bottom","right"]].map((_,i)=>{
              const corners = [
                {top:14,left:14,borderTop:"1px solid",borderLeft:"1px solid"},
                {top:14,right:14,borderTop:"1px solid",borderRight:"1px solid"},
                {bottom:14,left:14,borderBottom:"1px solid",borderLeft:"1px solid"},
                {bottom:14,right:14,borderBottom:"1px solid",borderRight:"1px solid"},
              ];
              return <div key={i} style={{position:"absolute",width:16,height:16,
                borderColor:"rgba(255,255,255,0.2)",...corners[i]}}/>;
            })}

            <div style={{fontFamily:"var(--display)",fontSize:9,letterSpacing:6,
              color:"rgba(255,255,255,0.5)",fontWeight:700}}>NEXT WINDFALL</div>

            <Ring countdown={countdown}/>

            <div style={{
              width:"100%",padding:"16px 20px",
              background:"rgba(255,255,255,0.08)",
              border:"1px solid var(--border2)",
              borderRadius:4,textAlign:"center",
            }}>
              <div style={{fontFamily:"var(--display)",fontSize:8,letterSpacing:5,
                color:"rgba(255,255,255,0.5)",marginBottom:8,fontWeight:700}}>POT AT STAKE</div>
              <div style={{fontFamily:"var(--display)",fontSize:isMobile?32:44,fontWeight:900,
                color:"var(--white)",letterSpacing:-1,lineHeight:1,
                textShadow:"0 0 30px rgba(255,255,255,0.3)"}}>
                ◎ {potSOL!=null?fmtSOL(potSOL):"—"}
              </div>
            </div>

            <p style={{fontFamily:"var(--body)",fontSize:13,fontWeight:300,
              color:"rgba(255,255,255,0.5)",textAlign:"center",lineHeight:1.8}}>
              One holder. All the fees. Every 5 minutes.<br/>
              288 chances a day. Just hold.
            </p>
          </div>

          {/* Winners */}
          <div className="card" style={{
            padding:isMobile?"24px 18px":"32px 26px",
            display:"flex",flexDirection:"column",minHeight:440,
            background:"rgba(0,0,0,0.15)",
          }}>
            <div style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,
            }}>
              <div style={{fontFamily:"var(--display)",fontSize:9,letterSpacing:5,
                color:"rgba(255,255,255,0.5)",fontWeight:700}}>RECENT WINDFALLS</div>
              {winners.length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"var(--money)",
                    boxShadow:"0 0 8px rgba(126,200,80,0.8)",animation:"blink 1.5s ease infinite"}}/>
                  <span style={{fontFamily:"var(--display)",fontSize:9,letterSpacing:4,
                    color:"var(--money)",fontWeight:700}}>LIVE</span>
                </div>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
              {winners.length===0?(
                <div style={{flex:1,display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",gap:14,textAlign:"center"}}>
                  <div style={{fontSize:44,opacity:0.2}}>🌬️</div>
                  <div style={{fontFamily:"var(--display)",fontSize:16,letterSpacing:2,
                    color:"rgba(255,255,255,0.3)"}}>FIRST WINDFALL INCOMING</div>
                </div>
              ):winners.map((w,i)=>(
                <div key={w.id} style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"12px 12px",
                  borderRadius:4,
                  background:i===0?"rgba(255,255,255,0.08)":"transparent",
                  borderBottom:"1px solid rgba(255,255,255,0.06)",
                  animation:i===0?"slide-in 0.35s ease":"none",
                  transition:"background 0.2s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                  onMouseLeave={e=>e.currentTarget.style.background=i===0?"rgba(255,255,255,0.08)":"transparent"}
                >
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{
                      width:28,height:28,borderRadius:4,flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      background:i===0?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)",
                      border:`1px solid ${i===0?"var(--border2)":"var(--border)"}`,
                      fontFamily:"var(--mono)",fontSize:10,
                      color:i===0?"var(--white)":"rgba(255,255,255,0.4)",
                    }}>{i+1}</div>
                    <div>
                      <a href={`https://solscan.io/account/${w.winner}`}
                        target="_blank" rel="noreferrer"
                        style={{fontFamily:"var(--mono)",fontSize:12,
                          color:i===0?"var(--white)":"rgba(255,255,255,0.55)",
                          transition:"color 0.2s",display:"block"}}
                        onMouseEnter={e=>e.currentTarget.style.color="var(--white)"}
                        onMouseLeave={e=>e.currentTarget.style.color=i===0?"var(--white)":"rgba(255,255,255,0.55)"}
                      >{short(w.winner)}</a>
                      <div style={{fontFamily:"var(--body)",fontSize:10,
                        color:"rgba(255,255,255,0.3)",marginTop:2}}>
                        {w.timestamp?timeAgo(w.timestamp.toMillis()):""}
                        {w.holderCount?` · ${w.holderCount.toLocaleString()} holders`:""}
                      </div>
                    </div>
                  </div>
                  <div style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,
                    color:i===0?"var(--money)":"rgba(255,255,255,0.5)"}}>
                    +◎{fmtSOL(w.amount)}
                  </div>
                </div>
              ))}
            </div>

            {winners[0]&&(
              <div style={{
                marginTop:20,padding:"14px 18px",
                background:"rgba(126,200,80,0.08)",
                border:"1px solid rgba(126,200,80,0.25)",
                borderRadius:4,
                display:"flex",alignItems:"center",gap:14,
              }}>
                <span style={{fontSize:22}}>🏆</span>
                <div>
                  <div style={{fontFamily:"var(--display)",fontSize:8,letterSpacing:4,
                    color:"rgba(255,255,255,0.4)",marginBottom:5,fontWeight:700}}>LAST WINNER</div>
                  <div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--money)"}}>
                    {short(winners[0].winner)} · ◎ {fmtSOL(winners[0].amount)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── DRAW CTA ── */}
      <section style={{maxWidth:"var(--max-w)",margin:"0 auto",padding:isMobile?"0 16px 40px":"0 28px 48px"}}>
        <div className="card" style={{
          padding:isMobile?"28px 20px":"40px 48px",
          background:"rgba(255,255,255,0.05)",
          border:"1px solid var(--border2)",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          gap:24,flexWrap:"wrap",
          position:"relative",
        }}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:1,
            background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)"}}/>
          <div>
            <div style={{fontFamily:"var(--display)",fontSize:9,letterSpacing:6,
              color:"rgba(255,255,255,0.5)",marginBottom:12,fontWeight:700}}>FULL TRANSPARENCY</div>
            <div style={{fontFamily:"var(--display)",fontSize:isMobile?24:32,fontWeight:900,
              color:"var(--white)",letterSpacing:-0.5,marginBottom:8}}>
              Watch Every Draw Happen Live
            </div>
            <div style={{fontFamily:"var(--body)",fontSize:13,color:"rgba(255,255,255,0.55)",lineHeight:1.7}}>
              See the full holder pool. Watch the random selection unfold in real time.<br/>
              Completely provable. Nothing hidden.
            </div>
          </div>
          <button onClick={()=>navigate("draw")} className="btn-white" style={{flexShrink:0,fontSize:12}}>
            ENTER DRAW ROOM →
          </button>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{maxWidth:"var(--max-w)",margin:"0 auto",padding:isMobile?"0 16px 40px":"0 28px 48px"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontFamily:"var(--display)",fontSize:9,letterSpacing:8,
            color:"rgba(255,255,255,0.4)",fontWeight:700,marginBottom:12}}>THE MECHANIC</div>
          <div style={{
            fontFamily:"var(--display)",fontSize:isMobile?36:52,fontWeight:900,
            color:"var(--white)",letterSpacing:-1,
          }}>HOW IT WORKS</div>
        </div>

        <div style={{
          display:"grid",
          gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",
          gap:12,
        }}>
          {[
            {n:"01",icon:"💰",title:"JUST HOLD",
              body:"Buy $WINDFALL and hold. No staking, no locking, no tiers. Every holder wallet is automatically in the pool."},
            {n:"02",icon:"🎲",title:"EVERY 5 MINUTES",
              body:"The engine runs 288 times per day. Each cycle it fetches all current holders and picks one at complete random."},
            {n:"03",icon:"🌬️",title:"FORTUNE FINDS YOU",
              body:"All creator fees accumulated go directly to the winner's wallet. Then the clock resets and it runs again. Forever."},
          ].map((s,i)=>(
            <div key={s.n} className="card" style={{
              padding:isMobile?"24px 18px":"32px 26px",
              background:"rgba(255,255,255,0.05)",
              transition:"transform 0.2s, background 0.2s",
            }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.background="rgba(255,255,255,0.09)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.background="rgba(255,255,255,0.05)";}}
            >
              <div style={{
                fontFamily:"var(--display)",fontSize:isMobile?48:64,fontWeight:900,
                color:"rgba(255,255,255,0.07)",lineHeight:1,marginBottom:12,letterSpacing:-2,
              }}>{s.n}</div>
              <div style={{fontSize:32,marginBottom:14}}>{s.icon}</div>
              <div style={{fontFamily:"var(--display)",fontSize:16,fontWeight:700,
                letterSpacing:2,marginBottom:12,color:"var(--white)"}}>{s.title}</div>
              <div style={{fontFamily:"var(--body)",fontSize:13,fontWeight:300,
                color:"rgba(255,255,255,0.55)",lineHeight:1.8}}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CA ── */}
      <section style={{maxWidth:"var(--max-w)",margin:"0 auto",padding:isMobile?"0 16px 40px":"0 28px 48px"}}>
        <div className="card" style={{
          padding:isMobile?"18px 16px":"22px 28px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          gap:16,flexWrap:"wrap",
          background:"rgba(0,0,0,0.2)",
        }}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"var(--display)",fontSize:8,letterSpacing:5,
              color:"rgba(255,255,255,0.4)",marginBottom:8,fontWeight:700}}>CONTRACT ADDRESS</div>
            <div style={{fontFamily:"var(--mono)",fontSize:isMobile?9:11,
              color:"rgba(255,255,255,0.75)",wordBreak:"break-all",lineHeight:1.6}}>
              {TOKEN_CA}
            </div>
          </div>
          <button onClick={copyCA} className={copiedCA?"btn-white":"btn-outline-white"} style={{flexShrink:0,fontSize:11}}>
            {copiedCA?"COPIED ✓":"COPY CA"}
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop:"1px solid var(--border)",
        padding:"32px 28px",
        maxWidth:"var(--max-w)",margin:"0 auto",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        flexWrap:"wrap",gap:16,
      }}>
        <div style={{fontFamily:"var(--display)",fontSize:11,letterSpacing:4,
          color:"rgba(255,255,255,0.3)",fontWeight:700}}>$WINDFALL · ON SOLANA</div>
        {!isMobile&&<div style={{fontFamily:"var(--display)",fontSize:14,fontWeight:700,
          letterSpacing:2,color:"rgba(255,255,255,0.25)"}}>
          MAY THE $WINDFALL ON YOU 🌬️
        </div>}
        <div style={{display:"flex",gap:28,alignItems:"center"}}>
          {[[X_URL,"𝕏"],[PUMP_URL,"BUY"]].map(([href,label])=>(
            <a key={label} href={href} target="_blank" rel="noreferrer"
              style={{fontFamily:"var(--display)",fontSize:label==="𝕏"?18:11,
                letterSpacing:label==="𝕏"?0:3,fontWeight:700,
                color:"rgba(255,255,255,0.35)",transition:"color 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--white)"}
              onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.35)"}
            >{label}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}
