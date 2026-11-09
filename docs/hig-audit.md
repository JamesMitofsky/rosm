# iOS app audit against Apple's Human Interface Guidelines

Audit of `apps/mobile` (Expo SDK 57, iOS 26/27) against Apple's current Human
Interface Guidelines, made in November 2026. The aim is the smoothest experience
for the two jobs the app exists for: checking fountains near you (Nearby) and
surveying them during a run (Verify → Run).

## How this was done

- **Guidance.** Every HIG page cited below was read from Apple's own content
  (`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`,
  the data behind `developer.apple.com/design/human-interface-guidelines/<page>`)
  on 2026-11-06, along with each page's change log. Liquid Glass rules that are not
  in the HIG text yet come from WWDC25 "Meet Liquid Glass" (session 219) and "Get to
  know the new design system" (356), and WWDC26 "Communicate your brand identity on
  iOS" (251). Location authorization comes from Apple's Core Location docs, because
  the HIG doesn't cover When In Use vs Always.
- **Feasibility.** Every proposed API was checked against the installed package
  sources (expo-router 57.0.25, @expo/ui 57.0.22, expo-location 57.0.20,
  expo-glass-effect 57.0.5, expo-widgets 57.0.28, MapLibre RN 11.3.6, RN 0.86.3), not
  only their docs.
- **Code.** Every screen, component, port and hook in `apps/mobile/src` was read, plus
  the core stores they drive (`outbox`, `planner`, `run`, `guidance`). Contrast
  figures are WCAG ratios computed from the palette in `src/global.css`.
- **Limits.** None of this was run on a device. The Maps HIG page was last updated
  in December 2024 and says nothing about Liquid Glass or user-location controls, so
  map-control advice leans on the Materials and Layout pages. Behaviour specific to
  iOS 27 is taken from WWDC26 sessions, not the HIG text.

HIG links below are abbreviated **HIG/<page>** =
`https://developer.apple.com/design/human-interface-guidelines/<page>`.

## Summary

Getting the basics right gives the app a strong base: native tabs and native sheets
(so the Liquid Glass tab bar and sheet chrome come for free), an offline-first outbox
that never loses a survey, careful keyboard handling inside sheets, 44 pt hit slops on
small text buttons, and a launch screen that matches the icon. The largest gaps cluster
around the moment that matters most, the run itself:

1. **The run screen hides its own guidance.** It works out distance, compass
   direction, the next turn and arrival on every fix, then shows none of them; a
   runner sees only the fountain's name.
2. **Everything sits behind sign-in.** Browsing a map of fountains needs no account,
   but the app shows nothing until you sign in to OpenStreetMap.
3. **Starting a run fires up to three system prompts at once**, one of them an
   "Always" location request the run doesn't need on iOS.
4. **A stray tap on the run map opens the add-a-fountain sheet**, and the planner's
   map turns stray taps into hidden waypoints.
5. **The brand blue fails contrast** on the run screen's two main buttons (white on
   `#4fafd4` is 2.5:1) and as text on light backgrounds (2.3:1).
6. **Recording "Working" takes two taps and a form**, and nothing offers Undo, though
   the outbox already holds every edit for five seconds so it can be undone.

## Findings and plan

Priority: **P1** blocks or slows the core job; **P2** adds friction or breaks a
platform rule people notice; **P3** is polish. Status: **Done** in this change, or
**Next** (planned, not in this change, with the reason).

### Run (in motion)

#### R1 · P1 · The run screen shows no distance, direction or turn — Done

- **Now:** `useRunSession` returns `distToTarget`, `heading`, `nextTurn`,
  `distToTurn` and `arrived` (`src/run/useRunSession.ts`), but `src/app/run.tsx` reads
  none of them except `nextTurn`, and shows that only when the stop has no name. The
  lock-screen notification carries the distance, but the screen the runner looks at
  doesn't.
- **Guidance:** "Make sure text is legible for when people are in motion. When a
  session requires movement, use large font sizes, high-contrast colors, and arrange
  text so that the most important information is easy to read" (HIG/workouts).
- **Change:** the run panel leads with the distance to the next fountain in large
  type, its compass direction, and the next turn on its own line, followed by the
  fountain's name.

#### R2 · P1 · Arrival goes unnoticed — Done

- **Now:** `autoArrived` (within 30 m) is computed and never used. The proximity
  alert is a notification, and `setNotificationHandler` shows it as a banner even
  while the run screen is open (`src/ports/notify.ts`), so a banner covers the very
  screen that should say it.
- **Guidance:** feedback should work "when the device is silenced, the person looks
  away" (HIG/feedback); "Prefer using haptics to complement other feedback"
  (HIG/playing-haptics); handle notifications that arrive in the foreground
  gracefully (HIG/notifications).
- **Change:** when the runner reaches a stop, the survey sheet opens once per stop
  with a success haptic and a VoiceOver announcement. The 80 m proximity cue is a
  haptic while the app is open and a notification only in the background.

#### R3 · P1 · Ending a route early uses an invisible button — Done

- **Now:** the inline confirmation's "End route" uses the `primary` button variant,
  whose fill (`bg-base`) is the run panel's own colour, so it reads as bare text. The
  planner asks the same question with an `Alert`, so the two confirmations look
  different.
- **Guidance:** "Use an action sheet — not an alert — to offer choices related to an
  intentional action"; destructive buttons use the destructive style, with Cancel
  (HIG/action-sheets, HIG/alerts).
- **Change:** a single `confirmDestructive` helper shows an iOS action sheet (an
  alert on Android) with a red destructive button and Cancel. End route early, End
  run and Sign out (when edits are unsent) all use it.

#### R4 · P2 · No alternative to the add-a-fountain gesture — Done (with M1)

- **Guidance:** "Offer alternatives to gestures" (HIG/accessibility).
- **Change:** a map button adds a fountain at the runner's position, using the unused
  `addHere` path's logic through the same sheet. The gesture remains for any other
  spot.

#### R5 · P2 · The lock-screen progress line is a stream of notifications — Done (follow-up change)

- **Was:** a notification was re-posted every 30 s or so while the app was in the
  background (`src/ports/notify.ts`); `src/ports/liveActivity.ts` was a stub.
- **Guidance:** Live Activities suit "real-time fitness metrics"; "don't use push
  notifications alongside Live Activities for the same updates"; "support limited
  width presentations" by fitting compact and minimal views "inside a 28pt-diameter
  circle" with "a short abbreviation or graphic representation"; "always end a Live
  Activity immediately when the task or event ends" (HIG/live-activities, updated
  Oct 13 2026). "Don't send multiple notifications for the same thing"
  (HIG/notifications).
- **Change:** the run's progress is a Live Activity (`expo-widgets` 57.0.28,
  `src/widgets/RunProgressActivity.tsx`). The Lock Screen shows the next stop's name,
  the next turn and the distance; the Dynamic Island shows a drop and the distance
  stacked as "0.3" over "mi", which fits the 28 pt circle in every presentation, since
  expo-widgets doesn't say when the limited-width one is showing. Updates keep the
  notification line's throttle (`shouldPostProgress`), and each carries a stale date
  so an activity the app can no longer update dims instead of showing an old distance.
  On a loop it follows the runner back to the start once every stop is done ("Back to
  start"). It ends at once on Finish, End run, the end of the route (the start again,
  on a loop), and at the next launch after the app was killed (`getInstances()` finds what that run left). `src/ports/runProgress.ts`
  puts the progress on one surface at a time: the notification line remains only where
  there is no Live Activity (Android, iOS before 16.2, Live Activities switched off, or
  the runner dismissed it), and is taken down while the activity is live.

### Getting started

#### S1 · P1 · Sign-in wall before anything — Done

- **Now:** `Stack.Protected` in `src/app/_layout.tsx` shows only the login screen
  until there is a token, though Nearby, the planner and the run all work without
  one. Edits made while signed out already wait for a token in the outbox (a 401 is
  classed `wait`, and sign-in forces a resend). The button says "Sign in to save
  updates" and doesn't name the account.
- **Guidance:** "Ask people to create an account only if your core functionality
  requires it"; "Delay sign-in for as long as possible. People often abandon apps
  when they're forced to sign in before they can do anything useful"; "Always
  identify the authentication method you offer" (HIG/managing-accounts).
- **Change:** the app opens straight onto Nearby, and the login screen is gone. A
  "Sign In with OpenStreetMap" button (`SignInButton`), with a line on what the account
  is for, appears where it's needed:
  - on Profile while signed out;
  - in the point sheet once an edit is saved on the phone and waiting to be sent;
  - on the run screen.
    Adding a new fountain can't be queued, so it asks first with a short alert that says
    why. The button starts the OS web-authentication sheet directly, which presents over
    whatever is on screen, so sign-in from inside a fountain's sheet doesn't depend on
    pushing a full-screen route over a native sheet.
- **Related fix:** `useOsmUser` now loads the account when a sign-in happens while
  Profile is open. Before, it read the account only once, when Profile first
  appeared.

#### S2 · P1 · Permission prompts pile up at Start run, including an unneeded "Always" — Done

- **Now:** on run start, `start()` in `src/tasks/runLocationTask.ts` asks for When In
  Use, then at once for Always, while `useRunSession` asks for notifications in
  parallel.
- **Guidance:**
  - When In Use "is the preferred choice". "If you enable background location
    updates, an app with When in Use authorization continues to run in the background
    when location services are active" (Core Location, "Requesting authorization to
    use location services").
  - `allowsBackgroundLocationUpdates`: "Updates continue even if the app subsequently
    enters the background."
  - "Request permission only when your app clearly needs access" (HIG/privacy).
  - expo-location's own iOS `startLocationUpdatesAsync` checks only foreground
    permission (`LocationModule.swift`), so the run tracks with the screen locked
    on When In Use.
- **Change:** iOS no longer asks for Always; Android keeps its background request.
  The notification prompt now comes after the location flow has settled, so the
  prompts arrive one at a time.

#### S3 · P2 · Denied location is a dead end — Done

- **Now:** a denied run shows "Location permission is required to guide your run."
  A denied Nearby shows the platform's error text. Neither offers a way out.
- **Guidance:** "Link directly to a setting rather than describing where it is"
  (HIG/writing); "help them understand why" a command can't be carried out
  (HIG/feedback).
- **Change:** both screens detect a denial that iOS will no longer re-prompt for and
  offer **Open Settings** (`Linking.openSettings()`).

### Map and planning

#### M1 · P1 · Taps on the map perform hidden actions — Done

- **Now:** on the run map, a tap anywhere off a marker opens the add-a-new-fountain
  sheet (`src/app/run.tsx`, `onMapPress`). In the planner, a tap drops a via
  waypoint (core `mapClick`) that nothing on screen mentions.
- **Guidance:** "Use shortcut gestures to supplement standard gestures, not replace
  them" (HIG/gestures); "Offer alternatives to gestures" (HIG/accessibility); during
  a workout, avoid distractions (HIG/workouts).
- **Change:** both maps take these actions on touch-and-hold (MapLibre `onLongPress`),
  the convention Maps uses for dropping a pin, with a haptic, and the planner's
  instructions now say so. Nearby takes the same gesture to add a fountain,
  through the same sheet as the run, which for a new fountain now opens straight on
  its details ("New Fountain", "Add Fountain"). A tap on a marker still opens it. _Judgement:_ the HIG
  has no rule that names touch-and-hold; it's the Apple Maps convention.

#### M2 · P1 · "Start run" is a small text link — Done

- **Now:** the planner's one primary action is a 14 pt link at the panel's bottom
  right (`PhaseNav`), in a blue with 2.3:1 contrast. When it's disabled, nothing
  says why.
- **Guidance:** "use a button that has a prominent visual style for the most likely
  action in a view" (HIG/buttons); "Show people when a command can't be carried out
  and help them understand why" (HIG/feedback).
- **Change:** a full-width prominent "Start Run" button, with a line under it saying
  why it's unavailable ("Add a fountain to your route", "Updating your route…").

#### M3 · P2 · Floating map controls are opaque slabs — Done

- **Now:** the status, search and error pills over the Nearby map are solid black
  with heavy shadows. The location button is a white disc. While the planner
  searches, it dims the whole map behind a scrim.
- **Guidance:** Liquid Glass "forms a distinct functional layer for controls and
  navigation elements … that floats above the content layer"; "Use Liquid Glass
  effects sparingly" (HIG/materials); show progress without blocking the rest of the
  view (HIG/loading).
- **Change:** a `FloatingSurface` component renders `GlassView` (expo-glass-effect)
  when Liquid Glass is available and Reduce Transparency is off, and the old opaque
  look otherwise. The location button, the new add button and the Nearby pills use
  it. The planner shows the same non-blocking pill as Nearby instead of the scrim.

#### M4 · P3 · Overlapping fountain dots aren't clustered — Next

- **Guidance:** "Cluster overlapping points of interest" (HIG/maps).
- **Plan:** MapLibre GeoJSON sources support `cluster`. Tap targets are already
  44×44 pt (MapLibre's default hitbox), so this is about legibility in dense
  downtowns, and it changes how marker taps resolve. Left for its own change.

### Survey sheet

#### V1 · P1 · "Working" takes two taps and a form; no Undo — Done

- **Now:**
  - Working → details form → Confirm working. An untouched form submits the
    fountain's existing audience, dispenser, seasonal flag and note.
  - The outbox holds every edit for `UNDO_WINDOW_MS` (5 s) and has `cancel(id)`
    exactly so that it can be undone, but no mobile screen offers Undo.
- **Guidance:** "When possible, offer choices instead of requiring text entry"; prefill
  defaults (HIG/entering-data); "Avoid displaying alerts for common, undoable
  actions" (HIG/alerts).
- **Change:**
  - **Working** records at once, with the same extras the untouched form would have
    sent (moved to core as `surveyDefaults`, with tests). If those defaults wouldn't
    pass validation, the form opens instead.
  - The recorded state offers **Undo** while the edit is still on the device, and
    **Add Details** to open the form.
  - On the run screen, the "Saved" line carries Undo, which also steps the run back
    to that stop.

#### V2 · P2 · Sheet navigation uses text "Back" buttons at the bottom — Done

- **Now:** each survey step ends with a bordered "Back" button at the bottom left, and
  the details form has another. Steps have no title.
- **Guidance:** "Use the standard Back and Close buttons … don't use a text label
  that says Back or Close" (HIG/toolbars). In a multi-step sheet, Back replaces
  Cancel on the leading edge of the top bar (HIG/sheets, updated Mar 24 2026). "Make
  it easy to identify a modal view's task" (HIG/modality).
- **Change:** a sheet header with a chevron Back button on the leading edge and the
  step's title: "What's Wrong?", "How Broken Is It?", or the form's action. The
  bottom Back buttons are gone.

#### V3 · P2 · Segmented controls mix icons and text, and VoiceOver can't tell position — Done

- **Now:** `AudienceToggle` and `DispenserToggle` are hand-built: icon plus text, no
  selection haptic, announced as plain buttons. The shared `SegmentedControl` exists
  but nothing uses it.
- **Guidance:** "Prefer using either text or images — not a mix of both — in a single
  segmented control" (HIG/segmented-controls); "Provide alternative labels for all
  key interface elements" (HIG/voiceover).
- **Change:** both use the shared control, restyled after iOS's segmented control
  (raised selected segment on a grey track), text only, with a selection haptic and
  "1 of 3"-style VoiceOver labels.

### Accessibility and feedback

#### A1 · P1 · Contrast failures in the brand blue, warnings and errors — Done

| Where                                        | Pair               | Ratio | Needs            |
| -------------------------------------------- | ------------------ | ----- | ---------------- |
| "I'm here", "Finish run", "Search this area" | white on `#4fafd4` | 2.5:1 | 3:1 (large/bold) |
| "Start run", "Add back", route distance      | `#4fafd4` on light | 2.3:1 | 4.5:1            |
| planner error                                | red-500 on surface | 3.5:1 | 4.5:1            |
| "Sandbox" tag                                | amber-600 on white | 3.2:1 | 4.5:1            |

- **Guidance:** at least 4.5:1 for text up to 17 pt, and 3:1 for larger or bold text
  (HIG/accessibility); aim higher for small custom-coloured text (HIG/dark-mode).
- **Change:** a mobile-only `action` token `#1877a3` (5.0:1 with white, 4.7:1 on the
  surface) for filled buttons and action text, plus red-700 and amber-700 for small
  text. The shared `link` colour in `appConfig.json` is untouched, so the site is
  unaffected.

#### A2 · P2 · Confetti ignores Reduce Motion and fires on every record — Done

- **Guidance:** with Reduce Motion on, reduce "automatic and repetitive animations"
  (HIG/accessibility); "generally avoid adding motion to UI interactions that occur
  frequently" (HIG/motion).
- **Change:** no confetti while Reduce Motion is on, following the setting live. The
  burst now starts from the centre of the screen at any width (it was pinned to
  x = 180). On a run, the per-stop haptic and saved line remain, and confetti is
  saved for finishing the route.

#### A3 · P2 · Status changes are silent to VoiceOver — Done

- **Guidance:** "Inform VoiceOver when visible content or layout changes occur"
  (HIG/voiceover).
- **Change:** `announce()` (`AccessibilityInfo.announceForAccessibility`) for saved
  edits, undo, arrival, sign-in errors and the search and run errors that appear over
  the map.

#### A4 · P3 · Small targets and loading states — Done

- Quick-tag pills grow to a 44 pt target.
- "Loading session…" and "Waiting for GPS…" gain spinners ("Keep progress indicators
  moving", HIG/progress-indicators).
- Profile's history rows get button roles and chevrons.
- The green "connected" dot now shows only when signed in.

#### A5 · P3 · Light mode is forced (`userInterfaceStyle: "light"`) — Next

- **Guidance:** "Even if your app ships in a single appearance mode, provide both
  light and dark colors to support Liquid Glass adaptivity" (HIG/color, Dec 2025);
  "Avoid offering an app-specific appearance setting" (HIG/dark-mode).
- **Plan:** the run screen is already dark. A full dark palette touches every screen
  and the web tokens, so it's a design task of its own.

#### A6 · P3 · Dynamic Type at the largest sizes is unverified — Next

- Text scales by default, but the run panel and the map overlays are absolutely
  positioned, and at accessibility sizes they could cover the map. This needs a
  device pass at AX3–AX5 ("Support enlarging text by at least 200 percent",
  HIG/accessibility).

### Copy and summary

#### C1 · P2 · Run summary shows raw codes and false copy — Done

- **Now:** the run detail lists statuses as `confirm` and `out_of_order`, and after a
  run it says "This route will disappear once you leave this screen". But the run is
  archived and listed in Profile (`routeArchive` never prunes).
- **Guidance:** "Provide a summary at the end of a session" (HIG/workouts); plain
  language (HIG/writing).
- **Change:** status labels with coloured dots, a correct note, and **Done** to
  leave.

#### C2 · P3 · Notification and button wording — Done (notifications), Next (buttons)

- Notification titles become title case ("Survey Point Ahead"): "Use title-style
  capitalization and no ending punctuation" (HIG/notifications).
- Button labels mix sentence case and title case. HIG/buttons asks for title case;
  the buttons this change touches follow it, and a full sweep is left for later.

### Bugs found along the way — Done

- **`text-base` never set a size.** The palette's `base` colour takes over Tailwind's
  `text-base`, so it sets the ink colour only. Text meant to be 16 pt, including every
  medium `Button` label, rendered at React Native's default 14 pt. Where it sat beside
  another colour class, which colour won depended on stylesheet order. Body (17 pt)
  and Callout (16 pt) size tokens from Apple's type scale now do that job
  (`text-body`, `text-callout`).
- **The seasonal toggle's "on" state was invisible.** Its classes (`bg-info-600`,
  `border-info-500`, `bg-info-50`, and `text-info-800` in the recorded state) don't
  exist, because `info` is a single colour with no shades. They compiled to nothing,
  so the check was white on white. They are sky shades now. Every other class in the
  app was checked by compiling it against the theme.
- **Ending a route early showed an invisible button** (R3).
- **"Remove from route" and "Add to route" were the same size and weight as the
  survey answers.** "Remove from Route" is now outlined, the app's lighter look for an
  undoable removal.

### Considered and left as they are

- **"Resume your route?" alert when the Verify tab opens.** HIG/alerts discourages
  alerts at launch, but this one isn't at launch: it asks a real either-or question
  the first time the tab is shown, and core keeps the choice explicit on purpose
  (`loadDraft`).
- **Nearby keeps the sheet open after an edit, while the run closes it.** That
  difference is intentional: the run advances to the next stop; Nearby shows sync
  status.
- **Run-in-progress as a tab bar accessory.** `NativeTabs.BottomAccessory` exists
  (iOS 26+). But a run replaces the tab stack (`router.replace("/run")`), so the tabs
  are rarely on screen during a run, and WWDC25 says accessories aren't for
  screen-specific actions.
- **Native SwiftUI segmented `Picker` (@expo/ui).** It would add an extra SwiftUI host
  inside the RN content of a SwiftUI sheet, which couldn't be verified without a
  device; the restyled RN control meets the rules above.
