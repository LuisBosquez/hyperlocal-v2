export const queryKeys = {
  me: () => ['user', 'me'] as const,
  friends: () => ['user', 'me', 'friends'] as const,
  userProfile: (handle: string) => ['user', handle] as const,
  userFollowers: (handle: string) => ['user', handle, 'followers'] as const,
  userFollowing: (handle: string) => ['user', handle, 'following'] as const,
  panel: (lat?: number, lng?: number, filter?: string) =>
    ['panel', lat ?? null, lng ?? null, filter ?? 'all'] as const,
  mapPlaces: (bounds: [number, number, number, number]) =>
    ['map', 'places', ...bounds] as const,
  placeDetail: (placeId: string) => ['place', placeId] as const,
  placeSearch: (q: string, lat: number, lng: number) =>
    ['places', 'search', q, lat, lng] as const,
  contextualPlaces: (lat: number, lng: number) =>
    ['places', 'contextual', lat, lng] as const,
  planDetail: (planId: string) => ['plan', planId] as const,
  planJoins: (planId: string) => ['plan', planId, 'joins'] as const,
  planInterests: (planId: string) => ['plan', planId, 'interests'] as const,
  inviteLink: (token: string) => ['invite', token] as const,
};
