import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setCsrfToken } from './api.js';

type MockResponseInit = {
  status: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
};

function mockResponse({ status, body = null, contentType = 'application/json', headers = {} }: MockResponseInit) {
  const values: Record<string, string> = { 'content-type': contentType, ...headers };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
    json: async () => body,
    blob: async () => new Blob(['payload'], { type: contentType }),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  setCsrfToken(null);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('sends JSON with credentials and returns parsed data', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: { ok: true } }));
    const result = await apiRequest<{ ok: boolean }>('/admin/dashboard', {
      method: 'POST',
      json: { hello: 'world' },
    });
    expect(result).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/dashboard');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ hello: 'world' }));
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('adds the CSRF header to state-changing requests only', async () => {
    setCsrfToken('csrf-token-value');
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: {} }));

    await apiRequest('/admin/applications/1/status', { method: 'PATCH', json: { status: 'reviewing' } });
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).get('x-esme-csrf')).toBe('csrf-token-value');

    await apiRequest('/admin/applications');
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get('x-esme-csrf')).toBeNull();
  });

  it('throws a structured ApiError with validation details', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        status: 400,
        body: {
          error: {
            code: 'validation_error',
            message: 'Some fields need your attention',
            details: [
              { path: 'email', message: 'Invalid email' },
              { nonsense: true },
            ],
          },
        },
      }),
    );

    const error = (await apiRequest('/auth/login', { method: 'POST', json: {} }).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Some fields need your attention',
    });
    expect(error.details).toEqual([{ path: 'email', message: 'Invalid email' }]);
    expect(error.isNetworkError).toBe(false);
  });

  it('falls back to a generic error for non-JSON failures', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 502, contentType: 'text/html' }));
    const error = await apiRequest('/health').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'request_failed' });
  });

  it('maps network failures and preserves aborts', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const network = (await apiRequest('/public/config').catch((e) => e)) as ApiError;
    expect(network).toBeInstanceOf(ApiError);
    expect(network).toMatchObject({ status: 0, code: 'network_error' });
    expect(network.isNetworkError).toBe(true);

    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abort);
    await expect(apiRequest('/public/config')).rejects.toBe(abort);
  });

  it('returns undefined for an empty 204 response', async () => {
    fetchMock.mockResolvedValue(mockResponse({ status: 204 }));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('emits an unauthorized event except for failed logins', async () => {
    const handler = vi.fn();
    window.addEventListener('esme:unauthorized', handler);
    try {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 401, body: { error: { code: 'unauthorized', message: 'Sign in' } } }),
      );
      await expect(apiRequest('/admin/applications')).rejects.toBeInstanceOf(ApiError);
      expect(handler).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 401, body: { error: { code: 'invalid_credentials', message: 'No' } } }),
      );
      await expect(apiRequest('/auth/login', { method: 'POST', json: {} })).rejects.toBeInstanceOf(ApiError);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('esme:unauthorized', handler);
    }
  });
});
