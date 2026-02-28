"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface AllowedUser {
  email: string;
  name: string | null;
}

export default function ImpersonatePage() {
  const router = useRouter();
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/admin/users");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 403) {
          setError("You do not have admin access.");
          setLoading(false);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        } else {
          setError("Failed to load users.");
        }
      } catch {
        setError("Failed to load users.");
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [router]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleImpersonate = async (email: string) => {
    if (impersonating) return;
    setImpersonating(email);

    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast("error", data.error || "Failed to impersonate");
        setImpersonating(null);
        return;
      }

      const { emailOtp } = await res.json();

      // Verify the OTP client-side to log in as the target user
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: emailOtp,
        type: "email",
      });

      if (verifyError) {
        console.error("[impersonate] verifyOtp error:", verifyError);
        showToast("error", "Failed to verify OTP");
        setImpersonating(null);
        return;
      }

      // Successfully logged in as the target user
      router.push("/");
      router.refresh();
    } catch {
      showToast("error", "Failed to impersonate");
      setImpersonating(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Impersonate User</h2>
            <p className="mt-1 text-sm text-gray-500">
              Log in as any whitelisted user. No email will be sent to them.
            </p>
          </div>

          {/* User list */}
          {loading ? (
            <div className="px-6 py-12 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            </div>
          ) : error ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">No users found.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((u) => (
                <div
                  key={u.email}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.name || u.email}
                    </p>
                    {u.name && (
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleImpersonate(u.email)}
                    disabled={impersonating !== null}
                    className="ml-4 shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {impersonating === u.email ? "Logging in..." : "Login as"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg animate-[fadeInUp_0.2s_ease-out] ${
            toast.type === "success" ? "bg-gray-800" : "bg-red-600"
          }`}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {toast.type === "success" ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            )}
          </svg>
          {toast.message}
        </div>
      )}
    </div>
  );
}
