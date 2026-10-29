import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public', 'config'],
    queryFn: ({ signal }) => api.getPublicConfig(signal),
    staleTime: 60_000,
    retry: 1,
  });
}
