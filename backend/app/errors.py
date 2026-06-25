"""Standard response envelope + error codes (tech/08 §2).

Every endpoint returns: { "data": ..., "error": null } on success or
{ "data": null, "error": { "code": "SNAKE_CASE", "message": "...", "fields": {...}? } }.
"""
from flask import jsonify


def ok(data, status: int = 200):
    return jsonify({'data': data, 'error': None}), status


def err(code: str, status: int, message: str | None = None, fields: dict | None = None):
    body = {'code': code}
    if message:
        body['message'] = message
    if fields:
        body['fields'] = fields
    return jsonify({'data': None, 'error': body}), status
