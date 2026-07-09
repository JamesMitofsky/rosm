import { useEffect } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { useOutbox } from "@rosm/core/stores/outbox";

// App-wide outbox driver (mirror of the web OutboxSync): hydrate the queue on
// launch, then flush pending edits whenever connectivity returns or the app comes
// back to the foreground. Renders nothing.
export function OutboxSyncBridge() {
  useEffect(() => {
    const { hydrate, flush } = useOutbox.getState();
    hydrate().then(() => flush());

    const netSub = Network.addNetworkStateListener((state) => {
      if (state.isConnected) useOutbox.getState().flush();
    });
    const appSub = AppState.addEventListener("change", (next) => {
      if (next === "active") useOutbox.getState().flush();
    });

    return () => {
      netSub.remove();
      appSub.remove();
    };
  }, []);

  return null;
}
