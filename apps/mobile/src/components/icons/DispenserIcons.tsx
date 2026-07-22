import Svg, { Path, G } from "react-native-svg";

export function BubblerIcon({ size = 16, color = "#0c0d0a" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path
        d="M10 9.5 V5 C10 3.3 11.3 2 13 2 C14.7 2 15.5 3.2 15.5 4.5 V5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M16 6.5 C16 6.5 14.8 8 14.8 8.8 C14.8 9.5 15.3 10 16 10 C16.7 10 17.2 9.5 17.2 8.8 C17.2 8 16 6.5 16 6.5 Z" />
      <Path d="M4 9.5 H20 C20 14.2 16.2 16 12 16 C7.8 16 4 14.2 4 9.5 Z" />
      <Path d="M9.5 16 H14.5 V18.5 H7 V21 H17 V18.5 H14.5 V16 Z" />
    </Svg>
  );
}

export function BottleIcon({ size = 16, color = "#0c0d0a" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M9.5 4.5 C9.5 3.1 10.6 2 12 2 C13.4 2 14.5 3.2 14.5 4.5 V5.5 H9.5 V4.5 Z M10.8 4.5 V5.5 H13.2 V4.5 C13.2 3.8 12.7 3.2 12 3.2 C11.3 3.2 10.8 3.8 10.8 4.5 Z" />
      <Path d="M7.5 9 C7.5 7 9 5.8 12 5.8 C15 5.8 16.5 7 16.5 9 V9.8 H7.5 V9 Z" />
      <Path d="M7.5 11.2 H16.5 V20.2 C16.5 21.4 15.5 22.2 14.2 22.2 H9.8 C8.5 22.2 7.5 21.4 7.5 20.2 V11.2 Z" />
    </Svg>
  );
}

export function BothDispenserIcon({
  size = 16,
  color = "#0c0d0a",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <G transform="translate(-2.5, 0) scale(0.68)">
        <Path
          d="M10 9.5 V5 C10 3.3 11.3 2 13 2 C14.7 2 15.5 3.2 15.5 4.5 V5"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
        <Path d="M16 6.5 C16 6.5 14.8 8 14.8 8.8 C14.8 9.5 15.3 10 16 10 C16.7 10 17.2 9.5 17.2 8.8 C17.2 8 16 6.5 16 6.5 Z" />
        <Path d="M4 9.5 H20 C20 14.2 16.2 16 12 16 C7.8 16 4 14.2 4 9.5 Z" />
        <Path d="M9.5 16 H14.5 V18.5 H7 V21 H17 V18.5 H14.5 V16 Z" />
      </G>
      <G transform="translate(9.5, 0) scale(0.68)">
        <Path d="M9.5 4.5 C9.5 3.1 10.6 2 12 2 C13.4 2 14.5 3.2 14.5 4.5 V5.5 H9.5 V4.5 Z M10.8 4.5 V5.5 H13.2 V4.5 C13.2 3.8 12.7 3.2 12 3.2 C11.3 3.2 10.8 3.8 10.8 4.5 Z" />
        <Path d="M7.5 9 C7.5 7 9 5.8 12 5.8 C15 5.8 16.5 7 16.5 9 V9.8 H7.5 V9 Z" />
        <Path d="M7.5 11.2 H16.5 V20.2 C16.5 21.4 15.5 22.2 14.2 22.2 H9.8 C8.5 22.2 7.5 21.4 7.5 20.2 V11.2 Z" />
      </G>
    </Svg>
  );
}
