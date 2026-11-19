import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const accounts = [
  { username: "Arwan", email: "arwan@keuangan.app", password: "123456@", role: "admin" },
  { username: "Resita", email: "resita@keuangan.app", password: "123456!", role: "user" },
] as const;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Bootstrap configuration is incomplete.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const result: { username: string; created: boolean }[] = [];
    const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw users.error;

    for (const account of accounts) {
      const existing = users.data.users.find((user) => user.email?.toLowerCase() === account.email);
      let userId = existing?.id;
      let created = false;

      if (!userId) {
        const createdUser = await adminClient.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { username: account.username },
        });
        if (createdUser.error || !createdUser.data.user) throw createdUser.error || new Error("Could not create account.");
        userId = createdUser.data.user.id;
        created = true;
      }

      const profile = await adminClient
        .from("profiles")
        .upsert({ id: userId, username: account.username, role: account.role }, { onConflict: "id" });
      if (profile.error) throw profile.error;
      result.push({ username: account.username, created });
    }

    return new Response(JSON.stringify({ accounts: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_error) {
    return new Response(JSON.stringify({ error: "Initial accounts could not be prepared." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
