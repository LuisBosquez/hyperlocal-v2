import re

from flask import Blueprint, request, g

from ..middleware import require_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..domain import HANDLE_RE
from ..devdb import DuplicateError

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


def _handle_suggestions(handle: str) -> list[str]:
    sb = get_supabase()
    candidates = [f'{handle}{n}'[:30] for n in (1, 2, 7)] + [f'{handle}_sea'[:30], f'the_{handle}'[:30]]
    candidates = [c for c in candidates if re.fullmatch(HANDLE_RE, c)]
    if not candidates:
        return []
    taken = sb.table('users').select('handle').in_('handle', candidates).execute()
    taken_set = {r['handle'] for r in (taken.data or [])}
    return [c for c in candidates if c not in taken_set][:3]


@auth_bp.route('/session', methods=['POST'])
@require_auth
def session():
    """Return the current user and whether onboarding is needed (Flow 1, J1.5)."""
    sb = get_supabase()
    result = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    user = result.data if result else None
    needs_onboarding = user is None or not user.get('handle')
    return ok({'user': user, 'needs_onboarding': needs_onboarding})


@auth_bp.route('/onboard', methods=['POST'])
@require_auth
def onboard():
    """Create the profile row: unique handle + display name (Flow 1, J1.3/J1.4/J1.6)."""
    body = request.get_json(silent=True) or {}
    handle = (body.get('handle') or '').strip().lower()
    display_name = (body.get('display_name') or '').strip() or handle

    if not re.fullmatch(HANDLE_RE, handle):
        return err('VALIDATION_ERROR', 422,
                   'Handles are 3-30 characters: lowercase letters, numbers, underscores.',
                   fields={'handle': 'INVALID_FORMAT'})

    sb = get_supabase()
    existing = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    me = existing.data if existing else None
    if me and me.get('handle'):
        if me['handle'] == handle:
            return ok(me)  # idempotent re-submit (J1.6)
        return err('CONFLICT', 409, 'Account already onboarded.')

    try:
        if me:
            result = sb.table('users').update({'handle': handle, 'display_name': display_name}).eq('id', g.user_id).execute()
        else:
            result = sb.table('users').insert({
                'id': g.user_id, 'handle': handle, 'display_name': display_name,
            }).execute()
    except DuplicateError:
        return err('CONFLICT', 409, 'That handle is taken.',
                   fields={'handle': 'TAKEN', 'suggestions': _handle_suggestions(handle)})
    except Exception as e:
        if '23505' in str(e) or 'duplicate' in str(e).lower():
            return err('CONFLICT', 409, 'That handle is taken.',
                       fields={'handle': 'TAKEN', 'suggestions': _handle_suggestions(handle)})
        raise
    return ok(result.data[0] if result.data else None, 201)


@auth_bp.route('/me', methods=['GET'])
@require_auth
def me():
    sb = get_supabase()
    result = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    return ok(result.data if result else None)
