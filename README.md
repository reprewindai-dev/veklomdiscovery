# Veklom ID

Production Next.js shell for Veklom Discovery, with Base Builder Code attribution, X402 payment flows, ACP governance, smart contracts, and FastAPI backend assets. The frontend is configured to connect to the `veklom-byos-backend` service through `NEXT_PUBLIC_VEKLOM_API_URL`.

## Revenue Outcome

Veklom ID monetizes onchain identity and agent game actions through X402-gated mission claims, race launches, USDC settlement, and Base Builder Code attribution for Base rewards analytics.

## Run

```bash
npm install
npm run dev
```

Backend:

```bash
pip install -r requirements.txt
uvicorn api.veklom_backend:app --host 0.0.0.0 --port 8000
```

For hosted deployment, set `NEXT_PUBLIC_VEKLOM_API_URL` to the public URL for `veklom-byos-backend`.

## Deployment Status

This repository is ready to deploy to Vercel as the Veklom Discovery web app. The configured recipient identity is `veklom.base.eth` / `0x3a74772e925b54F7dAD7FD95c9Ba30825033f970`.

The Solidity contracts in `contracts/` are deployment assets. They are not assumed to be live until Foundry deployment completes and the resulting contract addresses are added to environment configuration.

## Base Builder Code

Set `NEXT_PUBLIC_BASE_BUILDER_CODE` after registering the app on Base.dev. The app generates the ERC-8021 data suffix with `ox/erc8021` and applies it through the shared onchain config.

Canonical docs used:

- https://docs.base.org/llms.txt
- https://docs.base.org/apps/builder-codes/app-developers
- https://docs.base.org/apps/growth/rewards
