import { useMemo } from 'react';
import { ReviewItem } from '../services/adminReviewService';
import { buildFreshnessBuckets } from '../services/reviewAnalyticsService';

export function useFreshnessSummary(items: ReviewItem[]) {
  return useMemo(() => buildFreshnessBuckets(items), [items]);
}