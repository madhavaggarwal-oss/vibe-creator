"use client";

import { useState } from "react";
import HighLevelLayout from "@/components/highlevel-layout";
import VibeSitePage from "@/components/vibe-site-page";
import FunnelsPage from "@/components/funnels-page";

export default function Home() {
  const [activeTab, setActiveTab] = useState("Vibe Creator");

  return (
    <HighLevelLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "Vibe Creator" && <VibeSitePage />}
      {activeTab === "Funnels" && <FunnelsPage />}
      {activeTab !== "Vibe Creator" && activeTab !== "Funnels" && (
        <div className="flex flex-col items-center justify-center h-full text-center py-20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">{activeTab}</h2>
          <p className="mt-1 text-sm text-gray-500">This section is coming soon.</p>
        </div>
      )}
    </HighLevelLayout>
  );
}
