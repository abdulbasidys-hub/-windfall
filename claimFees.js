/**
 * claimFees.js — Auto-claim pump.fun + PumpSwap creator fees
 * Works for both bonding curve and post-graduation (WSOL ATA).
 */

const {
  PublicKey, Transaction, TransactionInstruction,
  SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const PUMP_PROGRAM_ID     = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const WSOL_MINT           = new PublicKey("So11111111111111111111111111111111111111112");
const TOKEN_PROGRAM_ID    = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const PUMP_DISCRIMINATOR     = Buffer.from([20, 22, 86, 123, 198, 28, 219, 132]);
const PUMPSWAP_DISCRIMINATOR = Buffer.from([160, 57, 89, 42, 181, 139, 43, 66]);

const CLAIM_INTERVAL_MS  = 20_000;
const MIN_CLAIM_LAMPORTS = 5_000_000; // 0.005 SOL

function derivePumpVault(pub) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), pub.toBuffer()], PUMP_PROGRAM_ID);
  return pda;
}
function derivePumpEventAuth() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")], PUMP_PROGRAM_ID);
  return pda;
}
function derivePumpSwapVault(pub) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_vault"), pub.toBuffer()], PUMPSWAP_PROGRAM_ID);
  return pda;
}
function derivePumpSwapEventAuth() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")], PUMPSWAP_PROGRAM_ID);
  return pda;
}
function deriveATA(owner, mint) {
  const ASSOC = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bsn");
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOC);
  return ata;
}

async function claimPumpFees(connection, creatorKP, log) {
  const vault     = derivePumpVault(creatorKP.publicKey);
  const eventAuth = derivePumpEventAuth();
  let bal = 0;
  try { bal = await connection.getBalance(vault); } catch { return 0; }
  if (bal <= MIN_CLAIM_LAMPORTS) return 0;
  log(`  [pump.fun] ◎${(bal/LAMPORTS_PER_SOL).toFixed(6)} — claiming...`);
  try {
    const ix = new TransactionInstruction({
      programId: PUMP_PROGRAM_ID, data: PUMP_DISCRIMINATOR,
      keys: [
        { pubkey: creatorKP.publicKey, isSigner:true,  isWritable:true  },
        { pubkey: vault,               isSigner:false, isWritable:true  },
        { pubkey: SystemProgram.programId, isSigner:false, isWritable:false },
        { pubkey: eventAuth,           isSigner:false, isWritable:false },
        { pubkey: PUMP_PROGRAM_ID,     isSigner:false, isWritable:false },
      ],
    });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [creatorKP], { commitment:"confirmed" });
    log(`  [pump.fun] ✓ Claimed ◎${(bal/LAMPORTS_PER_SOL).toFixed(6)} | ${sig}`);
    return bal / LAMPORTS_PER_SOL;
  } catch (e) {
    const m = e.message||"";
    if (!m.includes("AccountNotFound") && !m.includes("does not exist"))
      log(`  [pump.fun] Error: ${m.split("\n")[0]}`);
    return 0;
  }
}

async function claimPumpSwapFees(connection, creatorKP, log) {
  const vaultAuth = derivePumpSwapVault(creatorKP.publicKey);
  const eventAuth = derivePumpSwapEventAuth();
  const wsolATA   = deriveATA(vaultAuth, WSOL_MINT);

  // Check WSOL token account
  let wsolBal = 0;
  try {
    const info = await connection.getTokenAccountBalance(wsolATA);
    wsolBal = Math.floor((info.value.uiAmount || 0) * LAMPORTS_PER_SOL);
  } catch {}

  // Check native SOL on vault
  let nativeBal = 0;
  try { nativeBal = await connection.getBalance(vaultAuth); } catch {}
  const RENT = 890_880;
  const claimableNative = Math.max(0, nativeBal - RENT);
  const total = wsolBal + claimableNative;

  if (total < MIN_CLAIM_LAMPORTS) return 0;
  log(`  [pumpswap] WSOL:◎${(wsolBal/LAMPORTS_PER_SOL).toFixed(6)} Native:◎${(claimableNative/LAMPORTS_PER_SOL).toFixed(6)} — claiming...`);

  try {
    const ix = new TransactionInstruction({
      programId: PUMPSWAP_PROGRAM_ID, data: PUMPSWAP_DISCRIMINATOR,
      keys: [
        { pubkey: creatorKP.publicKey, isSigner:true,  isWritable:true  },
        { pubkey: vaultAuth,           isSigner:false, isWritable:true  },
        { pubkey: SystemProgram.programId, isSigner:false, isWritable:false },
        { pubkey: eventAuth,           isSigner:false, isWritable:false },
        { pubkey: PUMPSWAP_PROGRAM_ID, isSigner:false, isWritable:false },
      ],
    });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [creatorKP], { commitment:"confirmed" });
    log(`  [pumpswap] ✓ Claimed ◎${(total/LAMPORTS_PER_SOL).toFixed(6)} | ${sig}`);
    return total / LAMPORTS_PER_SOL;
  } catch (e) {
    const m = e.message||"";
    if (!m.includes("AccountNotFound") && !m.includes("does not exist") && !m.includes("custom program error"))
      log(`  [pumpswap] Error: ${m.split("\n")[0]}`);
    return 0;
  }
}

function startAutoClaimFees(connection, creatorKP, log) {
  const pumpVault = derivePumpVault(creatorKP.publicKey);
  const swapVault = derivePumpSwapVault(creatorKP.publicKey);
  const wsolATA   = deriveATA(swapVault, WSOL_MINT);
  log(`[AutoClaim] pump.fun vault : ${pumpVault.toBase58()}`);
  log(`[AutoClaim] PumpSwap vault : ${swapVault.toBase58()}`);
  log(`[AutoClaim] WSOL ATA       : ${wsolATA.toBase58()}`);
  log(`[AutoClaim] Every ${CLAIM_INTERVAL_MS/1000}s | Min ◎${MIN_CLAIM_LAMPORTS/LAMPORTS_PER_SOL}`);

  const run = async () => {
    await claimPumpFees(connection, creatorKP, log).catch(()=>{});
    await claimPumpSwapFees(connection, creatorKP, log).catch(()=>{});
  };
  run();
  setInterval(run, CLAIM_INTERVAL_MS);
}

module.exports = { startAutoClaimFees };
