export const revalidate = 60;

export async function GET() {
  return Response.json({
    status: "ok",
    veklomAddress: process.env.NEXT_PUBLIC_VEKLOM_ADDRESS || process.env.VEKLOM_ADDRESS || "0x3a74772e925b54f7dad7fd95c9ba30825033f970",
    veklomENS: "veklom.base.eth",
    service: "veklomdiscovery",
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
