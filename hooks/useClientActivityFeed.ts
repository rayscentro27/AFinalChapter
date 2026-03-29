import useDealTimeline from './useDealTimeline';

export default function useClientActivityFeed(input: Parameters<typeof useDealTimeline>[0]) {
  return useDealTimeline(input);
}