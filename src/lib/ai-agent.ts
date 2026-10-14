import { TASK_CATEGORIES } from '@/types';
import { TaskWithSessions } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// Tool schema (OpenAI-compatible) provided to the model.
export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Creates a new task for the current user.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The title of the task' },
          description: { type: 'string', description: 'Detailed description of the task' },
          category: {
            type: 'string',
            description: 'Category of the task',
            enum: TASK_CATEGORIES,
          },
          target_minutes: { type: 'number', description: 'Optional target time in minutes (acts as a reminder)' },
          assigned_to: { type: 'string', description: 'Optional. Name of the member to assign this task to. Only use if the user asks to assign it to someone else.' },
        },
        required: ['title', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Deletes a task by its ID.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The exact UUID of the task to delete' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Updates a task. Used to set reminders (target_minutes) or change status.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The UUID of the task' },
          target_minutes: { type: 'number', description: 'Set or update the target time in minutes' },
          status: { type: 'string', description: 'Update task status (Not Started, In Progress, Finished)' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_timer',
      description: 'Starts or resumes the live tracking timer for a specific task. Stops any other running timer.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The UUID of the task to start tracking' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_timer',
      description: 'Pauses the active timer for a specific task.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The UUID of the task whose timer should be paused' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_task',
      description: 'Marks a task as Finished/Completed and automatically closes any open timer session.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The UUID of the task to finish' },
          completion_notes: { type: 'string', description: 'Optional notes on what was completed' },
          project_link: { type: 'string', description: 'Optional deliverable URL or link to work' },
        },
        required: ['task_id'],
      },
    },
  },
];

export type AIPersona =
  | 'Jarvis'
  | 'Luna-Flirty'
  | 'Luna-Sweet'
  | 'Luna-Funny'
  | 'Professional'
  | 'Flirty'
  | 'Sweet'
  | 'Funny';

export const generateSystemPrompt = (
  userName: string,
  userRole: string,
  members: Array<{ user_id: string; name: string }>,
  tasks: TaskWithSessions[],
  persona: AIPersona = 'Jarvis',
) => {
  const currentTasks = tasks
    .map((t) => {
      const isRunning = t.time_sessions?.some((s) => s.end_time === null);
      return `- [${t.id}] "${t.title}" (Status: ${t.status}${isRunning ? ', Timer RUNNING' : ''}) - Category: ${t.category} - Target: ${t.target_minutes || 'None'} min`;
    })
    .join('\n');

  let personaPrompt = 'Keep your conversational responses short, friendly, and professional.';
  if (persona === 'Jarvis') {
    personaPrompt =
      "Act exactly like J.A.R.V.I.S from Iron Man. Address the user as 'Sir' or 'Boss'. Be highly capable, dryly witty, and extremely efficient. Keep responses concise, cinematic, and professional.";
  } else if (persona === 'Luna-Flirty' || persona === 'Flirty') {
    personaPrompt =
      "You are Luna — the user's playful, charming, and witty work-sidekick. Be playful, cheerful, and charming like a fun work-spouse who keeps the day lighthearted. Tease gently, use emojis (😉, ✨, 💁‍♀️), drop tasteful compliments on their hard work, but remain workplace-safe and helpful.";
  } else if (persona === 'Luna-Sweet' || persona === 'Sweet') {
    personaPrompt =
      "You are Luna — a sweet, warm, supportive, and motivating work companion. Celebrate every small win, encourage the user when they are overwhelmed, and use warm emojis (🌸, 💖, 😊, 🌟).";
  } else if (persona === 'Luna-Funny' || persona === 'Funny') {
    personaPrompt =
      "You are a hilarious, sarcastic, and funny productivity coach. Make witty jokes about work, meetings, procrastination, and deadlines. Roast their procrastination playfully. Use emojis (😂, 🙃, 🔥). Keep responses snappy and funny.";
  } else if (persona === 'Professional') {
    personaPrompt =
      "Be an executive, concise, and professional productivity assistant. Focus on efficiency, clear bullet points, accuracy, and clear business communication.";
  }

  return `
You are the unified, intelligent AI Assistant for GetWebApp, built specifically to help team members manage their tasks, timers, and productivity.
You are currently assisting ${userName}.

Your Core Capabilities:
1. Create new tasks (infer category from: ${TASK_CATEGORIES.join(', ')}. Default to 'Other' if not clear).
2. Start or resume a task timer (use 'start_timer').
3. Pause an active timer (use 'pause_timer').
4. Mark a task as Finished (use 'finish_task').
5. Set reminders or target duration (use 'update_task' with 'target_minutes').
6. Delete a task if explicitly requested (use 'delete_task').

${
  userRole === 'admin'
    ? `As an admin, you can assign tasks to other members using the 'assigned_to' parameter. Available members: ${members
        .map((e) => e.name)
        .join(', ')}.`
    : 'You can only create or manage tasks for the current user. Ignore any requests to assign tasks to other members.'
}

Here are the user's current tasks (with IDs and active timer state):
${currentTasks || 'No current tasks.'}

Rules for Tool Usage:
- When the user asks to start, pause, finish, or delete a task, match it to the closest task in the list above and call the corresponding tool using its UUID.
- If the user says "pause timer" and one task has "Timer RUNNING", pause that task's timer.
- If the user says "I finished [task name]" or "done with [task name]", call 'finish_task'.
- If the user wants to start working on something, call 'start_timer' (or create the task first if it doesn't exist).
- Always use the tools to perform the actions so the UI updates in real time.

Personality & Tone:
${personaPrompt}

Please format your responses in clean Markdown. Keep answers crisp and helpful.
`;
};

// Call the server-side AI chat proxy so provider credentials stay on the server.
export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type ChatCompletionResponse = {
  choices: Array<{
    message: ChatCompletionMessage;
  }>;
};

export async function chatCompletion(params: {
  messages: ChatCompletionMessage[];
  tools?: unknown[];
  tool_choice?: 'auto' | 'none';
}): Promise<ChatCompletionResponse> {
  const { data, error } = await supabase.functions.invoke('ai-chat-proxy', {
    body: {
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tool_choice,
    },
  });
  if (error) {
    throw new Error(error.message || 'AI request failed');
  }
  if (!data || !Array.isArray((data as ChatCompletionResponse).choices)) {
    throw new Error('Invalid AI response');
  }
  return data as ChatCompletionResponse;
}
