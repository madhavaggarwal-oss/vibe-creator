/**
 * Migrate local /data/*.json funnels and /data/snapshots/*.html
 * to Supabase, linked to a specific user.
 *
 * Usage:
 *   node scripts/migrate-local-to-user.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USER_ID = "463ec292-041c-46d1-b241-dd57d070c965"; // madhav.aggarwal@gohighlevel.com
const DATA_DIR = path.join(projectRoot, "data");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");

async function migrateFunnels() {
  const files = await fs.readdir(DATA_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  console.log(`Found ${jsonFiles.length} funnel files.`);

  let ok = 0;
  let fail = 0;

  for (const file of jsonFiles) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
      const funnel = JSON.parse(raw);
      const isReact = funnel.files && Object.keys(funnel.files).length > 0;

      const { error } = await supabase.from("funnels").upsert(
        {
          id: funnel.id,
          user_id: USER_ID,
          name: funnel.name || funnel.pages?.[0]?.title || funnel.prompt?.slice(0, 60) || "Untitled",
          prompt: funnel.prompt,
          model: funnel.model,
          project_type: isReact ? "react" : "html",
          has_calendar: funnel.hasCalendar || false,
          file_count: isReact ? Object.keys(funnel.files).length : 0,
          page_count: funnel.pages?.length || 0,
          first_page_title: funnel.pages?.[0]?.title || "Untitled",
          preview_slug: funnel.pages?.[0]?.slug || "home",
          files: funnel.files || {},
          chat_history: funnel,
          created_at: funnel.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`  FAIL: ${file} — ${error.message}`);
        fail++;
      } else {
        ok++;
      }
    } catch (err) {
      console.error(`  FAIL: ${file} — ${err.message}`);
      fail++;
    }
  }

  console.log(`Funnels: ${ok} OK, ${fail} failed.\n`);
}

async function migrateSnapshots() {
  let files;
  try {
    files = await fs.readdir(SNAPSHOTS_DIR);
  } catch {
    console.log("No snapshots directory — skipping.");
    return;
  }

  const htmlFiles = files.filter((f) => f.endsWith(".html"));
  console.log(`Found ${htmlFiles.length} snapshot files.`);

  let ok = 0;
  let fail = 0;

  for (const file of htmlFiles) {
    try {
      const funnelId = file.replace(".html", "");
      const html = await fs.readFile(path.join(SNAPSHOTS_DIR, file), "utf-8");

      const { error } = await supabase.from("snapshots").upsert(
        {
          funnel_id: funnelId,
          html,
          created_at: new Date().toISOString(),
        },
        { onConflict: "funnel_id" }
      );

      if (error) {
        console.error(`  FAIL: ${file} — ${error.message}`);
        fail++;
      } else {
        ok++;
      }
    } catch (err) {
      console.error(`  FAIL: ${file} — ${err.message}`);
      fail++;
    }
  }

  console.log(`Snapshots: ${ok} OK, ${fail} failed.\n`);
}

async function main() {
  console.log("=== Migrating local data to madhav.aggarwal@gohighlevel.com ===\n");
  await migrateFunnels();
  await migrateSnapshots();
  console.log("=== Done ===");
}

main().catch(console.error);
