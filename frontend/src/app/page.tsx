"use client";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Page() {
  const { data: session, status } = useSession();

  const callApi = async () => {
    if (!(session as any)?.accessToken) {
      console.log("No access token");
      return;
    }

    const res = await fetch("http://127.0.0.1:5000/api/data", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(session as any).accessToken}`,
      },
    });
    const data = await res.json();
    console.log(data);
  };

  // 如果正在加載會話狀態
  if (status === "loading") {
    return <div>Loading...</div>;
  }

  // 如果用戶未登錄，顯示登錄按鈕
  if (!session) {
    return (
      <div>
        <h1>Please login</h1>
        <button onClick={() => signIn("keycloak")}>
          Login
        </button>
      </div>
    );
  }

  // 如果用戶已登錄，顯示原有內容
  return (
    <div>
    <h1>Welcome, {session.user?.name || session.user?.email}</h1>
    <p>Username: {(session as any)?.preferred_username}</p>
    <p>Roles: {(session as any)?.roles?.join(', ') || 'No roles'}</p>
    <p>Is Admin: {(session as any)?.roles?.includes('admin') ? 'Yes' : 'No'}</p>
    <button onClick={callApi}>Call Flask API</button>
    <button
      onClick={() =>
        signOut({ callbackUrl: "/api/auth/signin?callbackUrl=/" })
      }
      style={{ marginLeft: 12 }}
    >
      Logout
    </button>
  </div>
  );
}

