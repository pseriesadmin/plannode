import { w as writable } from "./index.js";
import { createClient } from "@supabase/supabase-js";
import { g as get_store_value } from "./ssr.js";
const cloudSyncBadge = writable("synced");
function markCloudWorkspaceDirty() {
  return;
}
const SUPABASE_URL = String("https://ljpdikmnptocjwcpyecm.supabase.co").trim();
const SUPABASE_ANON_KEY = String("sb_publishable_bARSkhZwRGMePcTMRRPkDA_WA0B88eB").trim();
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const supabase = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || PLACEHOLDER_ANON_KEY,
  { auth: { persistSession: typeof window !== "undefined" } }
);
const authUser = writable(null);
const authLoading = writable(true);
function getAuthEmail() {
  const u = get_store_value(authUser);
  const e = u?.email ?? u?.user_metadata?.email;
  if (!e || typeof e !== "string") return null;
  return e.trim().toLowerCase();
}
function getAuthUserId() {
  return get_store_value(authUser)?.id ?? null;
}
export {
  authLoading as a,
  authUser as b,
  cloudSyncBadge as c,
  getAuthEmail as d,
  getAuthUserId as g,
  markCloudWorkspaceDirty as m,
  supabase as s
};
