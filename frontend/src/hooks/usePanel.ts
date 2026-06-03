import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import type { PanelCard } from '../types/api';

export function usePanel() {
  const { center } = useMapStore();
  const { activeFilter } = useUIStore();
  const [lng, lat] = center;

  return useQuery<PanelCard[]>({
    queryKey: queryKeys.panel(lat, lng, activeFilter),
    queryFn: () =>
      api
        .get('/panel', { params: { lat, lng, filter: activeFilter } })
        .then((r) => r.data.data.cards),
    staleTime: 30_000,
    enabled: !!lat,
  });
}
