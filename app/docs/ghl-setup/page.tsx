import Link from "next/link";

export default function GHLSetupPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">GHL Setup Guide</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Intro */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Getting Started</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            To connect your GoHighLevel (GHL) account, you need three pieces of information:
            your <strong>API Key</strong>, <strong>Location ID</strong>, and <strong>User ID</strong>.
            Follow the steps below to find each one.
          </p>
        </div>

        {/* Step 1: API Key */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">1</span>
            <h3 className="text-base font-semibold text-gray-900">Find your API Key</h3>
          </div>
          <ol className="text-sm text-gray-600 leading-relaxed space-y-2 ml-10 list-decimal">
            <li>Log in to your GoHighLevel account.</li>
            <li>Navigate to <strong>Settings</strong> (gear icon in the bottom-left sidebar).</li>
            <li>Under <strong>Business Profile</strong>, click <strong>Company</strong>.</li>
            <li>Scroll down to the <strong>API Key</strong> section.</li>
            <li>Copy the API key displayed there. If none exists, click <strong>Generate API Key</strong>.</li>
          </ol>
          <div className="mt-3 ml-10 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-800">
            <strong>Important:</strong> Keep your API key secret. Never share it publicly or commit it to version control.
          </div>
        </div>

        {/* Step 2: Location ID */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">2</span>
            <h3 className="text-base font-semibold text-gray-900">Find your Location ID</h3>
          </div>
          <ol className="text-sm text-gray-600 leading-relaxed space-y-2 ml-10 list-decimal">
            <li>In GHL, go to <strong>Settings</strong> &gt; <strong>Business Profile</strong> &gt; <strong>Company</strong>.</li>
            <li>Your <strong>Location ID</strong> (also called &quot;Company ID&quot;) is displayed on this page.</li>
            <li>Alternatively, look at the URL in your browser — it often contains the Location ID after <code className="bg-gray-100 px-1 rounded">/location/</code>.</li>
          </ol>
        </div>

        {/* Step 3: User ID */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">3</span>
            <h3 className="text-base font-semibold text-gray-900">Find your User ID</h3>
          </div>
          <ol className="text-sm text-gray-600 leading-relaxed space-y-2 ml-10 list-decimal">
            <li>In GHL, go to <strong>Settings</strong> &gt; <strong>My Staff</strong> (or <strong>Team Management</strong>).</li>
            <li>Click on your name or the user you want to assign appointments to.</li>
            <li>The <strong>User ID</strong> is shown in the user&apos;s profile details, or in the URL when viewing a team member&apos;s profile.</li>
          </ol>
          <div className="mt-3 ml-10 rounded-lg bg-blue-50 border border-blue-200 px-3.5 py-2.5 text-sm text-blue-800">
            <strong>Tip:</strong> The User ID is used to assign calendar appointments. Make sure the user has access to the calendars you want to use.
          </div>
        </div>

        {/* Back to settings */}
        <div className="text-center pt-2">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
