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

// ─── START ─────────────────────────────────────────────────────────────────
console.log(`\n  $WINDFALL Distribution Engine\n  Wallet : ${CREATOR_WALLET}\n  Token  : ${TOKEN_CA}\n`);
distribute();
cron.schedule("*/1 * * * *", distribute);// ─── MAIN ──────────────────────────────────────────────────────────────────
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

// ─── START ─────────────────────────────────────────────────────────────────
console.log(`\n  $WINDFALL Distribution Engine\n  Wallet : ${CREATOR_WALLET}\n  Token  : ${TOKEN_CA}\n`);
distribute();
cron.schedule("*/1 * * * *", distribute);