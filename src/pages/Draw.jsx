import { useState, useEffect, useRef, useCallback } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

const TOKEN_CA   = "13SVgpzFcZf8vF6Tg1QV7vec82FdJrf4Kg2VEX4xpump";
const ST_API_KEY = import.meta.env.VITE_TRACKER_CODE;
const DIST_MS    = 5 * 60 * 1000;

const short  = (a) => a ? `${a.slice(0,4)}...${a.slice(-4)}` : "—";
const fmtSOL = (n) => n == null ? "—" : n < 0.0001 ? "<0.0001" : n.toFixed(4);
const timeAgo = (ms) => {
  const s = Math.floor((Date.now()-ms)/1000);
  if (s < 60) return `${s}s ago`;
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

// ── Confetti burst ────────────────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  const pieces = Array.from({length:80},(_,i)=>({
    id:i,
    x: 30+Math.random()*40,
    delay: Math.random()*0.6,
    dur: 1.8+Math.random()*1.4,
    color:["#C9922A","#F5CE6E","#FDE9A8","#E0AF45","#fff","#C9922A","#F5CE6E"][i%7],
    size: 3+Math.random()*8,
    rot: Math.random()*360,
    drift: (Math.random()-0.5)*200,
  }));

  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
      {pieces.map(p=>(
        <div key={p.id} style={{
          position:"absolute",
          left:`${p.x}%`,top:"-20px",
          width:p.size,height:p.size,
          background:p.color,
          borderRadius:p.id%4===0?"50%":2,
          transform:`rotate(${p.rot}deg)`,
          animation:`confetti-drop ${p.dur}s ease-in ${p.delay}s forwards`,
        }}/>
      ))}
      <style>{`
        @keyframes confetti-drop {
          0%   { transform:translateY(0) translateX(0) rotate(0deg); opacity:1; }
          100% { transform:translateY(110vh) translateX(${Math.random()*100-50}px) rotate(720deg); opacity:0; }
        }
      `}</style>
    </div>
  );
}

// ── Single holder chip ────────────────────────────────────────────────────
function HolderChip({ wallet, isHighlighted, isWinner, isEliminated, rank, animDelay }) {
  const ref = useRef(null);

  useEffect(()=>{
    if (isWinner && ref.current) {
      ref.current.scrollIntoView({ behavior:"smooth", block:"center" });
    }
  },[isWinner]);

  return (
    <div ref={ref} style={{
      padding:"8px 12px",
      borderRadius:4,
      border:`1px solid ${isWinner?"var(--gold3)":isHighlighted?"var(--border3)":isEliminated?"rgba(255,255,255,0.03)":"var(--border)"}`,
      background: isWinner
        ? "linear-gradient(135deg,rgba(201,146,42,0.3),rgba(201,146,42,0.12))"
        : isHighlighted
          ? "rgba(201,146,42,0.12)"
          : isEliminated
            ? "rgba(4,8,15,0.2)"
            : "rgba(10,20,40,0.5)",
      display:"flex",alignItems:"center",gap:8,
      transition:"all 0.15s ease",
      transform:isWinner?"scale(1.04)":isHighlighted?"scale(1.01)":"scale(1)",
      boxShadow:isWinner
        ?"0 0 30px rgba(201,146,42,0.5), 0 0 60px rgba(201,146,42,0.2), inset 0 1px 0 rgba(255,255,255,0.1)"
        :isHighlighted
          ?"0 0 12px rgba(201,146,42,0.3)"
          :"none",
      opacity:isEliminated?0.25:1,
      animation:isWinner?"winner-explode 0.6s ease":"none",
      animationDelay:`${animDelay||0}s`,
      position:"relative",overflow:"hidden",
    }}>
      {isWinner&&<div style={{
        position:"absolute",inset:0,
        background:"linear-gradient(90deg,transparent,rgba(201,146,42,0.15),transparent)",
        animation:"shimmer-text 1.5s linear infinite",
      }}/>}

      <div style={{
        width:7,height:7,borderRadius:"50%",flexShrink:0,
        background:isWinner?"var(--gold3)":isHighlighted?"var(--gold2)":isEliminated?"rgba(255,255,255,0.1)":"rgba(201,146,42,0.3)",
        boxShadow:isWinner?"0 0 10px var(--gold-glow)":isHighlighted?"0 0 6px rgba(201,146,42,0.4)":"none",
        transition:"all 0.15s",
      }}/>

      <span style={{
        fontFamily:"var(--mono)",
        fontSize:11,
        color:isWinner?"var(--gold3)":isHighlighted?"var(--gold2)":isEliminated?"var(--dim)":"var(--muted)",
        transition:"color 0.15s",
        flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
      }}>{short(wallet)}</span>

      {rank&&!isWinner&&(
        <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--dim)"}}>#{rank}</span>
      )}

      {isWinner&&(
        <span style={{fontFamily:"var(--body)",fontSize:9,fontWeight:700,letterSpacing:2,color:"var(--gold3)"}}>WIN</span>
      )}
    </div>
  );
}

// ── Draw status banner ────────────────────────────────────────────────────
function StatusBanner({ phase, winner, amount, countdown }) {
  const mins = Math.floor(countdown/60000);
  const secs = Math.floor((countdown%60000)/1000);
  const cdStr = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;

  const configs = {
    idle:     { color:"var(--muted)",    bg:"rgba(10,20,40,0.6)",  border:"var(--border)",  text:"WAITING FOR NEXT DRAW", sub:`Next draw in ${cdStr}` },
    loading:  { color:"var(--gold2)",   bg:"rgba(201,146,42,0.06)", border:"var(--border2)", text:"LOADING HOLDER POOL", sub:"Fetching all eligible wallets..." },
    spinning: { color:"var(--gold2)",   bg:"rgba(201,146,42,0.08)", border:"var(--border3)", text:"SELECTING WINNER", sub:"Random selection in progress..." },
    winner:   { color:"var(--gold3)",   bg:"rgba(201,146,42,0.15)", border:"var(--gold3)",   text:"WINDFALL DISTRIBUTED", sub:winner?`${short(winner)} won ◎${fmtSOL(amount)}`:"" },
  };
  const c = configs[phase] || configs.idle;

  return (
    <div style={{
      padding:"16px 28px",
      background:c.bg,border:`1px solid ${c.border}`,borderRadius:4,
      display:"flex",alignItems:"center",justifyContent:"space-between",
      gap:16,flexWrap:"wrap",
      transition:"all 0.4s ease",
      position:"relative",overflow:"hidden",
    }}>
      {phase==="spinning"&&<div style={{
        position:"absolute",inset:0,
        background:"linear-gradient(90deg,transparent,rgba(201,146,42,0.06),transparent)",
        animation:"shimmer-text 1s linear infinite",
        backgroundSize:"200%",
      }}/>}
      {phase==="winner"&&<div style={{
        position:"absolute",top:0,left:0,right:0,height:2,
        background:"linear-gradient(90deg,transparent,var(--gold3),transparent)",
      }}/>}

      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{
          width:8,height:8,borderRadius:"50%",background:c.color,
          boxShadow:`0 0 8px ${c.color}`,
          animation:phase==="spinning"?"blink 0.3s ease infinite":phase==="idle"?"blink 2s ease infinite":"none",
          flexShrink:0,
        }}/>
        <div>
          <div style={{fontFamily:"var(--body)",fontSize:10,letterSpacing:4,color:c.color,fontWeight:700}}>{c.text}</div>
          <div style={{fontFamily:"var(--display)",fontSize:13,color:"var(--muted)",marginTop:3}}>{c.sub}</div>
        </div>
      </div>

      {phase==="winner"&&winner&&(
        <a href={`https://solscan.io/account/${winner}`} target="_blank" rel="noreferrer"
          style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:3,color:"var(--gold2)",
            border:"1px solid var(--border2)",borderRadius:2,padding:"6px 14px",
            transition:"all 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor="var(--gold2)"}
          onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border2)"}
        >VIEW ON SOLSCAN →</a>
      )}
    </div>
  );
}

// ── Main Draw ─────────────────────────────────────────────────────────────
export default function Draw({ navigate }) {
  const w        = useWindowWidth();
  const isMobile = w < 768;

  const [holders,     setHolders]     = useState([]);
  const [stats,       setStats]       = useState(null);
  const [recentWins,  setRecentWins]  = useState([]);
  const [countdown,   setCountdown]   = useState(DIST_MS);
  const [phase,       setPhase]       = useState("idle"); // idle|loading|spinning|winner
  const [highlighted, setHighlighted] = useState(null);  // wallet being spotlighted
  const [winner,      setWinner]      = useState(null);
  const [winAmount,   setWinAmount]   = useState(null);
  const [confetti,    setConfetti]    = useState(false);
  const [loadingHolders, setLoadingHolders] = useState(false);

  const nextRef      = useRef(null);
  const prevWinnerRef = useRef(null);
  const spinRef      = useRef(null);
  const holdersRef   = useRef([]);

  // Keep holders ref in sync
  useEffect(()=>{ holdersRef.current = holders; },[holders]);

  // Fetch holders from SolanaTracker
  const fetchHolders = useCallback(async()=>{
    setLoadingHolders(true);
    try {
      const res  = await fetch(`https://data.solanatracker.io/tokens/${TOKEN_CA}/holders?page=1&limit=100`,{
        headers:{"x-api-key":ST_API_KEY},
      });
      const raw  = await res.json();
      const list = raw.holders??raw.accounts??raw.items??(Array.isArray(raw)?raw:[]);
      if (list?.length>0) {
        const mapped = list.map((h,i)=>({
          wallet:   h.address||h.owner||h.wallet||h.pubkey||"",
          pct:      h.percentage??0,
          rank:     i+1,
        })).filter(h=>h.wallet&&h.wallet.length>20).slice(0,80); // cap at 80 for display
        setHolders(mapped);
      }
    } catch {}
    setLoadingHolders(false);
  },[]);

  // Firestore — stats & countdown
  useEffect(()=>{
    return onSnapshot(doc(db,"windfall_stats","global"),snap=>{
      if (!snap.exists()) return;
      const d = snap.data();
      setStats(d);
      if (d.lastDistribution) {
        const next = d.lastDistribution.toMillis()+DIST_MS;
        nextRef.current = next;
        setCountdown(Math.max(next-Date.now(),0));
      }

      // Detect new winner
      if (d.lastWinner && d.lastWinner !== prevWinnerRef.current) {
        const isFirstLoad = prevWinnerRef.current === null;
        prevWinnerRef.current = d.lastWinner;
        if (!isFirstLoad) {
          triggerDraw(d.lastWinner, d.lastAmount);
        }
      }
      if (prevWinnerRef.current === null && d.lastWinner) {
        prevWinnerRef.current = d.lastWinner;
      }
    });
  },[]);

  // Recent wins
  useEffect(()=>{
    const q = query(collection(db,"windfall_distributions"),orderBy("timestamp","desc"),limit(8));
    return onSnapshot(q,snap=>setRecentWins(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[]);

  // Countdown tick
  useEffect(()=>{
    const id = setInterval(()=>{
      if (nextRef.current) {
        const rem = nextRef.current-Date.now();
        setCountdown(rem>0?rem:0);
      }
    },1000);
    return ()=>clearInterval(id);
  },[]);

  // Initial holder load
  useEffect(()=>{ fetchHolders(); },[fetchHolders]);

  // ── DRAW ANIMATION ────────────────────────────────────────────────────
  const triggerDraw = useCallback((winnerWallet, amount) => {
    const pool = holdersRef.current;
    if (pool.length===0) {
      setWinner(winnerWallet);
      setWinAmount(amount);
      setPhase("winner");
      setConfetti(true);
      setTimeout(()=>setConfetti(false),5000);
      return;
    }

    setPhase("spinning");
    setWinner(null);
    setHighlighted(null);

    // Build spin sequence: rapid → slow → land on winner
    let step    = 0;
    let delay   = 60;  // start fast (ms per step)
    const TOTAL = 42;  // total spotlight steps before reveal

    const allWallets = pool.map(h=>h.wallet);

    const spin = () => {
      if (step < TOTAL) {
        // Pick a random wallet to spotlight (not the winner yet)
        const candidates = allWallets.filter(w=>w!==winnerWallet);
        const pick = candidates.length>0
          ? candidates[Math.floor(Math.random()*candidates.length)]
          : allWallets[Math.floor(Math.random()*allWallets.length)];
        setHighlighted(pick);

        step++;
        // Exponential slowdown in last third
        if (step > TOTAL*0.65) delay = Math.min(delay*1.22, 600);

        spinRef.current = setTimeout(spin, delay);
      } else {
        // REVEAL
        setHighlighted(winnerWallet);
        setWinner(winnerWallet);
        setWinAmount(amount);
        setPhase("winner");
        setConfetti(true);
        setTimeout(()=>setConfetti(false), 6000);
        // Reset to idle after 12 seconds
        setTimeout(()=>{
          setPhase("idle");
          setHighlighted(null);
          setWinner(null);
          fetchHolders(); // refresh holders for next round
        }, 12000);
      }
    };

    spinRef.current = setTimeout(spin, delay);
    return ()=>clearTimeout(spinRef.current);
  },[fetchHolders]);

  // Cleanup spin on unmount
  useEffect(()=>()=>{ if (spinRef.current) clearTimeout(spinRef.current); },[]);

  const mins = Math.floor(countdown/60000);
  const secs = Math.floor((countdown%60000)/1000);
  const cdStr = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;

  return (
    <div style={{minHeight:"100vh",position:"relative",zIndex:1,background:"var(--ink)"}}>
      <Confetti active={confetti}/>

      {/* ── HEADER ── */}
      <header style={{
        position:"fixed",top:0,left:0,right:0,zIndex:300,
        height:64,display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 28px",
        background:"rgba(13,63,130,0.92)",
        borderBottom:"1px solid var(--border)",
        backdropFilter:"blur(20px)",
      }}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,
          background:"linear-gradient(90deg,transparent,var(--gold),var(--gold2),var(--gold),transparent)",opacity:0.6}}/>

        <button onClick={()=>navigate("home")} style={{
          background:"none",border:"none",cursor:"pointer",
          display:"flex",alignItems:"center",gap:10,
        }}>
          <div style={{width:32,height:32,borderRadius:5,overflow:"hidden",border:"1px solid var(--border2)"}}>
            <img src="/logo.png" alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
          <span style={{fontFamily:"var(--body)",fontSize:14,fontWeight:900,letterSpacing:3,
            background:"linear-gradient(135deg,var(--gold3),var(--gold2))",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>$WINDFALL</span>
        </button>

        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--gold2)",
            display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"var(--gold2)",
              boxShadow:"0 0 8px var(--gold-glow)",animation:"blink 1.5s ease infinite"}}/>
            DRAW IN {cdStr}
          </div>
          <button onClick={()=>navigate("home")} className="btn-outline" style={{fontSize:9,padding:"7px 16px"}}>
            ← BACK
          </button>
        </div>
      </header>

      <main style={{maxWidth:"var(--max-w)",margin:"0 auto",padding:isMobile?"80px 14px 60px":"90px 28px 80px"}}>

        {/* Page title */}
        <div style={{marginBottom:24,paddingTop:16}}>
          <div style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:6,color:"var(--gold2)",marginBottom:8,fontWeight:700}}>
            LIVE TRANSPARENCY
          </div>
          <h1 style={{
            fontFamily:"var(--display)",fontSize:isMobile?"clamp(32px,10vw,48px)":"clamp(40px,5vw,60px)",
            fontWeight:300,color:"var(--cream)",lineHeight:1.1,marginBottom:8,
          }}>The Draw Room</h1>
          <p style={{fontFamily:"var(--display)",fontSize:14,color:"var(--muted)",lineHeight:1.7}}>
            Every holder in the pool. Every draw visible. Completely on-chain. Nothing hidden.
          </p>
        </div>

        {/* Status banner */}
        <div style={{marginBottom:20}}>
          <StatusBanner phase={phase} winner={winner} amount={winAmount} countdown={countdown}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:16,alignItems:"start"}}>

          {/* ── LEFT — HOLDER POOL ── */}
          <div>
            {/* Pool header */}
            <div className="card" style={{padding:"14px 20px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:4,color:"var(--muted)",fontWeight:700}}>
                    ELIGIBLE HOLDER POOL
                  </div>
                  <div style={{
                    padding:"3px 10px",borderRadius:20,
                    background:"rgba(201,146,42,0.1)",border:"1px solid var(--border2)",
                    fontFamily:"var(--mono)",fontSize:10,color:"var(--gold2)",
                  }}>{holders.length} wallets</div>
                </div>
                <button onClick={fetchHolders} disabled={loadingHolders} style={{
                  background:"none",border:"1px solid var(--border)",borderRadius:3,
                  cursor:loadingHolders?"not-allowed":"pointer",
                  fontFamily:"var(--body)",fontSize:9,letterSpacing:2,
                  color:"var(--muted)",padding:"5px 12px",transition:"all 0.2s",
                }}
                  onMouseEnter={e=>{if(!loadingHolders)e.currentTarget.style.borderColor="var(--border2)";}}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}
                >{loadingHolders?"LOADING...":"↻ REFRESH"}</button>
              </div>

              {/* Mini description */}
              <p style={{fontFamily:"var(--display)",fontSize:12,color:"var(--dim)",marginTop:10,lineHeight:1.6}}>
                All current $WINDFALL holders shown below. When the 5-minute timer expires, the engine picks one completely at random. You can watch it happen here in real time.
              </p>
            </div>

            {/* Pool grid */}
            {holders.length===0?(
              <div className="card" style={{padding:"60px 24px",textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>🌬️</div>
                <div style={{fontFamily:"var(--display)",fontSize:16,color:"var(--muted)"}}>
                  {loadingHolders?"Loading holder pool...":"No holders found — refresh to try again"}
                </div>
              </div>
            ):(
              <div style={{
                display:"grid",
                gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",
                gap:6,
                maxHeight:isMobile?440:560,overflowY:"auto",
                padding:"2px",
              }}>
                {holders.map((h,i)=>(
                  <HolderChip
                    key={h.wallet}
                    wallet={h.wallet}
                    rank={h.rank||i+1}
                    isHighlighted={highlighted===h.wallet&&phase==="spinning"}
                    isWinner={winner===h.wallet&&phase==="winner"}
                    isEliminated={phase==="winner"&&winner!==h.wallet}
                    animDelay={0}
                  />
                ))}
              </div>
            )}

            {/* Winner callout */}
            {phase==="winner"&&winner&&(
              <div style={{
                marginTop:16,padding:"24px 28px",
                background:"linear-gradient(135deg,rgba(201,146,42,0.2),rgba(201,146,42,0.06))",
                border:"1px solid var(--gold3)",borderRadius:4,
                textAlign:"center",
                animation:"winner-explode 0.6s ease",
                position:"relative",overflow:"hidden",
              }}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:2,
                  background:"linear-gradient(90deg,transparent,var(--gold3),transparent)"}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,
                  background:"linear-gradient(90deg,transparent,var(--gold2),transparent)"}}/>
                <div style={{fontSize:40,marginBottom:8}}>🏆</div>
                <div style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:6,color:"var(--gold2)",marginBottom:12,fontWeight:700}}>
                  WINDFALL DISTRIBUTED
                </div>
                <div style={{fontFamily:"var(--mono)",fontSize:isMobile?14:18,color:"var(--gold3)",marginBottom:8,fontWeight:500}}>
                  {winner}
                </div>
                <div style={{fontFamily:"var(--display)",fontSize:isMobile?24:36,color:"var(--gold2)",fontWeight:700}}>
                  +◎ {fmtSOL(winAmount)}
                </div>
                <a href={`https://solscan.io/account/${winner}`} target="_blank" rel="noreferrer" style={{
                  display:"inline-block",marginTop:16,
                  fontFamily:"var(--body)",fontSize:10,letterSpacing:3,color:"var(--gold2)",
                  border:"1px solid var(--border2)",borderRadius:2,padding:"8px 20px",
                }}>VIEW WALLET ON SOLSCAN →</a>
              </div>
            )}
          </div>

          {/* ── RIGHT — STATS + RECENT WINS ── */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Live stats */}
            <div className="card ornate" style={{padding:"22px 20px"}}>
              <div style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:5,color:"var(--muted)",marginBottom:18,fontWeight:700}}>
                DRAW STATISTICS
              </div>
              {[
                {label:"TOTAL ROUNDS",    value:stats?.totalRounds?.toLocaleString()??"0"},
                {label:"TOTAL PAID OUT",  value:stats?.totalDistributed?`◎ ${fmtSOL(stats.totalDistributed)}`:"◎ 0"},
                {label:"BIGGEST WINDFALL",value:stats?.biggestWin?`◎ ${fmtSOL(stats.biggestWin)}`:"—"},
                {label:"LAST WINNER",     value:stats?.lastWinner?short(stats.lastWinner):"—"},
                {label:"HOLDER POOL",     value:holders.length>0?`${holders.length} wallets`:"—"},
              ].map(s=>(
                <div key={s.label} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 0",borderBottom:"1px solid var(--border)",
                }}>
                  <span style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:2,color:"var(--muted)",fontWeight:600}}>{s.label}</span>
                  <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--cream)"}}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* How the draw works */}
            <div className="card" style={{padding:"22px 20px"}}>
              <div style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:5,color:"var(--muted)",marginBottom:16,fontWeight:700}}>
                HOW SELECTION WORKS
              </div>
              {[
                ["1","All holder wallets fetched from chain"],
                ["2","Wallets over 4% supply excluded"],
                ["3","Recent winners on 3-round cooldown"],
                ["4","One wallet picked at complete random"],
                ["5","Creator fees sent immediately on-chain"],
              ].map(([n,text])=>(
                <div key={n} style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
                  <div style={{
                    width:20,height:20,borderRadius:3,flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    background:"rgba(201,146,42,0.1)",border:"1px solid var(--border2)",
                    fontFamily:"var(--mono)",fontSize:9,color:"var(--gold2)",
                  }}>{n}</div>
                  <div style={{fontFamily:"var(--display)",fontSize:12,color:"var(--muted)",lineHeight:1.6,paddingTop:2}}>
                    {text}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent winners */}
            <div className="card" style={{padding:"22px 20px"}}>
              <div style={{fontFamily:"var(--body)",fontSize:9,letterSpacing:5,color:"var(--muted)",marginBottom:16,fontWeight:700}}>
                RECENT WINDFALLS
              </div>
              {recentWins.length===0?(
                <div style={{fontFamily:"var(--display)",fontSize:13,color:"var(--dim)",textAlign:"center",padding:"20px 0"}}>
                  No draws yet
                </div>
              ):recentWins.map((w,i)=>(
                <div key={w.id} style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 0",borderBottom:"1px solid var(--border)",
                  animation:i===0?"slide-in-winner 0.35s ease":"none",
                }}>
                  <div>
                    <a href={`https://solscan.io/account/${w.winner}`} target="_blank" rel="noreferrer"
                      style={{fontFamily:"var(--mono)",fontSize:11,color:i===0?"var(--gold2)":"var(--muted)",
                        transition:"color 0.2s"}}
                      onMouseEnter={e=>e.currentTarget.style.color="var(--gold2)"}
                      onMouseLeave={e=>e.currentTarget.style.color=i===0?"var(--gold2)":"var(--muted)"}
                    >{short(w.winner)}</a>
                    <div style={{fontFamily:"var(--body)",fontSize:10,color:"var(--dim)",marginTop:2}}>
                      {w.timestamp?timeAgo(w.timestamp.toMillis()):""}
                    </div>
                  </div>
                  <div style={{fontFamily:"var(--mono)",fontSize:12,color:i===0?"var(--gold2)":"var(--muted)",fontWeight:500}}>
                    +◎{fmtSOL(w.amount)}
                  </div>
                </div>
              ))}
            </div>

            {/* Manual trigger for testing */}
            {import.meta.env.DEV&&(
              <button onClick={()=>{
                const pool = holdersRef.current;
                if (pool.length>0) {
                  const fake = pool[Math.floor(Math.random()*pool.length)].wallet;
                  triggerDraw(fake, 0.042);
                }
              }} style={{
                padding:"10px",background:"rgba(255,0,0,0.1)",border:"1px solid rgba(255,0,0,0.3)",
                borderRadius:3,cursor:"pointer",fontFamily:"var(--mono)",fontSize:10,color:"rgba(255,100,100,0.7)",
              }}>
                [DEV] Trigger fake draw
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
