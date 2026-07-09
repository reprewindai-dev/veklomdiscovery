export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "veklomdiscovery",
    timestamp: new Date().toISOString(),
  });
}
