import type {
  AdminUserDTO,
  ApplicationDetailDTO,
  ApplicationListDTO,
  ApplicationStatus,
  AppSettings,
  AuditListDTO,
  AuthMeDTO,
  CycleDTO,
  CycleStatus,
  DashboardDTO,
  DepartmentDTO,
  NoteDTO,
  PublicConfig,
  ReviewerRef,
  Role,
  SubmittedApplicationDTO,
  SystemDiagnosticsDTO,
} from '@esme/shared';

import { CSRF_HEADER, IDEMPOTENCY_HEADER } from '@esme/shared';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function notifyUnauthorized(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('esme:unauthorized'));
  }
}

function errorFromBody(status: number, body: unknown): ApiError {
  const candidate = body as { error?: { code?: string; message?: string; details?: unknown } } | null;
  const code = candidate?.error?.code ?? 'request_failed';
  const message = candidate?.error?.message ?? 'The request could not be completed.';
  const rawDetails = candidate?.error?.details;
  const details = Array.isArray(rawDetails)
    ? rawDetails.filter(
        (item): item is ApiErrorDetail =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ApiErrorDetail).path === 'string' &&
          typeof (item as ApiErrorDetail).message === 'string',
      )
    : [];
  return new ApiError(status, code, message, details);
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  anonymous?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body;

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  if (csrfToken && (options.method ?? 'GET').toUpperCase() !== 'GET') {
    headers.set(CSRF_HEADER, csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      body,
      headers,
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'We could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const data: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const apiError = errorFromBody(response.status, data);
    if (response.status === 401 && !path.startsWith('/auth/login')) {
      notifyUnauthorized();
    }
    throw apiError;
  }

  return data as T;
}

interface UploadOptions {
  idempotencyKey: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export function uploadApplication(
  formData: FormData,
  options: UploadOptions,
): Promise<SubmittedApplicationDTO & { replayed?: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/public/applications`);
    xhr.withCredentials = true;
    xhr.setRequestHeader(IDEMPOTENCY_HEADER, options.idempotencyKey);
    if (csrfToken) xhr.setRequestHeader(CSRF_HEADER, csrfToken);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onerror = () => {
      reject(
        new ApiError(
          0,
          'network_error',
          'We could not reach the server. Your answers are still on this page, so you can try again.',
        ),
      );
    };

    xhr.onabort = () => {
      reject(new ApiError(0, 'aborted', 'The submission was cancelled.'));
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as SubmittedApplicationDTO & { replayed?: boolean });
        return;
      }
      reject(errorFromBody(xhr.status, parsed));
    };

    if (options.signal) {
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return fallback;
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1] ?? fallback;
}

async function fetchBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'network_error', 'We could not reach the server. Check your connection.');
  }
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    const apiError = errorFromBody(response.status, body);
    if (response.status === 401) notifyUnauthorized();
    throw apiError;
  }
  const filename = filenameFromDisposition(response.headers.get('content-disposition'), 'download');
  return { blob: await response.blob(), filename: filename === 'download' ? null : filename };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadDocument(documentId: number, filename: string): Promise<void> {
  const { blob, filename: serverName } = await fetchBlob(`/admin/documents/${documentId}/download?disposition=attachment`);
  triggerDownload(blob, serverName ?? filename);
}

export async function openDocumentInNewTab(documentId: number): Promise<void> {
  const { blob } = await fetchBlob(`/admin/documents/${documentId}/download?disposition=inline`);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new ApiError(0, 'popup_blocked', 'Your browser blocked the new tab. Allow pop-ups and try again.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  getPublicConfig: (signal?: AbortSignal) => apiRequest<PublicConfig>('/public/config', { signal }),

  login: async (email: string, password: string) => {
    const result = await apiRequest<AuthMeDTO>('/auth/login', {
      method: 'POST',
      json: { email, password },
      anonymous: true,
    });
    setCsrfToken(result.csrfToken);
    return result;
  },

  me: (signal?: AbortSignal) => apiRequest<AuthMeDTO>('/auth/me', { signal }),

  logout: () =>
    apiRequest<void>('/auth/logout', { method: 'POST' }).finally(() => setCsrfToken(null)),

  changePassword: async (currentPassword: string, newPassword: string) => {
    const result = await apiRequest<AuthMeDTO>('/auth/change-password', {
      method: 'POST',
      json: { currentPassword, newPassword },
    });
    setCsrfToken(result.csrfToken);
    return result;
  },

  dashboard: (signal?: AbortSignal) => apiRequest<DashboardDTO>('/admin/dashboard', { signal }),

  applications: (query: Record<string, string | number | boolean | undefined | null>, signal?: AbortSignal) =>
    apiRequest<ApplicationListDTO>(`/admin/applications${buildQuery(query)}`, { signal }),

  application: (id: number | string, signal?: AbortSignal) =>
    apiRequest<ApplicationDetailDTO>(`/admin/applications/${id}`, { signal }),

  reviewers: () => apiRequest<{ items: ReviewerRef[] }>('/admin/reviewers'),

  updateStatus: (
    id: number,
    body: { status: ApplicationStatus; reason?: string; expectedVersion?: number },
  ) =>
    apiRequest<ApplicationDetailDTO>(`/admin/applications/${id}/status`, {
      method: 'PATCH',
      json: body,
    }),

  assign: (id: number, reviewerId: number | null) =>
    apiRequest<ApplicationDetailDTO>(`/admin/applications/${id}/assignee`, {
      method: 'PATCH',
      json: { reviewerId },
    }),

  addNote: (id: number, body: string) =>
    apiRequest<NoteDTO>(`/admin/applications/${id}/notes`, {
      method: 'POST',
      json: { body },
    }),

  bulkStatus: (ids: number[], status: ApplicationStatus, reason?: string) =>
    apiRequest<{ results: { id: number; ok: boolean; message?: string }[]; succeeded: number; failed: number }>(
      '/admin/applications/bulk-status',
      { method: 'POST', json: { ids, status, reason } },
    ),

  exportCsv: async (query: Record<string, string | number | boolean | undefined | null>) => {
    const { blob, filename } = await fetchBlob(`/admin/exports/applications.csv${buildQuery(query)}`);
    triggerDownload(blob, filename ?? `esme-applications-${new Date().toISOString().slice(0, 10)}.csv`);
  },

  getSettings: () => apiRequest<{ settings: AppSettings }>('/admin/settings'),

  updateSettings: (patch: Partial<AppSettings>) =>
    apiRequest<{ settings: AppSettings }>('/admin/settings', { method: 'PATCH', json: patch }),

  getDepartments: () => apiRequest<{ items: DepartmentDTO[] }>('/admin/departments'),

  createDepartment: (body: { name: string; slug?: string; description: string; displayOrder: number; isActive: boolean }) =>
    apiRequest<{ department: DepartmentDTO }>('/admin/departments', { method: 'POST', json: body }),

  updateDepartment: (
    id: number,
    body: Partial<Pick<DepartmentDTO, 'name' | 'slug' | 'description' | 'displayOrder' | 'isActive'>>,
  ) =>
    apiRequest<{ department: DepartmentDTO }>(`/admin/departments/${id}`, {
      method: 'PATCH',
      json: body,
    }),

  getCycles: () => apiRequest<{ items: CycleDTO[] }>('/admin/cycles'),

  createCycle: (body: {
    name: string;
    status: CycleStatus;
    opensAt?: string | null;
    closesAt?: string | null;
    privacyPolicyVersion?: string;
  }) => apiRequest<{ cycle: CycleDTO }>('/admin/cycles', { method: 'POST', json: body }),

  updateCycle: (
    id: number,
    body: {
      name: string;
      status: CycleStatus;
      opensAt?: string | null;
      closesAt?: string | null;
      privacyPolicyVersion?: string;
    },
  ) => apiRequest<{ cycle: CycleDTO }>(`/admin/cycles/${id}`, { method: 'PATCH', json: body }),

  activateCycle: (id: number) =>
    apiRequest<{ activatedId: number }>(`/admin/cycles/${id}/activate`, { method: 'POST' }),

  getAdministrators: () => apiRequest<{ items: AdminUserDTO[] }>('/admin/administrators'),

  createAdministrator: (body: { email: string; displayName: string; role: Role; password: string }) =>
    apiRequest<{ administrator: AdminUserDTO }>('/admin/administrators', { method: 'POST', json: body }),

  updateAdministrator: (id: number, body: { displayName?: string; role?: Role; isActive?: boolean }) =>
    apiRequest<{ administrator: AdminUserDTO }>(`/admin/administrators/${id}`, {
      method: 'PATCH',
      json: body,
    }),

  resetAdministratorPassword: (id: number, newPassword: string) =>
    apiRequest<void>(`/admin/administrators/${id}/password-reset`, {
      method: 'POST',
      json: { newPassword },
    }),

  auditLogs: (query: { page: number; pageSize: number; action?: string; actorId?: number }) =>
    apiRequest<AuditListDTO>(`/admin/audit-logs${buildQuery(query)}`),

  system: () => apiRequest<SystemDiagnosticsDTO>('/admin/system'),

  createBackup: () =>
    apiRequest<{
      createdAt: string;
      databaseBytes: number;
      documentRows: number;
      uploadFiles: number;
      integrity: string;
    }>('/admin/backups', { method: 'POST' }),

  previewRetention: () =>
    apiRequest<{
      enabled: boolean;
      cutoff: string | null;
      applications: { id: number; reference: string; status: string; decidedAt: string | null }[];
      documentCount: number;
      applicantCount: number;
      totalApplications: number;
    }>('/admin/system/retention/preview', { method: 'POST' }),

  cleanupRetention: (confirmation: string) =>
    apiRequest<{ deletedApplications: number; deletedDocuments: number; deletedFiles: number; deletedApplicants: number }>(
      '/admin/system/retention/cleanup',
      { method: 'POST', json: { confirm: confirmation } },
    ),
};
