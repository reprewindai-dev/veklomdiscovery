import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  AlertCircle, ChevronRight, Zap, Shield, Play, RefreshCw, 
  Lock, Unlock, Wallet, Send, DollarSign, LogOut, Code, 
  Compass, Award, CircleDot, ChevronUp, ChevronDown, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { encodeFunctionData } from 'viem';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { useAccount, useConnect, useDisconnect, usePublicClient, useSendTransaction, useSignMessage, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { dataSuffix } from './baseAttribution';
import { BASE_APP_ID, VEKLOM_COM_ADDRESS, VEKLOM_DISCOVERY_ADDRESS, VEKLOM_ID_ADDRESS } from '../config/veklomIdentity';

const toHex = (value) => {
  if (typeof window !== 'undefined' && window.TextEncoder) {
    return Array.from(new TextEncoder().encode(value))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return value.split('').map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
};

const configuredAddress = (value) => {
  const clean = String(value || '').trim();
  return /^0x[a-fA-F0-9]{40}$/.test(clean) ? clean : null;
};

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

const normalizeX402Amount = (amount) => {
  if (amount === undefined || amount === null) return BigInt(0);
  const clean = String(amount).trim();
  if (!clean) return BigInt(0);
  if (/^\d+$/.test(clean)) return BigInt(clean);
  return BigInt(Math.round(Number(clean) * 1_000_000));
};

const CONFIG = {
  VEKLOM_ADDRESS: VEKLOM_DISCOVERY_ADDRESS,
  VEKLOM_COM_ADDRESS,
  VEKLOM_ID_ADDRESS,
  BASE_APP_ID,
  VEKLOM_ENS: 'veklom.base.eth',
  
  NETWORKS: {
    base: { chainId: 8453, name: 'Base Mainnet', rpc: 'https://mainnet.base.org', explorer: 'https://base.blockscout.com' },
  },
  
  X402: {
    acceptsPayments: true,
    paymentMethods: ['usdc', 'eth', 'native'],
    micropaymentMin: 0.01,
    batchSettlementMax: 1000,
  },
  
  ACP: {
    agentFrameworkEnabled: true,
    autonomousExecution: true,
    governanceRequirement: true,
    policyGated: true,
  },
  
  TOKENS: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH: '0x4200000000000000000000000000000000000006',
  },
  
  CONTRACTS: {
    VEKLOM_REGISTRY: configuredAddress(process.env.NEXT_PUBLIC_VEKLOM_DISCOVERY_REGISTRY),
    VEKLOM_PAYMENT_VAULT: configuredAddress(process.env.NEXT_PUBLIC_VEKLOM_DISCOVERY_PAYMENT_VAULT),
    GAME_REPUTATION_LEDGER: configuredAddress(process.env.NEXT_PUBLIC_VEKLOM_DISCOVERY_REPUTATION_LEDGER),
  },

  API: {
    BASE_URL: process.env.NEXT_PUBLIC_VEKLOM_API_URL || '',
    SERVICE: process.env.NEXT_PUBLIC_VEKLOM_BACKEND_SERVICE || 'veklomdiscovery',
  },
};

const decodeBase64Json = (value) => {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const getX402PaymentRequirement = (response) => {
  const header = response.headers.get('payment-required');
  const decoded = decodeBase64Json(header);
  const accept = decoded?.accepts?.[0];
  if (!accept) return null;
  return {
    amount: accept.amount,
    asset: accept.asset,
    network: accept.network,
    recipient: accept.payTo,
    currency: accept.extra?.name || 'USDC',
    description: decoded?.resource?.description,
  };
};

class X402PaymentHandler {
  constructor(veklomAddress) {
    this.veklomAddress = veklomAddress;
    this.pendingPayments = new Map();
  }
  async handle402Response(response, paymentDetails) {
    if (response.status !== 402) throw new Error('Expected 402 Payment Required response');
    const paymentInfo = getX402PaymentRequirement(response);
    return {
      endpoint: response.url,
      requiredPayment: paymentInfo?.amount || paymentDetails.amount,
      currency: paymentDetails.currency || 'USDC',
      recipient: paymentInfo?.recipient || this.veklomAddress,
      deadline: new Date(Date.now() + 5 * 60 * 1000),
      paymentProof: null,
    };
  }
  async preparePayment(amount, currency = 'USDC', recipient = this.veklomAddress) {
    const paymentRequest = {
      id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount, currency, recipient,
      timestamp: new Date(),
      status: 'pending',
      proof: null,
    };
    this.pendingPayments.set(paymentRequest.id, paymentRequest);
    return {
      type: 'x402_payment',
      paymentId: paymentRequest.id,
      details: paymentRequest,
      baseAccountAction: {
        tool: 'send',
        args: { recipient, amount: amount.toString(), asset: currency, chain: 'base' }
      }
    };
  }
}

class ACPAgentFramework {
  constructor() {
    this.agents = new Map();
    this.executionLog = [];
  }
  registerAgent(agentId, agentConfig) {
    const agent = {
      id: agentId,
      type: agentConfig.type || 'autonomous',
      policy: agentConfig.policy || 'balanced',
      trustScore: agentConfig.trustScore || 500,
      capabilities: agentConfig.capabilities || ['mission', 'race', 'payment'],
      budgetLimit: agentConfig.budgetLimit || 100,
      approvalRequired: agentConfig.approvalRequired !== false,
      owner: agentConfig.owner,
      createdAt: new Date(),
      isActive: true,
    };
    this.agents.set(agentId, agent);
    return agent;
  }
  async evaluateGovernance(agentId, action, context) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const evaluations = {
      agentActive: agent.isActive,
      budgetOk: action.amount <= agent.budgetLimit,
      trustScoreOk: agent.trustScore >= 400,
      capabilityMatch: agent.capabilities.includes(action.type),
    };
    const allGates = Object.values(evaluations).every(v => v === true);
    const proof = {
      agentId,
      actionId: action.id,
      evaluations,
      timestamp: new Date(),
      approved: allGates,
      proofHash: `0x${toHex(JSON.stringify(evaluations)).substring(0, 64)}`,
    };
    this.executionLog.push(proof);
    return {
      approved: allGates,
      proof,
      reason: allGates ? 'All gates passed' : `Failed: ${Object.entries(evaluations).filter(([_, v]) => !v).map(([k]) => k).join(', ')}`,
    };
  }
}

const VeklomDiscoveryProduction = () => {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { connect, connectors, error: walletError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { signMessageAsync } = useSignMessage();

  // Core Game State
  const [stats, setStats] = useState({ trustScore: 500, level: 1, totalEarned: 0, fuel: 100 });
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [gameLogs, setGameLogs] = useState(["Initialize Discovery Drive...", "Awaiting telemetry data..."]);

  // 2D Game Board State (6x6 Grid)
  const GRID_SIZE = 6;
  const [shipPos, setShipPos] = useState({ x: 0, y: 0 });
  const [grid, setGrid] = useState([]);

  const acpFramework = useRef(new ACPAgentFramework());
  const activeUserAddress = address || CONFIG.VEKLOM_ADDRESS;

  // Initialize Game Board
  const initBoard = useCallback(() => {
    const tempGrid = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        // Default space
        let type = 'space';
        let name = 'Deep Space';
        let detail = 'Vacuum of space. Standard propulsion active.';
        
        // Spawn some interesting entities
        if (x === 0 && y === 0) {
          type = 'station';
          name = 'Veklom Outpost Alpha';
          detail = 'Sovereign Edge base. Refuel and run diagnostics here.';
        } else if ((x === 1 && y === 3) || (x === 4 && y === 1)) {
          type = 'asteroid';
          name = 'USDC Asteroid Belt';
          detail = 'Rich in mineralized USDC deposits. Mine for payload rewards.';
        } else if (x === 3 && y === 3) {
          type = 'locked_planet';
          name = 'Sovereign Nexus-9';
          detail = 'Encrypted registry node. Colonization requires X402 payment verification ($0.01 USDC).';
        } else if (x === 5 && y === 4) {
          type = 'anomaly';
          name = 'ACP Rogue Beacon';
          detail = 'Rogue AI activity detected. Initiate governed race logic to override.';
        } else if (x === 2 && y === 5) {
          type = 'planet';
          name = 'Base Station Prime';
          detail = 'ENS Node veklom.base.eth. Access verified identity registries.';
        }

        tempGrid.push({ x, y, type, name, detail, explored: (x === 0 && y === 0) });
      }
    }
    setGrid(tempGrid);
  }, []);

  // Initialize Core Logic
  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = localStorage.getItem('veklom_user');
        const storedSession = localStorage.getItem('veklom_siwe_session');
        const newUser = storedUser ? JSON.parse(storedUser) : { 
          id: `user_${Date.now()}`,
          createdAt: new Date().toISOString(),
        };

        const acpAgent = acpFramework.current.registerAgent(`agent_${newUser.id}`, {
          type: 'autonomous',
          policy: 'balanced',
          trustScore: 500,
          capabilities: ['mission', 'race', 'payment'],
          owner: newUser.id,
        });

        setAgent(acpAgent);
        initBoard();
        
        if (storedSession) {
          setSession(JSON.parse(storedSession));
        }

        setLoading(false);
      } catch (err) {
        setError(`Failed to initialize game drive: ${err.message}`);
        setLoading(false);
      }
    };
    init();
  }, [initBoard]);

  const addGameLog = (msg) => {
    setGameLogs(prev => [msg, ...prev].slice(0, 30));
  };

  const connectWallet = useCallback(async (connector) => {
    try {
      await connect({ connector });
      addGameLog(`Wallet linked: ${connector.name}`);
    } catch (err) {
      setError(`Wallet connection failed: ${err.message}`);
    }
  }, [connect]);

  const signInWithEthereum = useCallback(async () => {
    try {
      if (!isConnected || !address || !chainId || !publicClient) {
        throw new Error('Connect a Base-compatible wallet first');
      }

      setAuthLoading(true);

      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }

      const nonce = generateSiweNonce();
      const message = createSiweMessage({
        address,
        chainId: base.id,
        domain: window.location.host,
        nonce,
        statement: 'Sign in to Veklom Discovery to authorize paid mission, race, and notification actions.',
        uri: window.location.origin,
        version: '1',
      });
      const signature = await signMessageAsync({ message });
      const valid = await publicClient.verifySiweMessage({ message, signature });

      if (!valid) throw new Error('SIWE verification failed');

      const nextSession = {
        address,
        chainId: base.id,
        nonce,
        signature,
        signedAt: new Date().toISOString(),
      };
      setSession(nextSession);
      localStorage.setItem('veklom_siwe_session', JSON.stringify(nextSession));
      addGameLog("SIWE Authenticated successfully.");
    } catch (err) {
      setError(`SIWE sign-in failed: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  }, [address, chainId, isConnected, publicClient, signMessageAsync, switchChainAsync]);

  const requireWalletSession = useCallback(() => {
    if (!isConnected || !address) {
      throw new Error('Connect a wallet before starting paid Base App actions');
    }
    if (!session || session.address?.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Sign in with Ethereum before starting paid Base App actions');
    }
  }, [address, isConnected, session]);

  const sendX402Payment = useCallback(async (paymentRequirement, fallbackAmount = '0.01') => {
    requireWalletSession();
    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }

    const recipient = configuredAddress(paymentRequirement?.recipient) || CONFIG.VEKLOM_ADDRESS;
    const asset = configuredAddress(paymentRequirement?.asset) || CONFIG.TOKENS.USDC;
    const amountMicro = normalizeX402Amount(paymentRequirement?.amount || fallbackAmount);

    if (!recipient || !asset || amountMicro <= BigInt(0)) {
      throw new Error('X402 payment challenge did not include a valid recipient, asset, and amount');
    }

    const transferData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [recipient, amountMicro],
    });

    return sendTransactionAsync({
      to: asset,
      data: transferData,
      value: BigInt(0),
      chainId: base.id,
    });
  }, [chainId, requireWalletSession, sendTransactionAsync, switchChainAsync]);

  // Game Action: Refuel Outpost
  const refuelShip = () => {
    if (stats.fuel >= 100) {
      addGameLog("Fuel tanks already full.");
      return;
    }
    setStats(prev => ({ ...prev, fuel: 100 }));
    addGameLog("Propulsion fuel replenished at station outpost.");
  };

  // Game Action: Mine USDC Asteroid (Triggers Claim Daily Drop HTTP 402 path)
  const mineAsteroid = async () => {
    try {
      requireWalletSession();
      addGameLog("Extracting USDC mineral core... contact with server initialized.");
      
      const response = await fetch(
        `${CONFIG.API.BASE_URL}/api/missions/claim?user_address=${address}&mission_id=asteroid_mine`,
        { method: 'POST' }
      );
      
      if (response.status === 402) {
        addGameLog("USDC Asteroid is locked behind X402. Requesting payment proof...");
        const paymentRequirement = getX402PaymentRequirement(response);
        const txHash = await sendX402Payment(paymentRequirement, '0.01');
        
        addGameLog("Submitting Base settlement proof to edge node...");
        const paidResponse = await fetch(
          `${CONFIG.API.BASE_URL}/api/missions/claim?user_address=${address}&mission_id=asteroid_mine&tx_hash=${txHash}`,
          {
            method: 'POST',
            headers: { 'X-Payment': txHash },
          }
        );
        
        if (!paidResponse.ok) throw new Error("Payment proof validation failed.");
        
        setStats(prev => ({ 
          ...prev, 
          totalEarned: prev.totalEarned + 1.5, 
          trustScore: prev.trustScore + 25 
        }));
        addGameLog("Successfully mined Asteroid! Earned +$1.50 USDC.");
      } else {
        const payload = await response.json();
        setStats(prev => ({ 
          ...prev, 
          totalEarned: prev.totalEarned + 0.50 
        }));
        addGameLog("Asteroid cleared. Secured +$0.50 USDC.");
      }
    } catch (err) {
      setError(`Extraction aborted: ${err.message}`);
    }
  };

  // Game Action: Colonize locked planet using real X402 payment
  const colonizePlanet = async () => {
    try {
      requireWalletSession();
      addGameLog("Requesting landing clearance on Sovereign Nexus-9...");

      const response = await fetch(
        `${CONFIG.API.BASE_URL}/api/missions/claim?user_address=${address}&mission_id=colonize_nexus`,
        { method: 'POST' }
      );

      if (response.status === 402) {
        addGameLog("Payment challenge required: $0.01 USDC. Constructing Base payload...");
        const paymentRequirement = getX402PaymentRequirement(response);
        const txHash = await sendX402Payment(paymentRequirement, '0.01');

        addGameLog("Broadcasting transaction hash to registry ledger...");
        const paidResponse = await fetch(
          `${CONFIG.API.BASE_URL}/api/missions/claim?user_address=${address}&mission_id=colonize_nexus&tx_hash=${txHash}`,
          {
            method: 'POST',
            headers: { 'X-Payment': txHash },
          }
        );

        if (!paidResponse.ok) throw new Error("Settlement check rejected.");

        setStats(prev => ({
          ...prev,
          trustScore: prev.trustScore + 100,
          level: prev.level + 1
        }));
        setGrid(prev => prev.map(cell => 
          cell.type === 'locked_planet' ? { ...cell, type: 'planet', name: 'Sovereign Nexus-9 (Colonized)', detail: 'Fully synchronized with the Veklom Ledger.' } : cell
        ));
        addGameLog("Registry Node Unlocked! Trust Score increased +100.");
      }
    } catch (err) {
      setError(`Colonization failed: ${err.message}`);
    }
  };

  // Game Action: Override Rogue Beacon using ACP Race mechanics
  const overrideRogueBeacon = async () => {
    try {
      requireWalletSession();
      if (!agent) throw new Error('ACP Agent driving core is not initialized.');

      addGameLog("Initiating ACP intercept race sequence...");
      const action = {
        id: `action_${Date.now()}`,
        type: 'race',
        amount: 0.1,
        asset: 'USDC',
        policyType: agent.policy,
      };

      const governanceProof = await acpFramework.current.evaluateGovernance(agent.id, action);
      if (!governanceProof.approved) throw new Error(governanceProof.reason);

      const response = await fetch(
        `${CONFIG.API.BASE_URL}/api/races/launch?user_address=${address}&agent_id=${agent.id}`,
        { method: 'POST' }
      );

      if (response.status === 402) {
        addGameLog("Intercept vector requires X402 micro-stake. Paying $0.01 USDC...");
        const paymentReq = getX402PaymentRequirement(response);
        const txHash = await sendX402Payment(paymentReq, '0.01');

        const paidResponse = await fetch(
          `${CONFIG.API.BASE_URL}/api/races/launch?user_address=${address}&agent_id=${agent.id}&tx_hash=${txHash}`,
          { method: 'POST', headers: { 'X-Payment': txHash } }
        );
        if (!paidResponse.ok) throw new Error("Paid intercept proof rejected.");
      }

      setStats(prev => ({ ...prev, trustScore: prev.trustScore + 50 }));
      setGrid(prev => prev.map(cell => 
        cell.type === 'anomaly' ? { ...cell, type: 'space', name: 'Secured Sector', detail: 'Rogue threat eliminated.' } : cell
      ));
      addGameLog("ACP Rogue override successful! Sector secured.");
    } catch (err) {
      setError(`Beacon override failed: ${err.message}`);
    }
  };

  // Handle ship movement
  const moveShip = (dx, dy) => {
    const nextX = shipPos.x + dx;
    const nextY = shipPos.y + dy;

    if (nextX >= 0 && nextX < GRID_SIZE && nextY >= 0 && nextY < GRID_SIZE) {
      if (stats.fuel <= 0) {
        addGameLog("Out of fuel! Fly back to Outpost Alpha (0,0) to refuel.");
        return;
      }

      setShipPos({ x: nextX, y: nextY });
      setStats(prev => ({ ...prev, fuel: prev.fuel - 5 }));
      
      // Explore next cell
      setGrid(prev => prev.map(cell => 
        cell.x === nextX && cell.y === nextY ? { ...cell, explored: true } : cell
      ));

      const targetCell = grid.find(c => c.x === nextX && c.y === nextY);
      addGameLog(`Arrived in sector (${nextX}, ${nextY}): ${targetCell?.name || 'Deep Space'}`);
    }
  };

  const currentCell = grid.find(c => c.x === shipPos.x && c.y === shipPos.y);

  return (
    <div className="w-full min-h-screen bg-black text-slate-100 font-mono p-4 flex flex-col justify-between">
      {/* Top Header Panel */}
      <header className="border-b-2 border-green-500 bg-slate-950 p-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-green-400 flex items-center gap-2">
            <Compass className="w-6 h-6 animate-spin-slow" />
            VEKLOM DISCOVERY CORE
          </h1>
          <p className="text-xs text-slate-400">Sovereign Explorer v2.0 • Active Network Layer</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {!isConnected ? (
            connectors.map(connector => (
              <button
                key={connector.uid}
                onClick={() => connectWallet(connector)}
                className="px-3 py-1.5 bg-green-950/40 border border-green-500 text-green-300 text-xs uppercase hover:bg-green-950/80 transition"
              >
                Connect {connector.name}
              </button>
            ))
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 bg-green-950 border border-green-500 text-green-400">
                {address?.substring(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={signInWithEthereum}
                disabled={authLoading}
                className={`px-3 py-1.5 border text-xs uppercase transition ${
                  session ? 'border-green-500 text-green-400 bg-green-950/20' : 'border-amber-500 text-amber-400 bg-amber-950/20'
                }`}
              >
                {authLoading ? 'SIWE Signing...' : session ? 'SIWE SECURE' : 'SIWE LOGIN'}
              </button>
              <button
                onClick={() => {
                  setSession(null);
                  localStorage.removeItem('veklom_siwe_session');
                  disconnect();
                }}
                className="p-1.5 bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main HUD Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Game Map (Left 2 columns on large screens) */}
        <div className="lg:col-span-2 border-2 border-slate-800 bg-slate-950 p-4 flex flex-col items-center justify-center">
          <div className="text-center mb-4 border-b border-slate-800 pb-2 w-full">
            <h2 className="text-sm font-bold text-green-400">DISCOVERY EXPEDITION SYSTEM</h2>
            <p className="text-[10px] text-slate-500">Navigate using controls or arrow key mechanics</p>
          </div>

          {/* Grid Render */}
          <div className="grid grid-cols-6 gap-2 w-full max-w-[450px] aspect-square">
            {grid.map((cell) => {
              const isShipHere = shipPos.x === cell.x && shipPos.y === cell.y;
              return (
                <div
                  key={`${cell.x}-${cell.y}`}
                  className={`relative flex items-center justify-center rounded border transition-all ${
                    isShipHere 
                      ? 'border-yellow-400 bg-yellow-950/20 scale-105 z-10 shadow-[0_0_10px_rgba(234,179,8,0.3)]' 
                      : cell.explored 
                        ? 'border-slate-800 bg-slate-900/30' 
                        : 'border-slate-950 bg-slate-950/80 opacity-40'
                  }`}
                  title={cell.explored ? `${cell.name}: ${cell.detail}` : 'Unexplored Sector'}
                >
                  {/* Grid Content */}
                  {isShipHere ? (
                    <span className="text-lg animate-pulse">🛸</span>
                  ) : cell.explored ? (
                    cell.type === 'station' ? (
                      <span className="text-lg">🛰️</span>
                    ) : cell.type === 'asteroid' ? (
                      <span className="text-lg">☄️</span>
                    ) : cell.type === 'locked_planet' ? (
                      <span className="text-lg">🔒🪐</span>
                    ) : cell.type === 'planet' ? (
                      <span className="text-lg">🪐</span>
                    ) : cell.type === 'anomaly' ? (
                      <span className="text-lg text-red-500 animate-pulse">⚠️</span>
                    ) : (
                      <span className="text-slate-700 text-[10px]">•</span>
                    )
                  ) : (
                    <span className="text-slate-800 text-xs">?</span>
                  )}
                  
                  {/* Coordinates label */}
                  <span className="absolute bottom-0.5 right-1 text-[8px] text-slate-600 font-mono">
                    {cell.x},{cell.y}
                  </span>
                </div>
              );
            })}
          </div>

          {/* D-Pad Controls */}
          <div className="mt-6 flex flex-col items-center gap-1">
            <button
              onClick={() => moveShip(0, -1)}
              className="p-2 border border-slate-700 hover:border-green-500 bg-slate-900 rounded text-slate-300"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <div className="flex gap-4">
              <button
                onClick={() => moveShip(-1, 0)}
                className="p-2 border border-slate-700 hover:border-green-500 bg-slate-900 rounded text-slate-300"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 flex items-center justify-center border border-slate-800 text-[10px] text-slate-600">
                DRV
              </div>
              <button
                onClick={() => moveShip(1, 0)}
                className="p-2 border border-slate-700 hover:border-green-500 bg-slate-900 rounded text-slate-300"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={() => moveShip(0, 1)}
              className="p-2 border border-slate-700 hover:border-green-500 bg-slate-900 rounded text-slate-300"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sidebar / Controls (Right 1 column) */}
        <div className="border-2 border-slate-800 bg-slate-950 p-4 flex flex-col gap-4">
          {/* Stats Segment */}
          <div className="border border-green-500/20 bg-slate-900/40 p-3 rounded">
            <h3 className="text-xs font-bold text-green-400 mb-2 border-b border-green-500/10 pb-1">SHIP HUD STATS</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Level: <span className="text-white font-bold">{stats.level}</span></div>
              <div>Fuel: <span className={`font-bold ${stats.fuel < 20 ? 'text-red-500 animate-pulse' : 'text-green-400'}`}>{stats.fuel}%</span></div>
              <div>USDC Wallet: <span className="text-yellow-400 font-bold">${stats.totalEarned.toFixed(2)}</span></div>
              <div>Trust Rating: <span className="text-blue-400 font-bold">{stats.trustScore}</span></div>
            </div>
          </div>

          {/* Current Location actions */}
          <div className="border border-slate-800 bg-slate-900/20 p-3 rounded flex-grow">
            <h3 className="text-xs font-bold text-slate-400 mb-2 border-b border-slate-800 pb-1">
              CURRENT SECTOR INFO
            </h3>
            
            {currentCell ? (
              <div className="text-xs">
                <p className="font-bold text-white mb-1">{currentCell.name}</p>
                <p className="text-slate-400 mb-4 text-[11px] leading-relaxed">{currentCell.detail}</p>
                
                {/* Sector Specific Action Buttons */}
                {currentCell.type === 'station' && (
                  <button
                    onClick={refuelShip}
                    className="w-full py-2 bg-slate-800 border border-slate-600 hover:border-green-500 text-white font-bold rounded uppercase transition text-[10px]"
                  >
                    Replenish Ship Thrusters
                  </button>
                )}

                {currentCell.type === 'asteroid' && (
                  <button
                    onClick={mineAsteroid}
                    disabled={!isConnected || !session}
                    className="w-full py-2 bg-green-950/40 border border-green-500 hover:bg-green-900 text-green-300 font-bold rounded uppercase transition text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Extract USDC Payload
                  </button>
                )}

                {currentCell.type === 'locked_planet' && (
                  <button
                    onClick={colonizePlanet}
                    disabled={!isConnected || !session}
                    className="w-full py-2 bg-blue-950/40 border border-blue-500 hover:bg-blue-900 text-blue-300 font-bold rounded uppercase transition text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Registry via X402 ($0.01 USDC)
                  </button>
                )}

                {currentCell.type === 'anomaly' && (
                  <button
                    onClick={overrideRogueBeacon}
                    disabled={!isConnected || !session}
                    className="w-full py-2 bg-red-950/40 border border-red-500 hover:bg-red-900 text-red-300 font-bold rounded uppercase transition text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Initiate ACP Override
                  </button>
                )}

                {(!isConnected || !session) && (currentCell.type === 'asteroid' || currentCell.type === 'locked_planet' || currentCell.type === 'anomaly') && (
                  <p className="text-[9px] text-amber-500 mt-2 font-mono leading-tight">
                    * Interactive sectors require active Wallet connection & SIWE authentication signature to handle Base-chain operations.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Scanning telemetry...</p>
            )}
          </div>

          {/* Console Alerts & Errors */}
          {error && (
            <div className="p-2 border border-red-800 bg-red-950/20 text-red-400 text-[10px] rounded flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div className="flex-1">
                <span className="font-bold">CRITICAL EXCEPTION:</span> {error}
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-white">✕</button>
            </div>
          )}
        </div>
      </main>

      {/* Terminal Telemetry Logs at Bottom */}
      <footer className="border-2 border-slate-800 bg-slate-950 p-4 h-[150px] flex flex-col justify-between">
        <div className="text-xs font-bold text-slate-400 border-b border-slate-800 pb-1 flex justify-between">
          <span>LIVE TELEMETRY LOG DRIVE</span>
          <span className="text-[10px] text-slate-600 font-normal">Buffer depth: 30</span>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[10px] text-green-500/80 space-y-1 py-2 pr-1">
          {gameLogs.map((log, index) => (
            <div key={index} className="flex gap-2">
              <span className="text-slate-700">[{30 - index}]</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default VeklomDiscoveryProduction;
export { X402PaymentHandler, ACPAgentFramework };
