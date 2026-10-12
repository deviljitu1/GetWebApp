import { createClient } from 'npm:@supabase/supabase-js@2';
import { JWT } from 'npm:google-auth-library@9.15.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushRequest = {
  recipientIds?: string[];
  title?: string;
  body?: string;
  linkUrl?: string | null;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const readKey = (keySetName: string, legacyName: string) => {
  const directKey = Deno.env.get(legacyName);
  if (directKey) return directKey;
  const keySet = Deno.env.get(keySetName);
  if (!keySet) return undefined;
  try {
    const parsed = JSON.parse(keySet) as Record<string, string>;
    return parsed[legacyName] || parsed.default;
  } catch {
    console.warn(`${keySetName} is not valid JSON`);
    return undefined;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
    const secretKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !publishableKey || !secretKey) {
      return json({ error: 'Server configuration is incomplete' }, 500);
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const { data: role, error: roleError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleError || !role) return json({ error: 'Admin access required' }, 403);

    const payload = (await req.json()) as PushRequest;
    const recipientIds = [...new Set(payload.recipientIds ?? [])];
    const title = payload.title?.trim() ?? '';
    const body = payload.body?.trim() ?? '';
    const linkUrl = payload.linkUrl?.trim() || null;

    if (!recipientIds.length || recipientIds.length > 500) {
      return json({ error: 'Choose between 1 and 500 recipients' }, 400);
    }
    if (!title || title.length > 120 || !body || body.length > 1000) {
      return json({ error: 'Notification title or message is invalid' }, 400);
    }
    if (linkUrl && !linkUrl.startsWith('/')) {
      return json({ error: 'Action link must be an in-app path beginning with /' }, 400);
    }

    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
    const { data: devices, error: deviceError } = await admin
      .from('user_device_tokens')
      .select('token')
      .in('user_id', recipientIds);
    if (deviceError) throw deviceError;

    const { error: notificationError } = await admin.from('notifications').insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        kind: 'broadcast',
        title,
        body,
        link_url: linkUrl,
        is_read: false,
      })),
    );
    if (notificationError) throw notificationError;

    if (!devices?.length) {
      return json({ inAppCreated: recipientIds.length, delivered: 0, failed: 0 });
    }

    const serviceAccountValue = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountValue) {
      return json({
        inAppCreated: recipientIds.length,
        delivered: 0,
        failed: devices.length,
        warning: 'Firebase push delivery is not configured',
      });
    }

    const serviceAccount = JSON.parse(serviceAccountValue) as ServiceAccount;
    const jwt = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const credentials = await jwt.authorize();
    if (!credentials.access_token) throw new Error('Could not authorize Firebase messaging');

    const endpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
    const results = await Promise.all(
      devices.map(async ({ token }) => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: linkUrl ? { link_url: linkUrl } : {},
              android: {
                priority: 'high',
                notification: { channel_id: 'getwebapp_alerts', sound: 'default' },
              },
            },
          }),
        });
        return { token, ok: response.ok, status: response.status };
      }),
    );

    const staleTokens = results.filter((result) => result.status === 404).map((result) => result.token);
    if (staleTokens.length) {
      await admin.from('user_device_tokens').delete().in('token', staleTokens);
    }

    return json({
      inAppCreated: recipientIds.length,
      delivered: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    });
  } catch (error) {
    console.error('send-push-notification failed', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error' }, 500);
  }
});
