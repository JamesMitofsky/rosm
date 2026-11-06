import { useEffect, useState } from "react";
import { getToken, onAuthChange } from "./authStore";

// Whether an OSM token is on hand, following sign-in and sign-out. The token
// is what signed-in actions need; the server's status (useOsmStatus) can't
// tell signed out from offline.
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(() => getToken() != null);
  useEffect(() => {
    const update = () => setSignedIn(getToken() != null);
    update();
    return onAuthChange(update);
  }, []);
  return signedIn;
}
