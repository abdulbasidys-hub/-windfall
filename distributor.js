/**
 * $WINDFALL — Distributor v2
 * Fixes: pagination, double-run guard, retries, proper error handling,
 *        biggestWin tracking, creator excluded, currentPotSOL after payout,
 *        Firestore-persisted winner cooldown, address validation
 */

require("dotenv").config();
const { startAutoClaimFees } = require("./claimFees");
const cron  = require("node-cron");
const fetch = require("node-fetch");

const {
  Connection, PublicKey, Transaction, SystemProgram,
  Keypair, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const bs58 = require("bs58");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

// ── CONFIG ─────────────────────────────────────────────────────────────────
const CREATOR_WALLET  = process.env.CREATOR_WALLET;
const TOKEN_CA        = process.env.TOKEN_CA;
const ST_API_KEY      = process.env.SOLANATRACKER_API_KEY;
const SOLANA_RPC      = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const MIN_DIST_SOL    = parseFloat(process.env.MIN_DISTRIBUTE_SOL || "0.005");
const GAS_RESERVE_SOL = parseFloat(process.env.GAS_RESERVE_SOL   || "0.01");
const MAX_HOLDER_PCT  = parseFloat(process.env.MAX_HOLDER_PCT     || "4");
const COOLDOWN_ROUNDS = 3; // winner can't win again for 3 rounds
const MIN_TOKENS      = parseInt(process.env.MIN_TOKENS || "200000"); // min tokens to qualify

// ── VALIDATE ───────────────────────────────────────────────────────────────
["CREATOR_PRIVATE_KEY","FIREBASE_SERVICE_ACCOUNT_JSON","CREATOR_WALLET","TOKEN_CA","SOLANATRACKER_API_KEY"]
  .forEach(k => { if (!process.env[k]) { console.error(`Missing: ${k}`); process.exit(1); } });

// ── SOLANA ─────────────────────────────────────────────────────────────────
const connection = new Connection(SOLANA_RPC, "confirmed");
const creatorKP  = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_PRIVATE_KEY));

if (creatorKP.publicKey.toBase58() !== CREATOR_WALLET) {
  console.error("Key mismatch!"); process.exit(1);
}

// ── FIREBASE ───────────────────────────────────────────────────────────────
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = getFirestore();

// ── HELPERS ────────────────────────────────────────────────────────────────
const log   = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getBalanceLamports() {
  return connection.getBalance(new PublicKey(CREATOR_WALLET));
}

function isValidSolanaAddress(addr) {
  try { new PublicKey(addr); return true; } catch { return false; }
}

// ── FETCH ALL HOLDERS (paginated) ──────────────────────────────────────────
async function fetchAllHolders() {
  const all  = [];
  let   page = 1;
  const MAX_PAGES = 10; // safety cap — up to 1000 holders

  while (page <= MAX_PAGES) {
    try {
      const res = await fetch(
        `https://data.solanatracker.io/tokens/${TOKEN_CA}/holders?page=${page}&limit=100`,
        { headers: { "x-api-key": ST_API_KEY } }
      );
      const raw = await res.json();

      const list = raw.holders ?? raw.accounts ?? raw.items
                ?? raw.wallets ?? raw.data?.holders ?? raw.data?.items
                ?? (Array.isArray(raw) ? raw : null);

      if (!list || list.length === 0) break;

      const mapped = list.map(h => {
        if (typeof h === "string") return { wallet: h, percentage: 0 };
        return {
          wallet:     h.address || h.owner || h.wallet || h.pubkey || null,
          percentage: h.percentage ?? h.pct ?? 0,
          amount:     h.amount ?? h.balance ?? h.tokenAmount ?? h.uiAmount ?? 0,
        };
      }).filter(h => h.wallet && isValidSolanaAddress(h.wallet));

      all.push(...mapped);

      if (mapped.length < 100) break; // last page
      page++;
      await sleep(300); // gentle on the API
    } catch (e) {
      log(`  [holders] Page ${page} error: ${e.message}`);
      break;
    }
  }

  return all;
}

// ── SEND SOL WITH RETRY ────────────────────────────────────────────────────
async function sendSOLWithRetry(to, lamports, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: creatorKP.publicKey,
        toPubkey:   new PublicKey(to),
        lamports,
      }));
      return await sendAndConfirmTransaction(connection, tx, [creatorKP], { commitment:"confirmed" });
    } catch (e) {
      if (i === retries) throw e;
      log(`  [send] Retry ${i+1}/${retries}: ${e.message}`);
      await sleep(3000 * (i + 1));
    }
  }
}

// ── RECENT WINNERS COOLDOWN (Firestore-persisted) ──────────────────────────
async function getRecentWinners() {
  try {
    const snap = await db.doc("windfall_stats/global").get();
    return snap.exists ? (snap.data().recentWinners || []) : [];
  } catch { return []; }
}

async function pushRecentWinner(wallet) {
  try {
    const recent = await getRecentWinners();
    const updated = [wallet, ...recent].slice(0, COOLDOWN_ROUNDS);
    await db.doc("windfall_stats/global").set({ recentWinners: updated }, { merge: true });
  } catch {}
}

// ── UPDATE FIRESTORE ───────────────────────────────────────────────────────
async function logDistribution(winner, amountSOL, txSig, roundNum, holderCount, newBalSOL) {
  const batch = db.batch();

  batch.set(db.collection("windfall_distributions").doc(), {
    winner, amount: amountSOL, txSignature: txSig,
    timestamp: Timestamp.now(), round: roundNum, holderCount,
  });

  const statsUpdate = {
    totalDistributed: FieldValue.increment(amountSOL),
    totalRounds:      FieldValue.increment(1),
    lastDistribution: Timestamp.now(),
    lastWinner: winner, lastAmount: amountSOL, lastTx: txSig,
    lastHolderCount: holderCount,
    currentPotSOL: newBalSOL, // update immediately after payout
  };

  // Track biggest win
  const gs = await db.doc("windfall_stats/global").get();
  if (gs.exists && amountSOL > (gs.data().biggestWin || 0)) {
    statsUpdate.biggestWin = amountSOL;
  }

  batch.set(db.doc("windfall_stats/global"), statsUpdate, { merge: true });
  await batch.commit();
}

async function bumpTimestamp(potSOL) {
  try {
    await db.doc("windfall_stats/global").set({
      lastDistribution: Timestamp.now(),
      currentPotSOL: potSOL, // real balance, never 0 on skip
    }, { merge: true });
  } catch {}
}

// ── MAIN DISTRIBUTE ────────────────────────────────────────────────────────
let isRunning    = false;
let roundCounter = 0;

async function distribute() {
  // Prevent double-run
  if (isRunning) {
    log("⚠️  Previous round still running — skipping.");
    return;
  }
  isRunning = true;

  const thisRound = ++roundCounter;
  log(`\n🌬️  Round ${thisRound} ─────────────────────────────`);

  try {
    // 1. Check balance
    const balLam  = await getBalanceLamports();
    const balSOL  = balLam / LAMPORTS_PER_SOL;
    const gasLam  = Math.ceil(GAS_RESERVE_SOL * LAMPORTS_PER_SOL);
    const sendLam = balLam - gasLam;
    const sendSOL = sendLam / LAMPORTS_PER_SOL;

    log(`   Balance ◎${balSOL.toFixed(6)} | Sendable ◎${sendSOL.toFixed(6)} | Gas reserve ◎${GAS_RESERVE_SOL}`);

    if (sendSOL < MIN_DIST_SOL || sendLam <= 0) {
      log(`   ⏸️  Below minimum ◎${MIN_DIST_SOL} — bumping timer`);
      await bumpTimestamp(balSOL);
      isRunning = false;
      return;
    }

    // 2. Fetch all holders
    log("   Fetching holders (all pages)...");
    await sleep(1500);
    const holders = await fetchAllHolders();

    if (!holders || holders.length === 0) {
      log("   ⚠️  No holders found");
      await bumpTimestamp(balSOL);
      isRunning = false;
      return;
    }
    log(`   Total holders: ${holders.length}`);

    // 3. Filter: exclude creator, whales, recent winners
    const recentWinners = await getRecentWinners();
    const eligible = holders.filter(h => {
      if (h.wallet === CREATOR_WALLET) return false;     // exclude creator
      if (h.percentage > MAX_HOLDER_PCT) return false;   // exclude whales
      if (recentWinners.includes(h.wallet)) return false; // cooldown
      if ((h.amount || 0) < MIN_TOKENS) return false;    // min token holding
      return true;
    });

    log(`   Eligible: ${eligible.length} (excluded: creator, >${MAX_HOLDER_PCT}% holders, <${MIN_TOKENS.toLocaleString()} tokens, last ${COOLDOWN_ROUNDS} winners)`);

    // Fallback to all holders (minus creator) if everyone is filtered
    const pool = eligible.length > 0
      ? eligible
      : holders.filter(h => h.wallet !== CREATOR_WALLET);

    if (pool.length === 0) {
      log("   ⚠️  Empty pool after filtering");
      await bumpTimestamp(balSOL);
      isRunning = false;
      return;
    }

    // 4. Pick random winner
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const winner = picked.wallet;

    log(`   🎲 Winner: ${winner}`);
    log(`   Sending ◎${sendSOL.toFixed(6)}...`);

    // 5. Send with retry
    const txSig = await sendSOLWithRetry(winner, sendLam);
    log(`   ✅ TX: ${txSig}`);
    log(`   🔗 https://solscan.io/tx/${txSig}`);

    // 6. Get new balance after payout
    const newBalLam = await getBalanceLamports().catch(() => gasLam);
    const newBalSOL = newBalLam / LAMPORTS_PER_SOL;

    // 7. Log to Firestore
    await logDistribution(winner, sendSOL, txSig, thisRound, holders.length, newBalSOL);
    await pushRecentWinner(winner);

    log(`   📝 Logged. New pot: ◎${newBalSOL.toFixed(6)}`);

  } catch (err) {
    log(`   ❌ Round ${thisRound} failed: ${err.message || err}`);
    // Don't set currentPotSOL to 0 on error — fetch real balance
    try {
      const bal = await getBalanceLamports();
      await bumpTimestamp(bal / LAMPORTS_PER_SOL);
    } catch {}
  }

  log(`   ─────────────────────────────────────────────`);
  isRunning = false;
}

// ── BOOT ───────────────────────────────────────────────────────────────────
console.log(`
  $WINDFALL Distributor v2
  Wallet : ${CREATOR_WALLET}
  Token  : ${TOKEN_CA}
  Min    : ◎${MIN_DIST_SOL}
  Gas    : ◎${GAS_RESERVE_SOL}
  Filter : >${MAX_HOLDER_PCT}% holders excluded
  Cron   : every 5 minutes
`);

startAutoClaimFees(connection, creatorKP, log);
distribute();
cron.schedule("*/5 * * * *", distribute);

// Live pot updater — writes real balance every 60s so frontend stays current
setInterval(async () => {
  try {
    const bal = await getBalanceLamports();
    const pot = bal / LAMPORTS_PER_SOL;
    await db.doc("windfall_stats/global").set({ currentPotSOL: pot }, { merge: true });
    log(`[pot] ◎${pot.toFixed(6)} written to Firestore`);
  } catch {}
}, 60_000);
