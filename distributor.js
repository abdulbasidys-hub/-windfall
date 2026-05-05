/**
 * $WINDFALL — Distribution Engine
 * ─────────────────────────────────────────────────────────────────────────
 * Run: node distributor.js
 * Env: rename distributor.env → .env  (or set vars in Railway directly)
 */

require("dotenv").config();

const cron  = require("node-cron");
const fetch = require("node-fetch");

const {
  Connection, PublicKey, Transaction,
  SystemProgram, Keypair, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const bs58 = require("bs58");
const { initializeApp, cert }    = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

// ─── CONFIG FROM ENV ───────────────────────────────────────────────────────
const CREATOR_WALLET  = process.env.CREATOR_WALLET;
const TOKEN_CA        = process.env.TOKEN_CA;
const ST_API_KEY      = process.env.SOLANATRACKER_API_KEY;
const SOLANA_RPC      = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const MIN_DIST_SOL    = parseFloat(process.env.MIN_DISTRIBUTE_SOL || "0.01");
const GAS_RESERVE_SOL = parseFloat(process.env.GAS_RESERVE_SOL    || "0.005");

// ─── CHECKS ────────────────────────────────────────────────────────────────
const missing = ["CREATOR_PRIVATE_KEY","FIREBASE_SERVICE_ACCOUNT_JSON","CREATOR_WALLET","TOKEN_CA"]
  .filter(k => !process.env[k]);
if (missing.length) { console.error("❌  Missing env:", missing.join(", ")); process.exit(1); }

// ─── SOLANA ────────────────────────────────────────────────────────────────
const connection = new Connection(SOLANA_RPC, "confirmed");
const creatorKP  = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_PRIVATE_KEY));

if (creatorKP.publicKey.toBase58() !== CREATOR_WALLET) {
  console.error(`❌  Key mismatch!\n   Expected : ${CREATOR_WALLET}\n   Got      : ${creatorKP.publicKey.toBase58()}`);
  process.exit(1);
}

// ─── FIREBASE ADMIN ────────────────────────────────────────────────────────
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = getFirestore();

// ─── HELPERS ───────────────────────────────────────────────────────────────
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function getBalanceLamports() {
  return connection.getBalance(new PublicKey(CREATOR_WALLET));
}

async function fetchHolders() {
  let all = [], page = 1;
  while (true) {
    const res = await fetch(
      `https://data.solanatracker.io/tokens/${TOKEN_CA}/holders?page=${page}&limit=100`,
      { headers: { "x-api-key": ST_API_KEY } }
    );
    if (!res.ok) throw new Error(`SolanaTracker ${res.status}: ${await res.text()}`);
    const data    = await res.json();
    const holders = data.holders || data;
    if (!Array.isArray(holders) || holders.length === 0) break;
    all = all.concat(
      holders.map(h => typeof h === "string" ? h : h.address || h.owner || h.wallet || null).filter(Boolean)
    );
    if (holders.length < 100 || all.length >= 1000) break;
    page++;
  }
  return all;
}

async function sendSOL(to, lamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: creatorKP.publicKey, toPubkey: new PublicKey(to), lamports })
  );
  return sendAndConfirmTransaction(connection, tx, [creatorKP], { commitment: "confirmed" });
}

async function writeResult({ winner, amountSOL, txSig, round, holderCount }) {
  const batch = db.batch();
  batch.set(db.collection("windfall_distributions").doc(), {
    winner, amount: amountSOL, txSignature: txSig,
    timestamp: Timestamp.now(), round, holderCount,
  });
  batch.set(db.doc("windfall_stats/global"), {
    totalDistributed: FieldValue.increment(amountSOL),
    totalRounds:      FieldValue.increment(1),
    lastDistribution: Timestamp.now(),
    lastWinner: winner, lastAmount: amountSOL, lastTx: txSig, lastHolderCount: holderCount,
  }, { merge: true });
  await batch.commit();
}

async function bumpTimestamp(potSOL) {
  await db.doc("windfall_stats/global").set(
    { lastDistribution: Timestamp.now(), currentPotSOL: potSOL },
    { merge: true }
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
let round = 0;

async function distribute() {
  const n = ++round;
  log(`🌬️  Round ${n}`);
  try {
    const balLam  = await getBalanceLamports();
    const balSOL  = balLam / LAMPORTS_PER_SOL;
    const gasLam  = Math.ceil(GAS_RESERVE_SOL * LAMPORTS_PER_SOL);
    const sendLam = balLam - gasLam;
    const sendSOL = sendLam / LAMPORTS_PER_SOL;

    log(`   Balance ◎${balSOL.toFixed(6)}  Sendable ◎${sendSOL.toFixed(6)}`);

    if (sendSOL < MIN_DIST_SOL || sendLam <= 0) {
      log(`   ⏸️  Below minimum ◎${MIN_DIST_SOL}`);
      await bumpTimestamp(balSOL); return;
    }

    log("   Fetching holders...");
    const holders = await fetchHolders();
    if (!holders?.length) { log("   ⚠️  No holders"); await bumpTimestamp(balSOL); return; }
    log(`   Holders: ${holders.length}`);

    const idx    = Math.floor(Math.random() * holders.length);
    const winner = holders[idx];
    log(`   🎲 Winner: ${winner} (${idx+1}/${holders.length})`);

    log(`   Sending ◎${sendSOL.toFixed(6)}...`);
    const txSig = await sendSOL(winner, sendLam);
    log(`   ✅ ${txSig}`);
    log(`   https://solscan.io/tx/${txSig}`);

    await writeResult({ winner, amountSOL: sendSOL, txSig, round: n, holderCount: holders.length });
    log("   📝 Logged to Firestore");

  } catch (err) {
    console.error(`   ❌ Round ${n}:`, err.message || err);
    try { await bumpTimestamp(0); } catch {}
  }
  log("   ─────────────────────────────────────");
}

// ─── BOOT ──────────────────────────────────────────────────────────────────
console.log(`\n  $WINDFALL Distribution Engine\n  Wallet : ${CREATOR_WALLET}\n  Token  : ${TOKEN_CA}\n`);
distribute();
cron.schedule("*/5 * * * *", distribute);
