import os
import httpx
from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

places_bp = Blueprint('places', __name__, url_prefix='/api/v1/places')


@places_bp.route('/search', methods=['GET'])
@require_auth
def search_places():
    q = request.args.get('q', '').strip()
    lat = request.args.get('lat')
    lng = request.args.get('lng')
    if not q:
        return jsonify({'data': [], 'error': None}), 200

    token = os.environ.get('MAPBOX_TOKEN', '')
    params = {'q': q, 'access_token': token, 'types': 'poi', 'limit': 10}
    if lat and lng:
        params['proximity'] = f'{lng},{lat}'

    resp = httpx.get('https://api.mapbox.com/geocoding/v5/mapbox.places/' + q + '.json', params=params)
    features = resp.json().get('features', []) if resp.is_success else []
    results = [
        {
            'place_id': f['id'],
            'name': f['text'],
            'address': f.get('place_name', ''),
            'coordinates': {'lng': f['center'][0], 'lat': f['center'][1]},
        }
        for f in features
    ]
    return jsonify({'data': results, 'error': None}), 200


@places_bp.route('/contextual', methods=['GET'])
@require_auth
def contextual_places():
    return jsonify({'data': [], 'error': None, 'route': 'places/contextual'}), 200


@places_bp.route('/<place_id>', methods=['GET'])
@require_auth
def get_place(place_id: str):
    sb = get_supabase()
    result = sb.table('places').select('*').eq('google_place_id', place_id).single().execute()
    return jsonify({'data': result.data, 'error': None}), 200


@places_bp.route('/<place_id>/save', methods=['POST'])
@require_auth
def save_place(place_id: str):
    body = request.get_json(silent=True) or {}
    note = body.get('note', '')
    sb = get_supabase()
    result = (
        sb.table('user_places')
        .upsert({'user_id': g.user_id, 'place_id': place_id, 'note': note})
        .execute()
    )
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 201


@places_bp.route('/<place_id>/save', methods=['DELETE'])
@require_auth
def unsave_place(place_id: str):
    sb = get_supabase()
    sb.table('user_places').delete().eq('user_id', g.user_id).eq('place_id', place_id).execute()
    return jsonify({'data': None, 'error': None}), 204
