import { Share } from "react-native";

// iOS/Android share sheet via the RN built-in (expo-sharing is file-oriented).
export function canShare(): boolean {
  return true;
}

export async function shareRun(url: string, text: string): Promise<void> {
  try {
    await Share.share({ message: `${text} ${url}`, url });
  } catch {
    /* user cancelled — ignore */
  }
}
