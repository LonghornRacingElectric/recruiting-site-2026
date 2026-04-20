import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getEmailTemplatesConfig, updateEmailTemplatesConfig } from "@/lib/firebase/config";

export async function GET() {
  try {
    await requireAdmin();
    const config = await getEmailTemplatesConfig();
    return NextResponse.json(config);
  } catch (error: any) {
    console.error("Failed to fetch email templates config:", error);
    if (error.message === "Unauthorized") return new NextResponse("Unauthorized", { status: 401 });
    if (error.message === "Forbidden") return new NextResponse("Forbidden", { status: 403 });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requireAdmin();
    const body = await request.json();
    await updateEmailTemplatesConfig(body, user.uid);
    return new NextResponse("Config updated successfully", { status: 200 });
  } catch (error: any) {
    console.error("Failed to update email templates config:", error);
    if (error.message === "Unauthorized") return new NextResponse("Unauthorized", { status: 401 });
    if (error.message === "Forbidden") return new NextResponse("Forbidden", { status: 403 });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
