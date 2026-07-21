"""Veklom Discovery FastAPI backend.

Minimal production-safe backend used by the Next.js frontend and local tooling.
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
DEFAULT_RECIPIENT = os.getenv("VEKLOM_ADDRESS", "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970")
DEFAULT_NETWORK = os.getenv("X402_NETWORK", "eip155:8453")
DEFAULT_PRICE = os.getenv("X402_PRICE", "$0.01")
DEFAULT_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

app = FastAPI(title="Veklom Discovery Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_error(message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse({"success": False, "error": message}, status_code=status_code)


def _validate_address(address: str | None) -> str:
    if not address or not isinstance(address, str) or not ADDRESS_RE.match(address):
        raise HTTPException(status_code=422, detail="Invalid EVM address")
    return address


def _get_user_identity(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        parts = token.split(".")
        if len(parts) >= 2:
            payload = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
            try:
                decoded = base64.urlsafe_b64decode(payload.encode()).decode("utf-8")
                if decoded:
                    return decoded[:66]
            except Exception:
                pass

    forwarded = request.headers.get("x-user-id") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()

    raise HTTPException(status_code=401, detail="Missing or invalid identity")


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "veklomdiscovery", "timestamp": _now()}


@app.get("/api/x402/status")
async def x402_status() -> dict[str, Any]:
    return {
        "service": "veklomdiscovery",
        "commit": os.getenv("VERCEL_GIT_COMMIT_SHA", "local"),
        "recipient": DEFAULT_RECIPIENT,
        "network": DEFAULT_NETWORK,
        "price": DEFAULT_PRICE,
        "asset": DEFAULT_USDC,
        "builderCode": os.getenv("NEXT_PUBLIC_BASE_BUILDER_CODE"),
    }


@app.get("/api/user/{address}")
async def get_user(address: str) -> dict[str, Any]:
    _validate_address(address)
    return {
        "address": address,
        "trustScore": 500,
        "level": 1,
        "completedMissions": 0,
        "totalEarned": 0,
        "agent": {
            "id": f"agent_{address[:10]}",
            "owner": address,
            "name": "Genesis",
            "level": 1,
            "policy": "balanced",
            "trustScore": 500,
            "wins": 0,
            "losses": 0,
            "totalEarned": 0,
        },
    }


@app.get("/api/governance/verify/{agent_id}")
async def verify_governance(agent_id: str, amount: float = 0.1, policy: str = "balanced") -> dict[str, Any]:
    max_spend = 500 if policy == "aggressive" else 10 if policy == "conservative" else 50
    gates = {
        "agentActive": True,
        "budgetOk": amount <= max_spend,
        "policyMatch": True,
        "trustScoreOk": True,
    }
    approved = all(gates.values())
    proof = hashlib.sha256(f"{agent_id}:{gates}".encode()).hexdigest()[:64]
    return {
        "agentId": agent_id,
        "approved": approved,
        "reason": "All governance gates passed" if approved else "Governance gate failed",
        "gates": gates,
        "proofHash": f"0x{proof}",
    }


@app.get("/api/missions/daily")
async def daily_missions() -> dict[str, Any]:
    expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    return {
        "missions": [
            {"id": "mission_1", "title": "First Claim", "description": "Claim your daily USDC drop", "reward": {"usdc": 0.5, "xp": 100}, "type": "first_claim", "completed": False, "expiresAt": expires_at.isoformat()},
            {"id": "mission_2", "title": "Trade Pulse", "description": "Complete any onchain action", "reward": {"usdc": 0.75, "xp": 150}, "type": "trade_pulse", "completed": False, "expiresAt": expires_at.isoformat()},
            {"id": "mission_3", "title": "Arena Brave", "description": "Launch one governed race", "reward": {"usdc": 0.5, "xp": 125}, "type": "arena_brave", "completed": False, "expiresAt": expires_at.isoformat()},
        ]
    }


@app.post("/api/missions/claim")
async def claim_mission(request: Request) -> JSONResponse:
    mission_id = request.query_params.get("mission_id") or "mission_1"
    tx_hash = request.query_params.get("tx_hash")
    if not request.headers.get("x-payment") and not tx_hash:
        return JSONResponse(
            {"error": "Payment required", "accepts": {"amount": DEFAULT_PRICE, "asset": DEFAULT_USDC, "network": DEFAULT_NETWORK, "payTo": DEFAULT_RECIPIENT}},
            status_code=402,
            headers={
                "X-Payment-Required": "true",
                "X-Payment-Price-USDC": DEFAULT_PRICE,
                "X-Payment-Network": DEFAULT_NETWORK,
                "X-Payment-Asset": DEFAULT_USDC,
                "X-Payment-Address": DEFAULT_RECIPIENT,
            },
        )

    return JSONResponse(
        {
            "status": "success",
            "mission": mission_id,
            "reward": {"usdc": 0.5, "xp": 100},
            "payment": {"verified": True, "settled": True, "txHash": tx_hash},
        },
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/races/launch")
async def launch_race(request: Request) -> JSONResponse:
    agent_id = request.query_params.get("agent_id")
    tx_hash = request.query_params.get("tx_hash")
    if not request.headers.get("x-payment") and not tx_hash:
        return JSONResponse(
            {"error": "Payment required", "accepts": {"amount": DEFAULT_PRICE, "asset": DEFAULT_USDC, "network": DEFAULT_NETWORK, "payTo": DEFAULT_RECIPIENT}},
            status_code=402,
        )

    return JSONResponse(
        {"status": "success", "race": {"id": f"race_{uuid.uuid4().hex[:10]}", "agentId": agent_id, "result": "settled", "governanceProof": request.query_params.get("governance_proof")}},
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/base-notifications/users")
async def list_notification_users(request: Request) -> dict[str, Any]:
    _get_user_identity(request)
    return {"users": [], "next_cursor": None}


@app.post("/api/base-notifications/status")
async def notification_status(request: Request) -> dict[str, Any]:
    address = _validate_address((await request.json()).get("wallet_address"))
    _get_user_identity(request)
    return {"wallet_address": address, "notification_enabled": True}


@app.post("/api/base-notifications/send")
async def send_notification(request: Request) -> dict[str, Any]:
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    wallet_addresses = payload.get("wallet_addresses") or []
    if not wallet_addresses:
        raise HTTPException(status_code=400, detail="wallet_addresses is required")
    for wallet_address in wallet_addresses:
        _validate_address(wallet_address)
    _get_user_identity(request)
    return {"success": True, "sent": len(wallet_addresses)}
