import NextAuth from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

async function refreshAccessToken(token: any) {
  try {
    const issuer = process.env.KEYCLOAK_ISSUER || "http://localhost:8001/auth/realms/demo";
    const url = `${issuer}/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("client_id", process.env.KEYCLOAK_CLIENT_ID || "react-client");
    if (process.env.KEYCLOAK_CLIENT_SECRET) {
      params.set("client_secret", process.env.KEYCLOAK_CLIENT_SECRET);
    }
    params.set("refresh_token", token.refreshToken);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      cache: "no-store",
    });

    let refreshed: any;
    if (!response.ok) {
      const errorText = await response.text();
      // 讓錯誤可見於 next-auth 日誌
      console.error("refresh token failed", response.status, errorText);
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    } else {
      refreshed = await response.json();
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 0) * 1000,
      refreshTokenExpires: token.refreshTokenExpires, // 可視需要擴充
      error: undefined,
    };
  } catch (e) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

const handler = NextAuth({
  debug: process.env.NODE_ENV !== "production",
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID || "react-client",
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "", // public client 可空
      issuer: process.env.KEYCLOAK_ISSUER || "http://localhost:8001/auth/realms/demo",
      authorization: { params: { scope: "openid profile email offline_access" } }
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      // 初次登入，保存 access/refresh token 與過期時間
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;

        if (account.access_token) {
          try {
            // 解析 JWT token 获取角色信息
            const base64Url = account.access_token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const payload = JSON.parse(jsonPayload);
            token.roles = payload.realm_access?.roles || [];
            token.preferred_username = payload.preferred_username;
          } catch (error) {
            console.error('Failed to parse token:', error);
          }
        }


        // Keycloak 回傳 expires_in/refresh_expires_in（秒），NextAuth 有時提供 expires_at
        const nowSec = Math.floor(Date.now() / 1000);
        const expiresAtSec =
          (account as any).expires_at ??
          (typeof (account as any).expires_in === "number"
            ? nowSec + (account as any).expires_in
            : undefined);
        token.accessTokenExpires =
          typeof expiresAtSec === "number" ? expiresAtSec * 1000 : Date.now() + 55 * 60 * 1000;
        if (typeof (account as any).refresh_expires_in === "number") {
          token.refreshTokenExpires = Date.now() + (account as any).refresh_expires_in * 1000;
        }
        return token;
      }

      // 若尚未接近過期，直接回傳
      const accessTokenExpiresMs =
        typeof token.accessTokenExpires === "number"
          ? token.accessTokenExpires
          : Number(token.accessTokenExpires || 0);
      if (
        token.accessToken &&
        accessTokenExpiresMs > 0 &&
        Date.now() < accessTokenExpiresMs - 60 * 1000
      ) {
        return token;
      }

      // 嘗試刷新 token
      if (token.refreshToken) {
        return await refreshAccessToken(token);
      }

      // 沒有 refresh token，保留現狀（可能導致 401）
      return token;
    },
    async session({ session, token }) {
      const s = session as any;
      s.accessToken = token.accessToken as string | undefined;
      s.error = token.error;
      s.accessTokenExpires = token.accessTokenExpires;
      s.roles = token.roles || [];
      s.preferred_username = token.preferred_username;
      return session;
    },
  },
});

export { handler as GET, handler as POST };