"use client";

import { useState } from "react";
import { MODELS } from "./model-data";

interface PromptFormProps {
  onSubmit: (prompt: string, model: string) => void;
  disabled?: boolean;
}

export default function PromptForm({ onSubmit, disabled }: PromptFormProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(MODELS[0].id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !disabled) {
      onSubmit(prompt.trim(), model);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
      <div>
        <label
          htmlFor="prompt"
          className="block text-sm font-medium text-zinc-400 mb-2"
        >
          Describe your funnel or website
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., A SaaS landing page funnel for a project management tool with home, features, pricing, and signup pages..."
          rows={5}
          disabled={disabled}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-all disabled:opacity-50"
        />
      </div>

      <div>
        <label
          htmlFor="model"
          className="block text-sm font-medium text-zinc-400 mb-2"
        >
          Choose AI Model
        </label>
        <select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all disabled:opacity-50 appearance-none cursor-pointer"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={disabled || !prompt.trim()}
        className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98]"
      >
        Generate Funnel
      </button>
    </form>
  );
}
