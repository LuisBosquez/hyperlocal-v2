from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

feed_bp = Blueprint('feed', __name__, url_prefix='/api/v1')


@feed_bp.route('/panel', methods=['GET'])
@require_auth
def get_panel():
    """
    Return an ordered array of panel cards for the authenticated user.
    Cards include: notifications, plans from friends, and nearby saved places.
    """
    filter_param = request.args.get('filter', 'all')
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)

    sb = get_supabase()
    cards: list[dict] = []

    if filter_param in ('all', 'notifications'):
        notifs = (
            sb.table('notifications')
            .select('*')
            .eq('user_id', g.user_id)
            .order('created_at', desc=True)
            .limit(10)
            .execute()
        )
        for n in (notifs.data or []):
            cards.append({'type': 'notification', **n})

    if filter_param in ('all', 'plans'):
        following = sb.table('follows').select('followee_id').eq('follower_id', g.user_id).execute()
        followee_ids = [r['followee_id'] for r in (following.data or [])]
        if followee_ids:
            plans = (
                sb.table('plans')
                .select('*, places(name)')
                .in_('organizer_id', followee_ids)
                .eq('is_cancelled', False)
                .order('created_at', desc=True)
                .limit(20)
                .execute()
            )
            for p in (plans.data or []):
                cards.append({'type': 'plan', **p})

    if filter_param in ('all', 'places'):
        saved = (
            sb.table('user_places')
            .select('*, places(name, lat, lng)')
            .eq('user_id', g.user_id)
            .limit(20)
            .execute()
        )
        for s in (saved.data or []):
            cards.append({'type': 'place', **s})

    return jsonify({'data': {'cards': cards}, 'error': None}), 200
