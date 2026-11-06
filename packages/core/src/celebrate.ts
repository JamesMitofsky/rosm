import type { EditAction } from "./schemas";

// Whether an edit earns confetti. Only good news does: a fountain confirmed
// working. Reporting one broken, out of order or gone is just as useful, but
// cheering it reads as cheering the fountain's failure, so those saves get a
// calm "saved" acknowledgement in the UI instead. Adding a new point always
// celebrates and doesn't go through here.
export function celebratesEdit(action: EditAction): boolean {
  return action === "confirm";
}
