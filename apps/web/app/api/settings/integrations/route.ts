import { NextResponse } from "next/server";
import { getStore } from "../../../../../../packages/db/src/store";
import type { IntegrationCredentialsInput } from "../../../../../../packages/shared/src/index";

export async function GET() {
  const store = getStore();
  return NextResponse.json({
    status: store.getCredentialsStatus()
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as IntegrationCredentialsInput;
  const store = getStore();
  store.saveCredentials(body);
  return NextResponse.json({
    ok: true,
    status: store.getCredentialsStatus()
  });
}
