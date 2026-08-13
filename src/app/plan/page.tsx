"use client";

import { Responsive } from "@/components/Responsive";
import { MobilePlan } from "@/views/mobile/PlanView";
import { DesktopPlan } from "@/views/desktop/PlanView";

export default function PlanPage() {
  return <Responsive mobile={<MobilePlan />} desktop={<DesktopPlan />} />;
}
