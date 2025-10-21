from flask import Flask, request, jsonify
from keycloak import KeycloakOpenID
from datetime import datetime
import base64
import json
import time
import psycopg2
from flask_cors import CORS
from keycloak.exceptions import KeycloakAuthenticationError
app = Flask(__name__)

# Keycloak 設定
keycloak_openid = KeycloakOpenID(
    server_url="http://127.0.0.1:8001/auth/",
    client_id="flask-api",
    realm_name="demo",
)

# PostgreSQL 設定
conn = psycopg2.connect(
    host="127.0.0.1",
    dbname="demo",
    user="root",
    password="thi168168"
)
cursor = conn.cursor()

CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False,
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
@app.route("/")
def index():
    return jsonify({"message": "Flask API running. Use /api/data or /api/logs"})


@app.route("/api/data")
def protected_api():
    auth = request.headers.get("Authorization", "")
    if not auth:
        return jsonify({"error": "missing token"}), 401

    parts = auth.split()
    token = ""
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
    else:
        token = auth.strip()  # 兼容客戶端直接傳純 token

    if not token:
        return jsonify({"error": "invalid authorization header"}), 401

    # 觀察 token 內容（僅解析 payload，不驗簽），便於除錯 401 問題
    try:
        parts = token.split(".")
        if len(parts) == 3:
            payload_b64 = parts[1] + "==="  # base64url padding
            payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
            claims = json.loads(payload_json)
            exp = claims.get("exp")
            iat = claims.get("iat")
            nbf = claims.get("nbf")
            aud = claims.get("aud")
            azp = claims.get("azp")
            iss = claims.get("iss")
            now = int(time.time())
            app.logger.warning(
                "jwt payload: iss=%s aud=%s azp=%s iat=%s nbf=%s exp=%s now=%s",
                iss,
                aud,
                azp,
                iat,
                nbf,
                exp,
                now,
            )
    except Exception as e:
        app.logger.warning("decode jwt payload failed: %s", e)

    try:
        userinfo = keycloak_openid.userinfo(token)
    except KeycloakAuthenticationError as e:
        app.logger.error("userinfo failed: code=%s url=%s body=%s", e.response_code, getattr(e, "url", None), e.response_body)
        return jsonify({
            "error": "invalid token",
            "code": e.response_code,
            "url": getattr(e, "url", None),
            "body": e.response_body.decode() if isinstance(e.response_body, (bytes, bytearray)) else e.response_body,
        }), 401
    except Exception as e:
        app.logger.exception("userinfo failed (unexpected)")
        return jsonify({"error": "invalid token", "detail": str(e)}), 401

    username = userinfo.get("preferred_username")
    roles = userinfo.get("realm_access", {}).get("roles", [])

    # 紀錄 API 呼叫
    cursor.execute(
        "INSERT INTO api_logs (user_id, endpoint, timestamp, result_code) VALUES (%s, %s, %s, %s)",
        (username, "/api/data", datetime.now(), 200)
    )
    conn.commit()

    # 回傳依角色不同資料
    if "admin" in roles:
        return jsonify({"user": username, "role": "admin", "data": "secret admin data"})
    else:
        return jsonify({"user": username, "role": "user", "data": "normal user data"})

@app.route("/api/logs")
def get_logs():
    cursor.execute("SELECT * FROM api_logs ORDER BY id DESC LIMIT 10")
    rows = cursor.fetchall()
    return jsonify(rows)

if __name__ == "__main__":
    app.run(port=5000)
