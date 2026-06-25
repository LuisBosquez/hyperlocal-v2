export const queryKeys = {
  me: () => ['user', 'me'] as const,
  friends: () => ['user', 'me', 'friends'] as const,
  userProfile: (handle: string) => ['user', handle] as const,
  userPlaces: (handle: string) => ['user', handle, 'places'] as const,
  userPlans: (handle: string) => ['user', handle, 'plans'] as const,
  panel: (lat?: number, lng?: number, filter?: string) =>
    ['panel', lat ?? null, lng ?? null, filter ?? 'all'] as const,
  panelAll: () => ['panel'] as const,
  mapPins: () => ['map', 'pins'] as const,
  placeDetail: (placeId: string) => ['place', placeId] as const,
  placeSearch: (q: string, lat?: number, lng?: number) =>
    ['places', 'search', q, lat ?? null, lng ?? null] as const,
  contextualPlaces: (lat?: number, lng?: number) =>
    ['places', 'contextual', lat ?? null, lng ?? null] as const,
  contextualAll: () => ['places', 'contextual'] as const,
  planDetail: (planId: string) => ['plan', planId] as const,
  planJoins: (planId: string) => ['plan', planId, 'joins'] as const,
  planInterests: (planId: string) => ['plan', planId, 'interests'] as const,
  planProposals: (planId: string) => ['plan', planId, 'proposals'] as const,
  inviteLink: (token: string) => ['invite', token] as const,
  notifications: () => ['notifications'] as const,
};
