import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Button } from "../components/ui/Button";
import { announce } from "../ports/accessibility";
import { signInOsm } from "./osmAuth";

// Sign-in is asked for where it's needed, not before the app can be used
// (HIG: Managing accounts, "Delay sign-in for as long as possible"), and the
// button always names the account it signs in with ("Always identify the
// authentication method you offer").
export const SIGN_IN_TITLE = "Sign In with OpenStreetMap";

// The OS web-authentication sheet presents itself over whatever is on screen,
// a native bottom sheet included, so sign-in can start from anywhere.
async function runSignIn(): Promise<string | null> {
  const res = await signInOsm();
  if (res.ok) {
    announce("Signed in.");
    return null;
  }
  if (res.error) announce(res.error);
  return res.error ?? null;
}

type Props = {
  // "button": a full-width button. "link": a short inline text action.
  style?: "button" | "link";
  // Text colour for the link style: light on the dark run panel.
  tone?: "dark" | "light";
  title?: string;
};

export function SignInButton({ style = "button", tone = "dark", title }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const press = async () => {
    setBusy(true);
    setErr(null);
    setErr(await runSignIn());
    setBusy(false);
  };
  const errClass = tone === "light" ? "text-red-400" : "text-red-700";
  if (style === "link") {
    return (
      <View className="items-end">
        <Pressable
          onPress={press}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          hitSlop={12}
          className="flex-row items-center gap-2 active:opacity-60"
        >
          {busy ? (
            <ActivityIndicator size="small" color={tone === "light" ? "#abdcec" : "#1877a3"} />
          ) : null}
          <Text className={`text-sm font-bold ${tone === "light" ? "text-info" : "text-action"}`}>
            {title ?? "Sign In"}
          </Text>
        </Pressable>
        {err ? <Text className={`mt-1 text-sm ${errClass}`}>{err}</Text> : null}
      </View>
    );
  }
  return (
    <View className="gap-2">
      <Button title={title ?? SIGN_IN_TITLE} variant="action" onPress={press} loading={busy} />
      {err ? <Text className={`text-sm ${errClass}`}>{err}</Text> : null}
    </View>
  );
}

// For an action that can't happen without an account (adding a fountain goes
// straight to OSM): say why, then sign in.
export function promptSignIn(o: { title: string; message: string }): void {
  Alert.alert(o.title, o.message, [
    { text: "Cancel", style: "cancel" },
    { text: "Sign In", isPreferred: true, onPress: () => void runSignIn() },
  ]);
}
