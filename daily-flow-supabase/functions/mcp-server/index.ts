// Remote MCP server for the GetWeb Task app.
// Exposes admin-scoped tools to MCP clients (e.g. Claude Desktop / Claude.ai connectors).
// Auth: bearer token via `Authorization: Bearer <MCP_ADMIN_TOKEN>`.

import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TOKEN = Deno.env.get("MCP_ADMIN_TOKEN")!;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mcp = new McpServer({ name: "getweb-task", version: "1.0.0" });

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: msg }],
});

// ---------- TASKS ----------
mcp.tool({
  name: "list_tasks",
  description:
    "List tasks across the workspace. Optional filters: user_id, date (YYYY-MM-DD), status (Not Started|In Progress|Finished), limit (default 50).",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string" },
      date: { type: "string" },
      status: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: Record<string, unknown>) => {
    let q = admin
      .from("tasks")
      .select("*, time_sessions(*)")
      .order("created_at", { ascending: false })
      .limit(Number(args.limit ?? 50));
    if (args.user_id) q = q.eq("user_id", String(args.user_id));
    if (args.date) q = q.eq("date", String(args.date));
    if (args.status) q = q.eq("status", String(args.status));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});

mcp.tool({
  name: "create_task",
  description: "Create a task assigned to a team member.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Team member's user_id (auth uid)." },
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      date: { type: "string", description: "YYYY-MM-DD" },
      target_minutes: { type: "number" },
    },
    required: ["user_id", "title", "date"],
  },
  handler: async (a: Record<string, unknown>) => {
    const { data, error } = await admin
      .from("tasks")
      .insert({
        user_id: String(a.user_id),
        title: String(a.title),
        description: a.description ? String(a.description) : null,
        category: a.category ? String(a.category) : "Development",
        date: String(a.date),
        target_minutes: a.target_minutes ? Number(a.target_minutes) : null,
        status: "Not Started",
      })
      .select()
      .single();
    if (error) return err(error.message);
    return ok(data);
  },
});

mcp.tool({
  name: "update_task",
  description: "Update fields on a task by id.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string" },
      date: { type: "string" },
      target_minutes: { type: "number" },
      status: { type: "string" },
      user_id: { type: "string", description: "Reassign to a different user." },
    },
    required: ["id"],
  },
  handler: async (a: Record<string, unknown>) => {
    const { id, ...rest } = a;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) updates[k] = v;
    const { data, error } = await admin
      .from("tasks")
      .update(updates)
      .eq("id", String(id))
      .select()
      .single();
    if (error) return err(error.message);
    return ok(data);
  },
});

mcp.tool({
  name: "complete_task",
  description: "Mark a task as Finished and stop any open time session.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  handler: async (a: Record<string, unknown>) => {
    const id = String(a.id);
    await admin
      .from("time_sessions")
      .update({ end_time: new Date().toISOString() })
      .eq("task_id", id)
      .is("end_time", null);
    const { data, error } = await admin
      .from("tasks")
      .update({ status: "Finished" })
      .eq("id", id)
      .select()
      .single();
    if (error) return err(error.message);
    return ok(data);
  },
});

mcp.tool({
  name: "delete_task",
  description: "Delete a task by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  handler: async (a: Record<string, unknown>) => {
    const { error } = await admin.from("tasks").delete().eq("id", String(a.id));
    if (error) return err(error.message);
    return ok({ deleted: true, id: a.id });
  },
});

// ---------- TIME TRACKING ----------
mcp.tool({
  name: "start_timer",
  description: "Start a time session on a task (sets status to In Progress).",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string" } },
    required: ["task_id"],
  },
  handler: async (a: Record<string, unknown>) => {
    const task_id = String(a.task_id);
    const { data: task } = await admin.from("tasks").select("user_id").eq("id", task_id).single();
    if (!task) return err("Task not found");
    const { data, error } = await admin
      .from("time_sessions")
      .insert({ task_id, start_time: new Date().toISOString(), created_by: task.user_id })
      .select()
      .single();
    if (error) return err(error.message);
    await admin.from("tasks").update({ status: "In Progress" }).eq("id", task_id);
    return ok(data);
  },
});

mcp.tool({
  name: "stop_timer",
  description: "Stop the open time session for a task.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string" } },
    required: ["task_id"],
  },
  handler: async (a: Record<string, unknown>) => {
    const { data, error } = await admin
      .from("time_sessions")
      .update({ end_time: new Date().toISOString() })
      .eq("task_id", String(a.task_id))
      .is("end_time", null)
      .select();
    if (error) return err(error.message);
    return ok(data);
  },
});

// ---------- TEAM ----------
mcp.tool({
  name: "list_team",
  description: "List all team members (profiles).",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const { data, error } = await admin.from("profiles").select("*").order("name");
    if (error) return err(error.message);
    return ok(data);
  },
});

mcp.tool({
  name: "team_activity",
  description: "Get current team activity snapshot (active tasks and today's progress).",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const { data, error } = await admin.rpc("get_team_activity");
    if (error) return err(error.message);
    return ok(data);
  },
});

// ---------- MESSAGES ----------
mcp.tool({
  name: "list_messages",
  description: "List messages, optionally filtered by sender_id, receiver_id, or limit.",
  inputSchema: {
    type: "object",
    properties: {
      sender_id: { type: "string" },
      receiver_id: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (a: Record<string, unknown>) => {
    let q = admin
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Number(a.limit ?? 50));
    if (a.sender_id) q = q.eq("sender_id", String(a.sender_id));
    if (a.receiver_id) q = q.eq("receiver_id", String(a.receiver_id));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});

mcp.tool({
  name: "send_message",
  description: "Send a direct message from one user to another.",
  inputSchema: {
    type: "object",
    properties: {
      sender_id: { type: "string" },
      receiver_id: { type: "string" },
      content: { type: "string" },
    },
    required: ["sender_id", "receiver_id", "content"],
  },
  handler: async (a: Record<string, unknown>) => {
    const { data, error } = await admin
      .from("messages")
      .insert({
        sender_id: String(a.sender_id),
        receiver_id: String(a.receiver_id),
        content: String(a.content),
      })
      .select()
      .single();
    if (error) return err(error.message);
    return ok(data);
  },
});

// ---------- HTTP transport ----------
const transport = new StreamableHttpTransport();
const app = new Hono();

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  await next();
  for (const [k, v] of Object.entries(corsHeaders)) c.res.headers.set(k, v);
});

app.all("/*", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return await transport.handleRequest(c.req.raw, mcp);
});

Deno.serve(app.fetch);
