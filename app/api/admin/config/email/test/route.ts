import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { sendTestEmail } from "@/lib/email/send";
import { recordAudit } from "@/lib/firebase/audit";

export async function POST(request: Request) {
  try {
    const { user: actor } = await requireAdmin();
    const body = await request.json();
    const { to, subject, body: emailBody, variables } = body;
    
    if (!to || !subject || !emailBody) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    await sendTestEmail({ to, subject, body: emailBody, variables: variables || {} });
    await recordAudit(request, actor, { action: "emails.trigger", detail: `test email to @${String(to).split("@")[1] ?? "?"}` });
    return new NextResponse("Test email sent", { status: 200 });
  } catch (error: any) {
    console.error("Failed to send test email:", error);
    if (error.message === "Unauthorized") return new NextResponse("Unauthorized", { status: 401 });
    if (error.message === "Forbidden") return new NextResponse("Forbidden", { status: 403 });
    return new NextResponse(error.message || "Internal Server Error", { status: 500 });
  }
}
