import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { CommandPalette } from "@/components/CommandPalette";
import { ToastProvider } from "@/components/ToastProvider";
import { ConfirmProvider } from "@/components/ConfirmProvider";

export const metadata: Metadata = {
  title: "Platr",
  description: "Household meal planning — Today, Plan, Pantry, Shop.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Platr",
  },
};

export const viewport: Viewport = {
  themeColor: "#EEF1F4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* impeccable direction contract — seed 3f5e5012 (assigned dir 6, superseded by user-chosen canon)
        THESIS: Platr is a household's food operation as one calm, dense productivity tool — the category
          standard at Linear's craft — refusing the friendly rounded-card + food-photo + soft-green planner
          look and its Notion-lite opposite.
        OWN-WORLD: Light cool-neutral canvas (#FBFBFC), white surfaces with hairline borders and 1px shadows,
          near-black text, one indigo accent (#4F5BD5) used sparingly, system typography with tight tracking,
          tabular mono numerals, 8px radii.
        STORY: The returning cook opens Today, sees at a glance what to cook/eat next and progress vs goal,
          and moves through pantry/shop/nutrition without the loop drifting.
        FIRST VIEWPORT: Today — neutral header (date + small TODAY eyebrow), a compact calorie/macro readout,
          "Next cooking" and agenda rows as clean white cards; primary action a single indigo button.
        FORM: Category-standard productivity UI (canon, user-chosen craft bar: Linear).
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md. */}
        <ToastProvider>
          <ConfirmProvider>
            <div className="app">
              <ViewTransition>{children}</ViewTransition>
            </div>
            <BottomNav />
            <CommandPalette />
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
