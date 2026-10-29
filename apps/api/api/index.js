import { URL } from 'node:url';
import handler from '../dist/serverless.js';

export default function bridge(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const originalPath = url.searchParams.get('__original');
  if (originalPath) {
    url.searchParams.delete('__original');
    const query = url.searchParams.toString();
    request.url = `/api/${originalPath}${query ? `?${query}` : ''}`;
  }
  return handler(request, response);
}
