import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "@postport/web",
    time: new Date().toISOString()
  });
}
