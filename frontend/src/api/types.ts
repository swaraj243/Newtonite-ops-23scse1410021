export type MembershipRole = "VIEWER" | "MEMBER" | "LEAD" | "ADMIN";
export type WorkItemType =
  | "INCIDENT"
  | "CUSTOMER_ISSUE"
  | "PAYMENT"
  | "COMPLIANCE"
  | "TASK";
export type WorkItemPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type WorkItemStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "AWAITING_APPROVAL"
  | "RESOLVED"
  | "CLOSED";

export type Membership = {
  teamId: string;
  teamName: string;
  role: MembershipRole;
};

export type UserSummary = {
  id: string;
  email: string;
  name: string;
};

export type AuthUser = UserSummary & {
  memberships: Membership[];
};

export type DemoUser = {
  id: string;
  email: string;
  name: string;
  memberships: Membership[];
};

export type Team = {
  id: string;
  name: string;
};

export type WorkItemListItem = {
  id: string;
  title: string;
  description: string;
  type: WorkItemType;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  teamId: string;
  assigneeId: string | null;
  createdById: string;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  team: Team;
  assignee: UserSummary | null;
  createdBy: UserSummary;
};

export type ActivityEvent = {
  id: string;
  workItemId: string;
  actorId: string;
  eventType: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
  actor: UserSummary;
};

export type Comment = {
  id: string;
  workItemId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: UserSummary;
};

export type WorkItemDetail = WorkItemListItem & {
  comments: Comment[];
  activityEvents: ActivityEvent[];
};

export type ItemsListResponse = {
  items: WorkItemListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
};

export type DashboardView =
  | "all"
  | "assigned_to_me"
  | "unassigned_urgent"
  | "awaiting_approval";

export type ItemsQuery = {
  status?: WorkItemStatus | "";
  priority?: WorkItemPriority | "";
  type?: WorkItemType | "";
  teamId?: string;
  q?: string;
  view?: DashboardView;
  cursor?: string | null;
  limit?: number;
};

export type ApiErrorBody = {
  error?: string;
  currentItem?: WorkItemListItem;
};
