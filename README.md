# 🌬️ $WINDFALL

---

## Setup

```bash
npm install
```

Drop `logo.png` into the `public/` folder.

Update your X links in `src/App.jsx` lines 8–9.

---

## Frontend → Vercel

Add these 3 variables in **Vercel → Project Settings → Environment Variables**:

| Name | Value |
|---|---|
| `VITE_COIN_ID` | `VuAy6VubBezBYzMurxDfJe6xcBWnaRhCcjzjGCqpump` |
| `VITE_TREASURY_ID` | `DSf8dVXjLbnCmEHbNfEATd37486Pe5m8o1nHNQZGgEd1` |
| `VITE_TRACKER_CODE` | `7e03dd01-b931-4fac-8e9f-06a310c1238a` |

They're already in `.env` for local dev.

```bash
npm run dev    # local
npm run build  # deploy to Vercel
```

---

## Distributor → Railway

The `distributor.js` is a long-running process — it can't live on Vercel. Deploy it to Railway:

1. Push this project to GitHub
2. New project on Railway → from GitHub
3. Add these variables in Railway → Variables:

| Name | Value |
|---|---|
| `CREATOR_WALLET` | `DSf8dVXjLbnCmEHbNfEATd37486Pe5m8o1nHNQZGgEd1` |
| `TOKEN_CA` | `VuAy6VubBezBYzMurxDfJe6xcBWnaRhCcjzjGCqpump` |
| `SOLANATRACKER_API_KEY` | `7e03dd01-b931-4fac-8e9f-06a310c1238a` |
| `CREATOR_PRIVATE_KEY` | your wallet private key |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | contents of `distributor.env` (already filled) |
| `SOLANA_RPC` | `https://api.mainnet-beta.solana.com` |
| `MIN_DISTRIBUTE_SOL` | `0.01` |
| `GAS_RESERVE_SOL` | `0.005` |

4. Set start command: `node distributor.js`

Everything else is in `distributor.env` for reference — all pre-filled.

---

## Firestore Rules

Firebase Console → Firestore → Rules:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /windfall_distributions/{doc} { allow read: if true; allow write: if false; }
    match /windfall_stats/{doc}         { allow read: if true; allow write: if false; }
  }
}
```

---

May the $WINDFALL be on you. 🌬️
