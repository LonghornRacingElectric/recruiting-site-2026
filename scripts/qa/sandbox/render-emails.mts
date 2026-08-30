// Render the emails the current step's run would send, for one real applicant
// per team and template, exactly as lib/email/send.ts renders them — into
// HTML files you can open in a browser. Nothing is sent. Emulator only.
//   FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... npx -y tsx scripts/qa/sandbox/render-emails.mts
import "./guard-emulator.mjs"; // must be first: refuses prod-credentialed shells before any app import initialises the Admin SDK
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { emulatorApp, ensureSandboxDir, SANDBOX_DIR } from "./common.mjs";
import { renderTemplate, buildEmailVariables } from "@/lib/email/templates";
import { getEmailTemplatesConfig } from "@/lib/firebase/config";
import { getUserVisibleStatus } from "@/lib/utils/statusUtils";
import { ApplicationStatus } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";

const { db } = emulatorApp("render-emails");
const step = (await db.doc("config/recruiting").get()).data()?.currentStep as RecruitingStep;
const config = await getEmailTemplatesConfig(); // the app's loader — handles the legacy doc shape
const apps = (await db.collection("applications").get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
const triggerMap: Partial<Record<string, string>> = { interview: "interview_offered", trial: "trial_offered", accepted: "accepted", rejected: "rejected", waitlisted: "waitlisted" };

// Mirrors wrapInEmailLayout in lib/email/send.ts (not exported). Keep in sync.
function wrapInEmailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Longhorn Racing</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #bf5700 0%, #d4740a 100%); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                🤘 Longhorn Racing
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; font-size: 15px; line-height: 1.7; color: #374151;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Longhorn Racing &bull; The University of Texas at Austin
              </p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #d1d5db;">
                This is an automated message from the recruiting portal.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

ensureSandboxDir();
const dir = path.join(SANDBOX_DIR, "emails"); mkdirSync(dir, { recursive: true });
const index: string[] = [`<h1>Emails the <code>${step}</code> run would send</h1><p>One real applicant per team and template, rendered with the live templates. Nothing was sent.</p><ul>`];
for (const team of ["Electric", "Solar", "Combustion"]) {
  const templates: any[] = config?.teams?.[team] || [];
  for (const trigger of ["interview_offered", "rejected"]) {
    const template = templates.find((t) => t.trigger === trigger);
    // pick: interview -> someone with one offer, then someone with several; rejected -> anyone
    const candidates = apps.filter((a) => a.team === team && triggerMap[getUserVisibleStatus(a, step)] === trigger && !(a.userEmail || "").includes(".fake") && a.isFakeData !== true);
    const picks = trigger === "interview_offered"
      ? [candidates.find((a) => (a.interviewOffers || []).length === 1), candidates.find((a) => (a.interviewOffers || []).length > 1)].filter(Boolean)
      : [candidates[0]].filter(Boolean);
    if (!template) { index.push(`<li><b>${team} / ${trigger}</b>: NO TEMPLATE — ${candidates.length} applicants would be skipped</li>`); continue; }
    if (!template.enabled) index.push(`<li><b>${team} / ${trigger}</b>: template DISABLED — ${candidates.length} applicants would be skipped</li>`);
    for (const a of picks as any[]) {
      // mirror the trigger route, INCLUDING its empty-offers fallback to the
      // ranking (added so the literal word "General" never reaches anyone)
      const offerSystems = getUserVisibleStatus(a, step) === ApplicationStatus.INTERVIEW
        ? (a.interviewOffers || []).map((o: any) => o.system)
        : (a.preferredSystems || []);
      const systemNames = offerSystems.length ? offerSystems : (a.preferredSystems || []);
      const variables = buildEmailVariables({ applicantName: a.userName || "Applicant", applicantEmail: a.userEmail || "", teamName: team, systemNames });
      const subject = renderTemplate(template.subject, variables);
      const html = wrapInEmailLayout(renderTemplate(template.body, variables));
      const file = `${team}-${trigger}-${(a.interviewOffers || []).length > 1 ? "multi" : "single"}.html`;
      writeFileSync(path.join(dir, file), `<!-- To: ${a.userEmail} | Subject: ${subject} | From: ${team} Team -->\n` + html);
      index.push(`<li><a href="${file}">${team} / ${trigger}${(a.interviewOffers || []).length > 1 ? " (several offers)" : ""}</a> — to ${a.userName}, systems: ${systemNames.join(", ") || "(none)"} — subject: <i>${subject}</i> — ${candidates.length} applicants get this template</li>`);
    }
  }
}
index.push("</ul>");
writeFileSync(path.join(dir, "index.html"), index.join("\n"));
console.log(`open ${path.join(dir, "index.html")}`);
