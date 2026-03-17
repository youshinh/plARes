## 2025-02-12 - Information Leakage in API Error Responses
**Vulnerability:** Raw exception strings (`str(exc)`) were directly injected into JSON payload responses and sent to clients when the Gemini `CreateAuthToken` or `CreateInteraction` API calls failed.
**Learning:** Because the Google GenAI SDK can raise `APIError` wrapping HTTP responses, and those URLs might include API keys as URL parameters (e.g. `?key=YOUR_API_KEY`), returning the unhandled exception string could leak critical platform secrets or internal server path details directly to untrusted clients.
**Prevention:** Never reflect `str(exc)` in client-facing responses. Always log the explicit error server-side via `logging.getLogger(__name__).error(f"... {exc}")` and return an opaque, generic error message (e.g. `"An internal error occurred."`) to the user.

## 2025-05-15 - Insufficient Firestore ID Validation
**Vulnerability:** Firestore document and collection IDs were only checked for "/" and ".." characters, allowing empty strings, single periods, and reserved names (e.g. "__reserved__").
**Learning:** Firestore has specific constraints for IDs. While path traversal ("/") is the most critical, failing to block other illegal patterns like "." or reserved names can lead to API errors or logical vulnerabilities where internal state is shadowed or accessible via unexpected paths.
**Prevention:** Implement a centralized validation helper for all database identifiers that blocks "/", "..", ".", empty strings, and "__.*__" patterns.
## 2026-03-17 - Prevent Path Traversal in WebSocket IDs
**Vulnerability:** User-controlled inputs `user_id` and `room_id` parsed from the WebSocket query URL were used directly to construct filesystem paths (e.g., `/runtime/users/{user_id}/profile.json` and `/runtime/match_logs/{room_id}_...`). A malicious actor could provide values like `../../etc/passwd` leading to Path Traversal vulnerabilities when saving profiles and match logs.
**Learning:** Values extracted via `parse_qs` from request URLs are entirely untrusted and can contain any string characters, including dots and slashes.
**Prevention:** Always explicitly sanitize identifier strings that will be used in filesystem operations immediately upon extraction or directly before path construction using a restrictive whitelist, such as `re.sub(r'[^a-zA-Z0-9_-]', '_', val)`.
