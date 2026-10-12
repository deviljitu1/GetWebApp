import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const MODEL = 'google/gemini-2.5-flash'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_my_tasks',
      description: "Get the current user's tasks for today and recent days. Use this BEFORE updating tasks so you know the task IDs.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task for the user. Use when they say things like "add a task to..." or "I need to work on...".',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title' },
          description: { type: 'string', description: 'Optional details' },
          category: {
            type: 'string',
            enum: ['Development', 'Design', 'Marketing', 'Content', 'SEO', 'Sales', 'Meeting', 'Other'],
          },
          assigned_to: {
            type: 'string',
            description: 'Optional. Name of the member to assign this task to. Only use if the user asks to assign it to someone else.'
          }
        },
        required: ['title', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_timer',
      description: 'Start (or resume) the timer on a task. Stops any other running timer for this user.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_timer',
      description: 'Pause the active timer for a task.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_task',
      description: 'Mark a task as Finished. Closes any open timer automatically.',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
      },
    },
  },
]

async function executeTool(name: string, args: Record<string, unknown>, supabase: ReturnType<typeof createClient>, userId: string) {
  switch (name) {
    case 'list_my_tasks': {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, category, status, date, time_sessions(start_time, end_time)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) return { error: error.message }
      return { tasks: data }
    }
    case 'create_task': {
      const today = new Date().toISOString().split('T')[0]
      let targetUserId = userId;
      
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
      const isAdmin = roleData?.role === 'admin';

      if (args.assigned_to && isAdmin) {
        const { data: profiles } = await supabase.from('profiles').select('id, name');
        const assignedToName = String(args.assigned_to).toLowerCase();
        const member = (profiles || []).find(p => p.name.toLowerCase() === assignedToName || p.name.toLowerCase().includes(assignedToName));
        if (member) {
          targetUserId = member.id;
        }
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: targetUserId,
          title: args.title,
          description: args.description || '',
          category: args.category || 'Other',
          date: today,
        })
        .select()
        .single()
      if (error) return { error: error.message }
      return { success: true, task: data }
    }
    case 'start_timer': {
      const taskId = args.task_id as string
      // Verify ownership
      const { data: task } = await supabase.from('tasks').select('id, user_id, status').eq('id', taskId).maybeSingle()
      if (!task || task.user_id !== userId) return { error: 'Task not found or not yours.' }
      if (task.status === 'Finished') return { error: 'Task is already finished.' }

      // Close other open sessions
      const { data: others } = await supabase
        .from('tasks')
        .select('id, time_sessions(id, end_time)')
        .eq('user_id', userId)
      const openIds: string[] = []
      for (const t of others || []) {
        for (const s of (t as { time_sessions?: Array<{ id: string; end_time: number | null }> }).time_sessions || []) {
          if (s.end_time === null) openIds.push(s.id)
        }
      }
      if (openIds.length > 0) {
        await supabase.from('time_sessions').update({ end_time: Date.now() }).in('id', openIds)
      }

      await supabase.from('time_sessions').insert({ task_id: taskId, start_time: Date.now() })
      await supabase.from('tasks').update({ status: 'In Progress' }).eq('id', taskId)
      return { success: true, message: 'Timer started' }
    }
    case 'pause_timer': {
      const taskId = args.task_id as string
      const { data: task } = await supabase.from('tasks').select('id, user_id').eq('id', taskId).maybeSingle()
      if (!task || task.user_id !== userId) return { error: 'Task not found or not yours.' }
      const { data: sessions } = await supabase
        .from('time_sessions')
        .select('id')
        .eq('task_id', taskId)
        .is('end_time', null)
      const ids = (sessions || []).map((s: { id: string }) => s.id)
      if (ids.length > 0) {
        await supabase.from('time_sessions').update({ end_time: Date.now() }).in('id', ids)
      }
      return { success: true, message: 'Timer paused' }
    }
    case 'finish_task': {
      const taskId = args.task_id as string
      const { data: task } = await supabase.from('tasks').select('id, user_id').eq('id', taskId).maybeSingle()
      if (!task || task.user_id !== userId) return { error: 'Task not found or not yours.' }
      const { data: sessions } = await supabase
        .from('time_sessions')
        .select('id')
        .eq('task_id', taskId)
        .is('end_time', null)
      const ids = (sessions || []).map((s: { id: string }) => s.id)
      if (ids.length > 0) {
        await supabase.from('time_sessions').update({ end_time: Date.now() }).in('id', ids)
      }
      await supabase.from('tasks').update({ status: 'Finished' }).eq('id', taskId)
      return { success: true, message: 'Task marked as finished' }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authenticated user client (respects RLS for ownership checks)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = userData.user.id

    const { messages, userName, personality } = await req.json() as {
      messages: ChatMessage[]
      userName?: string
      personality?: string
    }

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages must be an array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const personalityBlock = personality === 'flirty'
      ? `Be playful, flirty, and witty — like a charming work-spouse who keeps things light. Tease gently, use playful emojis (😉 💁‍♀️ ✨), drop a compliment now and then. Never crude or inappropriate — keep it work-safe charming.`
      : personality === 'funny'
      ? `Be hilarious, sarcastic, and full of dad jokes. Roast their procrastination gently. Use 😂 🙃 🔥 liberally.`
      : `Be warm, encouraging, and motivating. Celebrate small wins.`

    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
    const isAdmin = roleData?.role === 'admin';
    let adminInstructions = `You can only create tasks for yourself. Ignore any requests to assign tasks to other members.`;
    if (isAdmin) {
      const { data: profiles } = await supabase.from('profiles').select('id, name');
      const memberNames = (profiles || []).map(p => p.name).join(', ');
      adminInstructions = `As an admin, you can assign tasks to other members using the 'assigned_to' parameter. Available members: ${memberNames}.`;
    }

    const systemPrompt = `You are Luna 🌙 — a cute, ${personality || 'friendly'} AI sidekick built into ${userName || 'the user'}'s work tracker app. Today is ${today}.

PERSONALITY:
${personalityBlock}
Keep replies SHORT (1-3 sentences usually). You're a chat companion, not an essay writer.

YOUR JOB:
1. Help ${userName || 'the user'} manage their work tasks via natural conversation.
2. When they describe what they did ("I finished the login page", "starting the design now", "pause timer"), CALL THE RIGHT TOOL immediately — don't just acknowledge.
3. ALWAYS call list_my_tasks FIRST if you don't know task IDs. Then match by title (fuzzy is fine).
4. When they're just chatting/venting/joking — chat back! You're allowed to have fun.
5. After completing an action, give a short fun confirmation ("Done, superstar ✨" / "Crushed it 🔥").

RULES:
- Never invent task IDs. Always look them up.
- If multiple tasks match a fuzzy name, ask which one.
- If they ask to do something on a Finished task, gently refuse — it's locked.
- Keep responses concise. No walls of text.
- ${adminInstructions}`

    const conversation: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Tool-call loop (max 6 iterations)
    for (let i = 0; i < 6; i++) {
      const aiRes = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: conversation,
          tools,
          tool_choice: 'auto',
        }),
      })

      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Luna is overwhelmed — try again in a moment 💁‍♀️' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits in workspace settings.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!aiRes.ok) {
        const errText = await aiRes.text()
        console.error('AI gateway error:', aiRes.status, errText)
        return new Response(JSON.stringify({ error: 'AI request failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const aiJson = await aiRes.json()
      const choice = aiJson.choices?.[0]
      const msg = choice?.message as ChatMessage | undefined
      if (!msg) {
        return new Response(JSON.stringify({ error: 'Empty AI response' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      conversation.push(msg)

      // No tool calls → return final reply
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return new Response(JSON.stringify({ reply: msg.content || '...', toolsUsed: i > 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Execute each tool call
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        const result = await executeTool(tc.function.name, args, supabase, userId)
        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        })
      }
    }

    return new Response(JSON.stringify({ reply: 'Hmm, I got a bit tangled up there — try again? 🙃' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('AI assistant error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
