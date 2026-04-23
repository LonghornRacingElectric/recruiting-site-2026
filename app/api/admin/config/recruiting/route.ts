import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import { getRecruitingConfig, updateRecruitingStep } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { appCache } from "@/lib/utils/appCache";
import pino from "pino";

const logger = pino();

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    
    // Try cache first
    const cachedStep = appCache.getRecruitingStep();
    if (cachedStep !== undefined) {
      return NextResponse.json({ config: { currentStep: cachedStep } }, { status: 200 });
    }

    const config = await getRecruitingConfig();
    appCache.setRecruitingStep(config.currentStep);
    
    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch recruiting config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
         return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();
    
    const body = await request.json();
    const { step } = body;

    if (!Object.values(RecruitingStep).includes(step)) {
        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    await updateRecruitingStep(step, uid);
    
    // Update cache
    appCache.setRecruitingStep(step);
    // Invalidate applications because their computed status/ratings depend on the step
    appCache.invalidateApplications();

    return NextResponse.json({ success: true, step });
  } catch (error) {
    logger.error(error, "Failed to update recruiting step");
    
    if (error instanceof Error && error.message === "Unauthorized") {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
       return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
