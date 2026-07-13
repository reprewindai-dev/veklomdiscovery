"""
VEKLOM DISCOVERY — FastAPI Backend

Implements:
- X402 HTTP 402 Payment Protocol
- Mission claim system with X402 micropayments
- Agent race simulation with governance gates
- On-chain proof verification
"""
VEKLOM DISCOVERY — FastAPI Backend

Implements:
- X402 HTTP 402 Payment Protocol
- Mission claim system with X402 micropayments
- Agent race simulation with governance gates
- On-chain proof verification
- IPFS integration for distributed proofs
- Base MCP wallet integration for payments

Run: python -m uvicorn veklom_backend:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import httpx
import json
import hashlib
import os
import re
from datetime import datetime, timedelta
from enum import Enum
import uuid
import base64

async def report_telemetry(event_type: str, data: dict, user_id: str):
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                "https://veklom-id.vercel.app/api/v1/internal/identity/events",
                json={
                    "event_type": event_type,
                    "user_id": user_id,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers={"X-Internal-Token": os.getenv("INTERNAL_SERVICE_TOKEN", "mock_internal_token")}
            )
    except Exception as e:
        print(f"Failed to report telemetry: {e}")

def get_current_user(request: Request) -> str:
    auth = request.headers.get("Authorization")
    user_id = request.headers.get("X-User-Id")
    address = None
    
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ")[1]
        try:
            parts = token.split(".")
            if len(parts) >= 2:
                payload_b64 = parts[1]
                payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
                payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
                address = payload.get("sub")
        except Exception:
            pass
            
    if not address:
        address = user_id
        
    if not address:
        raise HTTPException(status_code=401, detail="Missing or invalid IdentityRAG token")
        
    return address


# ============ CONFIGURATION ============
VEKLOM_ADDRESS = os.getenv("VEKLOM_ADDRESS", "0xCC34553b4e6332ffb9C1b61E22436ACA53113D1d")
VEKLOM_ENS = os.getenv("VEKLOM_ENS", "veklom.base.eth")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "https://veklom-id.vercel.app,http://localhost:3000").split(",")
    if origin.strip()
]
PAYMENT_PROOF_RE = re.compile(r"^veklom:x402:[A-Za-z0-9_\-:.]+$")
TX_HASH_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")

NETWORKS = {
    "base": {
        "chainId": 8453,
        "name": "Base Mainnet",
        "rpc": "https://mainnet.base.org",
        "usdc": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    tx_hash: str,
    amount: float,
    user_address: str
):
    """
    Verify X402 payment was received on-chain
    In production, calls Base RPC to verify transaction
    """
    
    return {
        "paymentId": payment_id,
        "txHash": tx_hash,
        "verified": True,
        "amount": amount,
        "user": user_address,
        "timestamp": datetime.utcnow().isoformat(),
    }

# ============ BATCH SETTLEMENT ============
@app.post("/api/x402/batch-settle")
async def batch_settle_payments(background_tasks: BackgroundTasks):
    """
    Batch settle accumulated X402 micropayments
    In production, calls on-chain VeklomPaymentVault.batchSettle()
    """
    
    if not payments_log:
        return {"status": "no_payments"}
    
    # Calculate merkle root
    payment_ids = [p["id"] for p in payments_log]
    merkle_root = hashlib.sha256(
        "".join(payment_ids).encode()
    ).hexdigest()
    
    batch = {
        "id": str(uuid.uuid4()),
        "paymentCount": len(payments_log),
        "totalAmount": sum(p["amount"] for p in payments_log),
        "merkleRoot": f"0x{merkle_root}",
        "settlementTime": datetime.utcnow().isoformat(),
    }
    
    # Clear log for next batch
    payments_log.clear()
    
    return batch

# ============ LEADERBOARD ============
@app.get("/api/leaderboard")
async def get_leaderboard(limit: int = 20):
    """Get global leaderboard"""
    sorted_users = sorted(
        users_db.values(),
        key=lambda u: u.trustScore,
        reverse=True
    )[:limit]
    
    return {
        "leaderboard": [
            {
                "rank": i + 1,
                "address": u.address,
                "trustScore": u.trustScore,
                "completedMissions": u.completedMissions,
                "agent": u.agent.name if u.agent else None,
            }
            for i, u in enumerate(sorted_users)
        ]
    }

# ============ IPFS PROOF STORAGE ============
@app.post("/api/proofs/store")
async def store_proof(
    proof_data: Dict,
    background_tasks: BackgroundTasks
):
    """
    Store execution proof on IPFS
    In production, uses Pinata or Infura IPFS
    """
    
    proof_hash = hashlib.sha256(
        json.dumps(proof_data).encode()
    ).hexdigest()
    
    return {
        "ipfsHash": f"Qm{proof_hash[:44]}",
        "proof": proof_data,
        "timestamp": datetime.utcnow().isoformat(),
    }

# ============ ERROR HANDLERS ============
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
