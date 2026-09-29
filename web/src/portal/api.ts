const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

/** Files the API serves itself (owner-uploaded listing photos: "/uploads/..."), made absolute. */
export const mediaUrl = (path: string): string => (/^https?:/.test(path) ? path : `${API_URL.replace(/\/api\/?$/, '')}${path}`);

export class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type Role = 'RESIDENT' | 'ACCOUNTANT' | 'ADMIN';

export type Account = {
  id: string;
  name: string;
  email: string;
  role: Role;
  unit?: { block: string; number: string } | null;
};

export type ChargeStatus = 'DUE' | 'PAID' | 'OVERDUE';
export type Charge = {
  id: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  status: ChargeStatus;
  dueDate: string;
};

export type AdminCharge = Charge & { unit: { block: string; number: string } };

export type ProjectMilestone = {
  id: string;
  title: string;
  done: boolean;
  order: number;
  completedAt: string | null;
};
export type Project = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  progressPct: number;
  startDate: string | null;
  eta: string | null;
  budget: number | null;
  contractor: string | null;
  milestones?: ProjectMilestone[];
};

export type VoteChoice = 'YES' | 'NO' | 'ABSTAIN';
export type VoteSummary = {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  closesAt: string;
  tally: Record<string, number>;
  totalVotes: number;
  myChoice: VoteChoice | null;
};

export type ResidentRequest = {
  id: string;
  type: 'ISSUE' | 'RENOVATION';
  category: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
};

export type GvDocument = { id: string; title: string; category: string; createdAt: string };

export type AmenitySpace = { id: string; name: string };
export type AmenityBooking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  space: AmenitySpace;
};

export type Overview = {
  balance: number;
  openVotesCount: number;
  activeRequestsCount: number;
  recentProjects: Project[];
};

// ---------- Admin ----------
export type AdminOverview = {
  units: number;
  openVotes: number;
  openRequests: number;
  newInquiries: number;
  activeProjects: number;
};

export type AdminVote = {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  closesAt: string;
  tally: Record<string, number>;
  totalVotes: number;
};

export type AdminRequest = {
  id: string;
  type: 'ISSUE' | 'RENOVATION';
  category: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  unit: { block: string; number: string };
  account: { name: string; email: string };
};

export type ResidentUnit = {
  id: string;
  block: string;
  number: string;
  sizeSqm: number | null;
  floorPlanUrl: string | null;
  registrationNo: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  dataNotes: string | null;
  account: { id: string; name: string; email: string; role: Role } | null;
};

export type Inquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
};

// ---------- My Residence ----------
export type BlockImage = { id: string; block: string; url: string; caption: string | null; order: number };

export type ListingType = 'SALE' | 'RENT';
export type ListingStatus = 'PENDING' | 'REVIEWING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
export type ListingPhoto = { id: string; url: string; width: number; height: number; order: number };
export type Furnished = 'FURNISHED' | 'SEMI_FURNISHED' | 'UNFURNISHED';

export type ListingRequest = {
  id: string;
  type: ListingType;
  askingPrice: number | null;
  availableFrom: string | null;
  leaseDuration: string | null;
  furnished: Furnished | null;
  /** Shown on the public listing once approved. */
  description: string | null;
  /** For building management only. */
  notes: string | null;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
  photos: ListingPhoto[];
};

export type AdminListingRequest = ListingRequest & {
  unit: { block: string; number: string };
  account: { name: string; email: string };
};

export type MyResidence = {
  unit: { id: string; block: string; number: string; sizeSqm: number | null; floorPlanUrl: string | null };
  blockImages: BlockImage[];
  listingRequests: ListingRequest[];
};
