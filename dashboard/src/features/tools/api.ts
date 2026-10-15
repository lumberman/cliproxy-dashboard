import { apiClient } from '@/services/api/client';
import { parseUsageQueue } from './logic';

export const usageQueueApi = {
  pop: async (count: number, signal?: AbortSignal): Promise<unknown[]> =>
    parseUsageQueue(
      await apiClient.get<unknown>('/observability/usage/queue', { params: { count }, signal })
    ),
};
