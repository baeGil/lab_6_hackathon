import { NextResponse } from "next/server";
import { getStore } from "../../../../../packages/db/src/store";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    analytics: getStore().getAnalytics()
  });
}
