import { useEffect, useState } from "react";
import { getToken, loadToken, onAuthChange } from "./authStore";

// Drives the router auth gate. `ready` is false until the keychain read completes
// (splash stays up); `signedIn` flips whenever the token is stored/cleared.
export function useAuth(): { signedIn: boolean; ready: boolean } {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    loadToken().then(() => {
      if (mounted) setSignedIn(getToken() != null);
    });
    return onAuthChange(() => setSignedIn(getToken() != null));
  }, []);

  return { signedIn: signedIn === true, ready: signedIn !== null };
}
