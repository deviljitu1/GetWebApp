import { Tables, Enums } from '@/integrations/supabase/types';

export type MemberType = Enums<'employee_type'>;
export type TaskStatus = Enums<'task_status'>;
export type AppRole = Enums<'app_role'>;
export type TaskPriority = Enums<'task_priority'>;
export type ApprovalStatus = Enums<'approval_status'>;
export type ProjectStatus = Enums<'project_status'>;
export type RecurrenceCadence = Enums<'recurrence_cadence'>;

export type Profile = Tables<'profiles'>;
export type TimeSession = Tables<'time_sessions'>;
export type UserRoleRow = Tables<'user_roles'>;
export type Client = Tables<'clients'>;
export type Project = Tables<'projects'>;
export type TaskComment = Tables<'task_comments'>;
export type TaskAttachment = Tables<'task_attachments'>;
export type RecurringTemplate = Tables<'recurring_task_templates'>;
export type ReportShareLink = Tables<'report_share_links'>;
export type Notification = Tables<'notifications'>;
export type DailyStandup = Tables<'daily_standups'>;

export interface TaskWithSessions extends Tables<'tasks'> {
  time_sessions: TimeSession[];
}

export interface ProfileWithRole extends Profile {
  role: AppRole;
}

export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
export const PROJECT_STATUSES: ProjectStatus[] = ['Active', 'On Hold', 'Completed'];
export const CADENCES: RecurrenceCadence[] = ['daily', 'weekly', 'monthly'];


export interface AuthUser {
  id: string;
  userId: string;
  name: string;
  email: string;
  memberType: MemberType;
  isActive: boolean;
  role: AppRole;
}

export const MEMBER_TYPES: MemberType[] = [
  'Developer',
  'Graphic Designer',
  'Digital Marketer',
  'Video Editor',
  'Content Writer',
  'SEO Executive',
  'Sales',
  'Other',
];

export const TASK_CATEGORIES = [
  'Development',
  'Design',
  'Marketing',
  'Content',
  'SEO',
  'Sales',
  'Meeting',
  'Other',
];
