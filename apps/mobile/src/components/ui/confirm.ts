import { ActionSheetIOS, Alert, Platform } from "react-native";

// Confirm a destructive choice the user just asked for. On iOS that's an action
// sheet, which the HIG prefers to an alert for choices tied to an intentional
// action, with the destructive button in red and Cancel apart from it
// (HIG: Action sheets, Alerts). Android has no action sheet, so it gets an
// alert with the same two buttons.
export function confirmDestructive(o: {
  title: string;
  message?: string;
  confirm: string;
  onConfirm: () => void;
}): void {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: o.title,
        message: o.message,
        options: [o.confirm, "Cancel"],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (i) => {
        if (i === 0) o.onConfirm();
      },
    );
    return;
  }
  Alert.alert(o.title, o.message, [
    { text: "Cancel", style: "cancel" },
    { text: o.confirm, style: "destructive", onPress: o.onConfirm },
  ]);
}
