"use client";

import { Responsive } from "@/components/Responsive";
import { MobileShop } from "@/views/mobile/ShopView";
import { DesktopShop } from "@/views/desktop/ShopView";

export default function ShopPage() {
  return <Responsive mobile={<MobileShop />} desktop={<DesktopShop />} />;
}
