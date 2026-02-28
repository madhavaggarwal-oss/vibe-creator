/**
 * Migration script: Upload local /data/*.json funnels and /data/snapshots/*.html
 * to Supabase Postgres.
 *
 * Usage:
 *   node scripts/migrate-to-supabase.mjs
 *
 * Requires .env.local to have:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Load .env.local
dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_DIR = path.join(projectRoot, "data");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");

async function migrateFunnels() {
  console.log("Reading local funnel files...");

  let files;
  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    console.error(`Data directory not found at ${DATA_DIR}`);
    process.exit(1);
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  console.log(`Found ${jsonFiles.length} funnel files.`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const funnel = JSON.parse(raw);

      const isReact = !!funnel.files && Object.keys(funnel.files).length > 0;

      const { error } = await supabase.from("funnels").upsert(
        {
          id: funnel.id,
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
        errorCount++;
      } else {
        console.log(`  OK: ${file} (${funnel.id})`);
        successCount++;
      }
    } catch (err) {
      console.error(`  FAIL: ${file} — ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\nFunnels: ${successCount} migrated, ${errorCount} failed.\n`);
}

async function migrateSnapshots() {
  console.log("Reading local snapshot files...");

  let files;
  try {
    files = await fs.readdir(SNAPSHOTS_DIR);
  } catch {
    console.log("No snapshots directory found — skipping.");
    return;
  }

  const htmlFiles = files.filter((f) => f.endsWith(".html"));
  console.log(`Found ${htmlFiles.length} snapshot files.`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of htmlFiles) {
    const funnelId = file.replace(".html", "");
    const filePath = path.join(SNAPSHOTS_DIR, file);

    try {
      const html = await fs.readFile(filePath, "utf-8");

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
        errorCount++;
      } else {
        console.log(`  OK: ${file}`);
        successCount++;
      }
    } catch (err) {
      console.error(`  FAIL: ${file} — ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\nSnapshots: ${successCount} migrated, ${errorCount} failed.\n`);
}

async function main() {
  console.log("=== Supabase Migration ===\n");
  await migrateFunnels();
  await migrateSnapshots();
  console.log("=== Migration Complete ===");
}

main().catch(console.error);
