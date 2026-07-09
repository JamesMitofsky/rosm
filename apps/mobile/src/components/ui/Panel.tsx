import type { ReactNode } from "react";
import { View } from "react-native";

// Card container matching the web ui/Panel: paper surface, hairline border.
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={`rounded-2xl border border-paper-line bg-white/60 p-4 ${className ?? ""}`}>
      {children}
    </View>
  );
}
