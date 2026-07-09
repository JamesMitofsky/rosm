import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInOsm } from "../auth/osmAuth";
import { Button } from "../components/ui/Button";

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
    <SafeAreaView className="flex-1 bg-ink">
      <View className="flex-1 justify-center gap-6 px-6">
        <Text className="text-4xl font-bold text-cream">ROSM</Text>
        <Text className="text-base leading-6 text-cream-dim">
          Running for Open-Sourced Maps. Connect your OpenStreetMap account to record fountain
          updates from your run.
        </Text>
        <Button title="Connect with OpenStreetMap" onPress={connect} loading={busy} />
        {err ? <Text className="text-red-400">{err}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
