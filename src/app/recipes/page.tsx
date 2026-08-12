"use client";

import { Responsive } from "@/components/Responsive";
import { MobileRecipes } from "@/views/mobile/RecipesView";
import { DesktopRecipes } from "@/views/desktop/RecipesView";

export default function RecipesPage() {
  return <Responsive mobile={<MobileRecipes />} desktop={<DesktopRecipes />} />;
}
