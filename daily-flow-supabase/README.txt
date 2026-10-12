1. Create a new project at supabase.com. In SQL Editor run in order: 01_schema_public.sql, 03_grants.sql, 04_storage.sql, then (optional) 02_data_public.sql.
   Note: user logins (passwords) are not exported; recreate users (Authentication > Users) or invite them. Data rows reference old user IDs.
2. Install Supabase CLI, run: supabase link --project-ref YOUR_REF ; copy "functions" into supabase/functions ; supabase functions deploy
   (config.toml: set project_id to YOUR_REF; mcp-server and client-report use verify_jwt=false)
3. Secrets: supabase secrets set ELEVENLABS_API_KEY=... AI_API_URL=... AI_API_KEY=... AI_MODEL=... MCP_ADMIN_TOKEN=...
   AI_API_URL must expose an OpenAI-compatible chat-completions endpoint.
4. App .env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID with your new values.
5. Daily recurring tasks: schedule run-recurring-tasks with pg_cron (Database > Cron).
