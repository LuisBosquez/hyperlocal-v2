import type { PanelCard as PanelCardType } from '../../types/api';
import { NotificationCard } from './NotificationCard';
import { PlanCard } from './PlanCard';
import { PlaceCard } from './PlaceCard';

export function PanelCard({ card }: { card: PanelCardType }) {
  switch (card.type) {
    case 'notification': return <NotificationCard card={card} />;
    case 'plan':         return <PlanCard card={card} />;
    case 'place':        return <PlaceCard card={card} />;
  }
}
