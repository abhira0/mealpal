"use client";

import { Responsive } from "@/components/Responsive";
import { MobilePantry } from "@/views/mobile/PantryView";
import { DesktopPantry } from "@/views/desktop/PantryView";

export default function PantryPage() {
  return <Responsive mobile={<MobilePantry />} desktop={<DesktopPantry />} />;
}
