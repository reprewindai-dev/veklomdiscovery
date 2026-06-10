const RECIPIENT = "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const paymentProof = request.headers.get("x-payment-proof");

  if (!paymentProof) {
    return Response.json(
      {
        status: 402,
        message: "Payment Required",
        payment: {
          recipient: RECIPIENT,
          currency: "USDC",
          amount: "0.01",
          chain: "base",
          deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      },
      {
        status: 402,
        headers: {
          "Payment-Required": "true",
          "Accept-Payment": "x402",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);

  return Response.json({
    status: "success",
    race: {
      id: `race_${Date.now()}`,
      agentId: searchParams.get("agent_id"),
      result: "pending_settlement",
      governanceProof: searchParams.get("governance_proof"),
    },
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
