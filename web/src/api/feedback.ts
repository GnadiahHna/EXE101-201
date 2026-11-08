// src/api/feedback.ts
import { http } from "./http";

export interface FeedbackItem {
  id: number;
  userId?: number;
  appointmentId?: number;
  doctorId?: number;
  patientName: string;
  patientEmail?: string;
  rating: number;
  title?: string;
  comment: string;
  category?: string;
  isAnonymous?: boolean;
  status?: 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED';
  adminResponse?: string;
  adminRespondedAt?: string;
  adminRespondedBy?: number | null;
  adminRespondedByName?: string | null;
  moderatedBy?: number | null;
  moderatedByName?: string | null;
  moderatedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  isOwner?: boolean;
}

export interface CreateFeedbackPayload {
  rating: number;
  title?: string;
  comment: string;
  category?: string;
  isAnonymous?: boolean;
}

export interface FeedbackStats {
  averageRating: number;
  totalFeedbacks: number;
  starCounts: Record<number, number>;
}

export interface FeedbackFilterParams {
  status?: string;
  rating?: number;
  category?: string;
}

export async function fetchMyFeedbacks(): Promise<FeedbackItem[]> {
  const res = await http.get("/feedbacks/my");
  return (res.data?.data ?? res.data) as FeedbackItem[];
}

export async function fetchPublicFeedbacks(): Promise<FeedbackItem[]> {
  const res = await http.get("/feedbacks/public");
  return (res.data?.data ?? res.data) as FeedbackItem[];
}

export async function fetchFeedbackStats(): Promise<FeedbackStats> {
  const res = await http.get("/feedbacks/stats");
  return (res.data?.data ?? res.data) as FeedbackStats;
}

export async function createFeedback(payload: CreateFeedbackPayload): Promise<FeedbackItem> {
  const res = await http.post("/feedbacks", payload);
  return (res.data?.data ?? res.data) as FeedbackItem;
}

export async function updateFeedback(
  id: number,
  payload: CreateFeedbackPayload
): Promise<FeedbackItem> {
  const res = await http.put(`/feedbacks/${id}`, payload);
  return (res.data?.data ?? res.data) as FeedbackItem;
}

export async function deleteFeedback(id: number): Promise<void> {
  await http.delete(`/feedbacks/${id}`);
}

// ==========================================
// UC-ADM-11: Admin Moderation Endpoints
// ==========================================
export async function fetchAdminFeedbacks(params?: FeedbackFilterParams): Promise<FeedbackItem[]> {
  const res = await http.get("/feedbacks/admin/all", { params });
  return (res.data?.data ?? res.data) as FeedbackItem[];
}

export async function respondToFeedbackAdmin(id: number, response: string): Promise<FeedbackItem> {
  const res = await http.post(`/feedbacks/admin/${id}/respond`, { response });
  return (res.data?.data ?? res.data) as FeedbackItem;
}

export async function updateFeedbackStatusAdmin(id: number, status: string): Promise<FeedbackItem> {
  const res = await http.put(`/feedbacks/admin/${id}/status`, { status });
  return (res.data?.data ?? res.data) as FeedbackItem;
}

export async function deleteFeedbackAdmin(id: number): Promise<void> {
  await http.delete(`/feedbacks/admin/${id}`);
}
