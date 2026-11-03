import { useState } from "react";
import { Text, View } from "react-native";
import { SafeArea } from "../components/ui/SafeArea";
import { signInOsm } from "../auth/osmAuth";
import { Button } from "../components/ui/Button";
import cfg from "@water-run/core/appConfig.json";

// The app's entry contract: connect an OSM account. On success the token lands in
// the keychain and the router's auth gate flips to the hub automatically.
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setErr(null);
    const res = await signInOsm();
    if (!res.ok && res.error) setErr(res.error);
    setBusy(false);
  }

  return (
    <SafeArea className="bg-base flex-1">
      <View className="flex-1 justify-center gap-6 px-6">
        <Text className="text-light text-4xl font-bold">{cfg.appName}</Text>
        <Text className="text-light-muted text-base leading-6">
          Sign in to save fountain updates from your run.
        </Text>
        <View className="gap-3">
          <Button title="Sign in to save updates" onPress={connect} loading={busy} />
          {/* The one place the app names OpenStreetMap: sign-in opens its site,
              and a page nobody was told about would look like a wrong turn. */}
          <Text className="text-light-muted text-sm leading-5">
            You’ll sign in with a free OpenStreetMap account. That’s the public map where{" "}
            {cfg.appName} saves fountain updates.
          </Text>
        </View>
        {err ? <Text className="text-red-400">{err}</Text> : null}
      </View>
    </SafeArea>
  );
}
