"use client";

import { useState, useEffect } from "react";

const STATUS_MESSAGES = [
  "Analyzing your requirements...",
  "Designing page layouts...",
  "Crafting visual elements...",
  "Building navigation structure...",
  "Adding responsive styles...",
  "Generating page content...",
  "Polishing the design...",
  "Connecting all pages...",
  "Finalizing your funnel...",
];

export default function GeneratingOverlay() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 3000);

    const dotInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);

    return () => {
      clearInterval(msgInterval);
      clearInterval(dotInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md">
      <div className="flex flex-col items-center gap-8 px-6 text-center">
        {/* Animated rings */}
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 rounded-full border-2 border-[#FEC403]/30 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-[#2896FB]/30 animate-ping [animation-delay:0.3s]" />
          <div className="absolute inset-4 rounded-full border-2 border-[#4BCF29]/30 animate-ping [animation-delay:0.6s]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-[#FEC403] via-[#2896FB] to-[#4BCF29] animate-pulse shadow-lg shadow-blue-500/30" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#FEC403] via-[#2896FB] to-[#4BCF29] rounded-full animate-progress" />
        </div>

        {/* Status message */}
        <div className="space-y-2">
          <p className="text-lg font-medium text-gray-800 transition-all duration-300">
            {STATUS_MESSAGES[messageIndex]}{dots}
          </p>
          <p className="text-sm text-gray-500">
            This may take a minute depending on the model
          </p>
        </div>
      </div>
    </div>
  );
}
