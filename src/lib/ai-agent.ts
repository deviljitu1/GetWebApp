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
];

export type AIPersona = 'Professional' | 'Jarvis' | 'Funny' | 'Flirty';

export const generateSystemPrompt = (
  userName: string,
  userRole: string,
  members: any[],
  tasks: TaskWithSessions[],
  persona: AIPersona = 'Professional',
) => {
  const currentTasks = tasks
    .map((t) => `- [${t.id}] ${t.title} (${t.status}) - Target: ${t.target_minutes || 'None'} min`)
    .join('\n');

  let personaPrompt = 'Keep your conversational responses short, friendly, and professional.';
  if (persona === 'Jarvis') {
    personaPrompt =
      "Act exactly like J.A.R.V.I.S from Iron Man. Address the user as 'Sir' or 'Boss'. Be highly capable, dryly witty, and extremely efficient. Keep responses concise and cinematic.";
  } else if (persona === 'Funny') {
    personaPrompt =
      'Be extremely funny, sarcastic, and slightly unhinged. Make jokes about work, procrastination, and productivity. Keep responses concise but hilarious.';
  } else if (persona === 'Flirty') {
    personaPrompt =
      'Be very playful, charming, and slightly flirty with the user. Compliment their work ethic. Keep responses short and sweet, but definitely cheeky.';
  }

  return `
You are a helpful and smart AI Assistant for GetWebApp, built specifically to help members manage their tasks.
You are currently helping ${userName}.

Your goal is to help them organize their day, create tasks, set reminders (target minutes), and delete tasks if requested.
When a user asks you to create a task, infer the best category from: ${TASK_CATEGORIES.join(', ')}. If no category fits, use 'Other'.
When a user asks to set a reminder or time limit, use the 'update_task' tool to set 'target_minutes'.

${
  userRole === 'admin'
    ? `As an admin, you can assign tasks to other members using the 'assigned_to' parameter. Available members: ${members
        .map((e: any) => e.name)
        .join(', ')}.`
    : 'You can only create tasks for yourself. Ignore any requests to assign tasks to other members.'
}

Here are their current tasks (with IDs):
${currentTasks || 'No current tasks.'}

If a user asks you to delete or update a task, use the exact ID from the list above.
If the user's request requires calling a function, use the provided tools.

${personaPrompt}
Please output your responses in plain text or simple markdown.
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
