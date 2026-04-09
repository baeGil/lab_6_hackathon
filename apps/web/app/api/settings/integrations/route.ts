import { NextResponse } from "next/server";
import { getStore } from "../../../../../../packages/db/src/store";

export async function GET() {
  const store = getStore();
  return NextResponse.json({
    status: store.getCredentialsStatus()
  });
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Global integration writes are disabled. Use the per-repository integrations API instead."
    },
    { status: 405 }
  );
}
