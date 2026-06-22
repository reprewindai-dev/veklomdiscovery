import { facilitator } from "@x402/next";

export const config = {
  matcher: ["/api/protected/:path*"]
};

export default facilitator({
  payTo: "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970",
  network: "base-mainnet",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "5000"
});
