from ..extensions import get_supabase


def are_mutual_friends(user_id_a: str, user_id_b: str) -> bool:
    """Return True if user_a follows user_b AND user_b follows user_a."""
    sb = get_supabase()
    result = (
        sb.table('follows')
        .select('follower_id, followee_id')
        .or_(
            f'and(follower_id.eq.{user_id_a},followee_id.eq.{user_id_b}),'
            f'and(follower_id.eq.{user_id_b},followee_id.eq.{user_id_a})'
        )
        .execute()
    )
    rows = result.data or []
    ids = {(r['follower_id'], r['followee_id']) for r in rows}
    return (user_id_a, user_id_b) in ids and (user_id_b, user_id_a) in ids
