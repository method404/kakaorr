export async function GET() {
  return Response.json({
    status: "ok",
    service: "kakaorr-control",
    timestamp: new Date().toISOString(),
  });
}
