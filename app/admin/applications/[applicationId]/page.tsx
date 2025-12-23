"use client";

import { useParams } from "next/navigation";
import ApplicationDetail from "../_components/ApplicationDetail";

export default function ApplicationDetailPage() {
  const params = useParams();
  const applicationId = params.applicationId as string;

  return <ApplicationDetail key={applicationId} applicationId={applicationId} />;
}
