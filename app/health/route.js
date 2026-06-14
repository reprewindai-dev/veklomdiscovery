export const revalidate = 60;

export async function GET() {
  return Response.json({
    status: "ok",
    veklomAddress: process.env.NEXT_PUBLIC_VEKLOM_ADDRESS || process.env.VEKLOM_ADDRESS || "0xCC34553b4e6332ffb9C1b61E22436ACA53113D1d",
    veklomENS: "veklom.base.eth",
    service: "veklomdiscovery",
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
