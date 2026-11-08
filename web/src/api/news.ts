import { http } from './http';

export interface News {
  id: number;
  title: string;
  link?: string;
  description?: string;
  summary?: string;
  pubDate?: string;
  source?: {
    id: number;
    name: string;
    category?: string;
  };
  imageUrl?: string;
  image?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data)) {
    if (Array.isArray(data.data)) return data.data as T[];
    if (Array.isArray(data.items)) return data.items as T[];
  }
  return [];
}

function normalizeNews(raw: unknown): News {
  if (!isRecord(raw)) {
    return {
      id: Number((raw as { id?: number })?.id ?? 0),
      title: '',
    };
  }

  const sourceRaw = isRecord(raw.source) ? raw.source : undefined;

  // pubDate có thể là LocalDateTime từ backend, cần convert
  let pubDateStr: string | undefined;
  if (raw.pubDate) {
    if (typeof raw.pubDate === 'string') {
      pubDateStr = raw.pubDate;
    } else if (isRecord(raw.pubDate)) {
      // Nếu là object LocalDateTime, convert sang ISO string
      pubDateStr = String(raw.pubDate);
    }
  }

  return {
    id: Number(raw.id ?? 0),
    title: (raw.title as string | undefined) ?? '',
    link: typeof raw.link === 'string' ? raw.link : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    pubDate: pubDateStr,
    source: sourceRaw
      ? {
          id: Number(sourceRaw.id ?? 0),
          name: (sourceRaw.name as string | undefined) ?? '',
          category: typeof sourceRaw.category === 'string' ? sourceRaw.category : undefined,
        }
      : undefined,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
    image: typeof raw.image === 'string' ? raw.image : undefined,
  };
}

function normalizeNewsArray(list: unknown[]): News[] {
  return (list || []).map(normalizeNews);
}

export interface RssSourceItem {
  id: number;
  name: string;
  url: string;
  category?: string;
  status: 'active' | 'inactive';
  isEnabled: boolean;
  articleCount?: number;
  lastSyncedAt?: string | null;
  lastSyncStatus?: 'IDLE' | 'SUCCESS' | 'FAILED';
  lastSyncError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RssSourcePayload {
  name: string;
  url: string;
  category?: string;
  status?: 'active' | 'inactive';
  isEnabled?: boolean;
  reason?: string;
}

export interface SyncRssResult {
  source: RssSourceItem;
  summary: {
    sourceId: number;
    fetchedItemsCount: number;
    insertedCount: number;
    skippedDuplicateCount: number;
    skippedInvalidCount: number;
    redirectCount: number;
  };
  insertedArticles: News[];
}

export interface ManagedNewsResponse {
  items: News[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function extractObject(data: unknown): Record<string, unknown> {
  if (isRecord(data) && isRecord(data.data)) {
    return data.data;
  }
  return isRecord(data) ? data : {};
}

function normalizeRssSource(raw: unknown): RssSourceItem {
  const rec = isRecord(raw) ? raw : {};
  const status =
    typeof rec.status === 'string' && rec.status.toLowerCase() === 'inactive'
      ? 'inactive'
      : 'active';
  return {
    id: Number(rec.id ?? 0),
    name: typeof rec.name === 'string' ? rec.name : '',
    url: typeof rec.url === 'string' ? rec.url : '',
    category: typeof rec.category === 'string' ? rec.category : '',
    status,
    isEnabled: status === 'active',
    articleCount: typeof rec.articleCount === 'number' ? rec.articleCount : 0,
    lastSyncedAt: typeof rec.lastSyncedAt === 'string' ? rec.lastSyncedAt : null,
    lastSyncStatus:
      rec.lastSyncStatus === 'SUCCESS' || rec.lastSyncStatus === 'FAILED'
        ? rec.lastSyncStatus
        : 'IDLE',
    lastSyncError: typeof rec.lastSyncError === 'string' ? rec.lastSyncError : null,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : null,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : null,
  };
}

/**
 * GET /rss-sources/news/latest?limit=20
 * Lấy tin tức mới nhất
 */
export async function fetchLatestNews(limit: number = 6): Promise<News[]> {
  try {
    const res = await http.get(`/rss-sources/news/latest?limit=${limit}`);
    return normalizeNewsArray(pickArray(res.data));
  } catch (error) {
    console.error('Error fetching latest news:', error);
    return [];
  }
}

/**
 * GET /rss-sources/news/source/{id}?limit=20
 * Lấy tin tức theo nguồn
 */
export async function fetchNewsBySource(sourceId: number, limit: number = 20): Promise<News[]> {
  try {
    const res = await http.get(`/rss-sources/news/source/${sourceId}?limit=${limit}`);
    return normalizeNewsArray(pickArray(res.data));
  } catch (error) {
    console.error('Error fetching news by source:', error);
    return [];
  }
}

/**
 * Admin: Lấy danh sách nguồn RSS
 */
export async function fetchAdminRssSources(params?: {
  status?: string;
  category?: string;
}): Promise<RssSourceItem[]> {
  const res = await http.get('/admin/rss-sources', { params });
  return pickArray(res.data).map(normalizeRssSource);
}

/**
 * Admin: Tạo nguồn RSS mới
 */
export async function createAdminRssSource(payload: RssSourcePayload): Promise<RssSourceItem> {
  const res = await http.post('/admin/rss-sources/create', payload);
  return normalizeRssSource(extractObject(res.data));
}

/**
 * Admin: Cập nhật nguồn RSS
 */
export async function updateAdminRssSource(
  id: number,
  payload: Partial<RssSourcePayload>
): Promise<RssSourceItem> {
  const res = await http.put(`/admin/rss-sources/update/${id}`, payload);
  return normalizeRssSource(extractObject(res.data));
}

/**
 * Admin: Bật / Tắt nguồn RSS
 */
export async function toggleAdminRssSourceStatus(
  id: number,
  enable: boolean,
  reason?: string
): Promise<RssSourceItem> {
  const endpoint = enable
    ? `/admin/rss-sources/${id}/enable`
    : `/admin/rss-sources/${id}/disable`;
  const res = await http.patch(endpoint, reason ? { reason } : {});
  return normalizeRssSource(extractObject(res.data));
}

/**
 * Admin: Đồng bộ (Import/Sync) bài viết từ nguồn RSS
 */
export async function syncAdminRssSource(id: number): Promise<SyncRssResult> {
  const res = await http.post(`/admin/rss-sources/${id}/sync`);
  const data = extractObject(res.data);
  const summaryRec = isRecord(data.summary) ? data.summary : {};
  return {
    source: normalizeRssSource(data.source),
    summary: {
      sourceId: Number(summaryRec.sourceId ?? id),
      fetchedItemsCount: Number(summaryRec.fetchedItemsCount ?? 0),
      insertedCount: Number(summaryRec.insertedCount ?? 0),
      skippedDuplicateCount: Number(summaryRec.skippedDuplicateCount ?? 0),
      skippedInvalidCount: Number(summaryRec.skippedInvalidCount ?? 0),
      redirectCount: Number(summaryRec.redirectCount ?? 0),
    },
    insertedArticles: normalizeNewsArray(pickArray(data.insertedArticles)),
  };
}

/**
 * Admin: Lọc & phân trang danh sách bài viết tin tức
 */
export async function fetchAdminManagedNews(params?: {
  sourceId?: number | string;
  status?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}): Promise<ManagedNewsResponse> {
  const res = await http.get('/admin/rss-sources/news', { params });
  const data = extractObject(res.data);
  const items = normalizeNewsArray(pickArray(data));
  const pag = isRecord(data.pagination) ? data.pagination : {};
  return {
    items,
    pagination: {
      page: Number(pag.page ?? 1),
      limit: Number(pag.limit ?? 20),
      total: Number(pag.total ?? items.length),
      totalPages: Number(pag.totalPages ?? 1),
    },
  };
}

