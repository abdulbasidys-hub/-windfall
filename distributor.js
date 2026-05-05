require("dotenv").config();

const cron  = require("node-cron");
const fetch = require("node-fetch");

const {
  Connection, PublicKey, Transaction,
  SystemProgram, Keypair, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const bs58 = require("bs58");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CREATOR_WALLET  = process.env.CREATOR_WALLET;
const TOKEN_CA        = process.env.TOKEN_CA;
const ST_API_KEY      = process.env.SOLANATRACKER_API_KEY;
const SOLANA_RPC      = process.env.SOLANA_RPC      || "https://api.mainnet-beta.solana.com";
const MIN_DIST_SOL    = parseFloat(process.env.MIN_DISTRIBUTE_SOL || "0.01");
const GAS_RESERVE_SOL = parseFloat(process.env.GAS_RESERVE_SOL    || "0.005");

// ─── STARTUP CHECKS ────────────────────────────────────────────────────────
const missing = ["CREATOR_PRIVATE_KEY", "FIREBASE_SERVICE_ACCOUNT_JSON", "CREATOR_WALLET", "TOKEN_CA"]
  .filter(k => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}

// ─── SOLANA ────────────────────────────────────────────────────────────────
const connection = new Connection(SOLANA_RPC, "confirmed");
const creatorKP  = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_PRIVATE_KEY));

if (creatorKP.publicKey.toBase58() !== CREATOR_WALLET) {
  console.error("Key mismatch! Expected:", CREATOR_WALLET, "Got:", creatorKP.publicKey.toBase58());
  process.exit(1);
}

// ─── FIREBASE ──────────────────────────────────────────────────────────────
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = getFirestore();

// ─── HELPERS ───────────────────────────────────────────────────────────────
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function getBalanceLamports() {
  return connection.getBalance(new PublicKey(CREATOR_WALLET));
}

async function fetchHolders() {
  const res = await fetch(
    `https://data.solanatracker.io/tokens/${TOKEN_CA}/holders?page=1&limit=100`,
    { headers: { "x-api-key": ST_API_KEY } }
  );
  const raw = await res.json();
  console.log("RAW HOLDERS RESPONSE:", JSON.stringify(raw).slice(0, 500));

 const list = raw.holders
          ?? raw.accounts
          ?? raw.items
          ?? raw.wallets
          ?? raw.data?.holders
          ?? raw.data?.items
          ?? (Array.isArray(raw) ? raw : null);

  if (!list || list.length === 0) return [];

  return list.map(h =>
    typeof h === "string" ? h : h.address || h.owner || h.wallet || h.pubkey || null
  ).filter(Boolean);
}

async function sendSOL(to, lamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: creatorKP.publicKey,
      toPubkey: new PublicKey(to),
      lamports,
    })
  );
  return sendAndConfirmTransaction(connection, tx, [creatorKP], { commitment: "confirmed" });
}

async function logToFirestore(winner, amountSOL, txSig, roundNum, holderCount) {
  const batch = db.batch();
  batch.set(db.collection("windfall_distributions").doc(), {
    winner,
    amount: amountSOL,
    txSignature: txSig,
    timestamp: Timestamp.now(),
    round: roundNum,
    holderCount,
  });
  batch.set(db.doc("windfall_stats/global"), {
    totalDistributed: FieldValue.increment(amountSOL),
    totalRounds:      FieldValue.increment(1),
    lastDistribution: Timestamp.now(),
    lastWinner:       winner,
    lastAmount:       amountSOL,
    lastTx:           txSig,
    lastHolderCount:  holderCount,
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
let roundCounter = 0;

async function distribute() {
  const thisRound = ++roundCounter;
  log(`🌬️  Round ${thisRound}`);

  try {
    const balLam  = await getBalanceLamports();
    const balSOL  = balLam / LAMPORTS_PER_SOL;
    const gasLam  = Math.ceil(GAS_RESERVE_SOL * LAMPORTS_PER_SOL);
    const sendLam = balLam - gasLam;
    const sendAmt = sendLam / LAMPORTS_PER_SOL;

    log(`   Balance  ◎${balSOL.toFixed(6)}  |  Sendable ◎${sendAmt.toFixed(6)}`);

    if (sendAmt < MIN_DIST_SOL || sendLam <= 0) {
      log(`   ⏸️  Below minimum ◎${MIN_DIST_SOL}`);
      await bumpTimestamp(balSOL);
      return;
    }

    log("   Fetching holders...");
    const holders = await fetchHolders();

    if (!holders || holders.length === 0) {
      log("   ⚠️  No holders found");
      await bumpTimestamp(balSOL);
      return;
    }
    log(`   Holders: ${holders.length}`);

    const idx    = Math.floor(Math.random() * holders.length);
    const winner = holders[idx];
    log(`   🎲 Winner: ${winner} (${idx + 1} of ${holders.length})`);

    log(`   Sending ◎${sendAmt.toFixed(6)}...`);
    const txSig = await sendSOL(winner, sendLam);
    log(`   ✅ ${txSig}`);
    log(`   https://solscan.io/tx/${txSig}`);

    await logToFirestore(winner, sendAmt, txSig, thisRound, holders.length);
    log("   📝 Firestore updated");

  } catch (err) {
    console.error(`   ❌ Round ${thisRound} failed:`, err.message || err);
    try { await bumpTimestamp(0); } catch {}
  }

  log("   ─────────────────────────────────────");
}

// ─── START ─────────────────────────────────────────────────────────────────
console.log(`\n  $WINDFALL Engine\n  Wallet: ${CREATOR_WALLET}\n  Token:  ${TOKEN_CA}\n`);
distribute();
cron.schedule("*/1 * * * *", distribute);
