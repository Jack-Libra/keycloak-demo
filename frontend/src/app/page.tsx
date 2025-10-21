"use client";
import { useSession, signOut } from "next-auth/react";

export default function Page() {
  const { data: session } = useSession();

  const callApi = async () => {
    if (!(session as any)?.accessToken) {
      console.log("No access token");
      return;
    }

    const res = await fetch("http://127.0.0.1:5000/api/data", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(session as any).accessToken}`, // 這裡帶 token
      },
    });
    const data = await res.json();
    console.log(data);
  };

  return (
    <div>
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

