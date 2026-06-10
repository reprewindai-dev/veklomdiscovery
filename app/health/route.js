export async function GET() {
  return Response.json({
    status: "ok",
    veklomAddress: "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970",
    veklomENS: "veklom.base.eth",
    service: "veklomdiscovery",
    timestamp: new Date().toISOString(),
  });
}
