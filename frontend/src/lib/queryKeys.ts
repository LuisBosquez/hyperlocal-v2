export const queryKeys = {
  me: () => ['user', 'me'] as const,
  friends: () => ['user', 'me', 'friends'] as const,
  userProfile: (handle: string) => ['user', handle] as const,
  userPlaces: (handle: string) => ['user', handle, 'places'] as const,
  userPlans: (handle: string) => ['user', handle, 'plans'] as const,
  panel: (lat?: number, lng?: number, bbox?: string | null, filter?: string) =>
    ['panel', lat ?? null, lng ?? null, bbox ?? null, filter ?? 'all'] as const,
  panelAll: () => ['panel'] as const,
  mapPins: (lat?: number, lng?: number, bbox?: string | null) =>
    ['map', 'pins', lat ?? null, lng ?? null, bbox ?? null] as const,
  mapPinsAll: () => ['map', 'pins'] as const,
  planPins: (lat?: number, lng?: number, bbox?: string | null) =>
    ['map', 'plan-pins', lat ?? null, lng ?? null, bbox ?? null] as const,
  planPinsAll: () => ['map', 'plan-pins'] as const,
  citySearch: (q: string) => ['geo', 'cities', q] as const,
  mySignal: () => ['user', 'me', 'signal'] as const,
  openFriends: () => ['user', 'me', 'friends', 'open-today'] as const,
  followers: () => ['user', 'me', 'followers'] as const,
  following: () => ['user', 'me', 'following'] as const,
  myPlaces: () => ['user', 'me', 'places'] as const,
  placeDetail: (placeId: string) => ['place', placeId] as const,
  placeSearch: (q: string, lat?: number, lng?: number) =>
    ['places', 'search', q, lat ?? null, lng ?? null] as const,
  contextualPlaces: (lat?: number, lng?: number, bbox?: string | null) =>
    ['places', 'contextual', lat ?? null, lng ?? null, bbox ?? null] as const,
  contextualAll: () => ['places', 'contextual'] as const,
  area: (lat?: number, lng?: number) => ['geo', 'area', lat ?? null, lng ?? null] as const,
  myLists: (placeId?: string) => ['lists', 'me', placeId ?? null] as const,
  myListsAll: () => ['lists', 'me'] as const,
  userLists: (handle: string) => ['lists', 'user', handle] as const,
  listDetail: (listId: string) => ['list', listId] as const,
  planDetail: (planId: string) => ['plan', planId] as const,
  planJoins: (planId: string) => ['plan', planId, 'joins'] as const,
  planInterests: (planId: string) => ['plan', planId, 'interests'] as const,
  planProposals: (planId: string) => ['plan', planId, 'proposals'] as const,
  inviteLink: (token: string) => ['invite', token] as const,
  notifications: () => ['notifications'] as const,
};
