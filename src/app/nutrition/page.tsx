"use client";

import { Responsive } from "@/components/Responsive";
import { MobileNutrition } from "@/views/mobile/NutritionView";
import { DesktopNutrition } from "@/views/desktop/NutritionView";

export default function NutritionPage() {
  return <Responsive mobile={<MobileNutrition />} desktop={<DesktopNutrition />} />;
}
