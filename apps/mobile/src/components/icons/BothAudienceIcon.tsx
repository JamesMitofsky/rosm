import Svg, { G, Path } from "react-native-svg";

export function BothAudienceIcon({
  size = 16,
  color = "#0c0d0a",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Human icon scaled on left */}
      <G
        transform="translate(-2, 0) scale(0.65)"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" />
        <Path d="M6 21V19C6 16.7909 7.79086 15 10 15H14C16.2091 15 18 16.7909 18 19V21" />
      </G>
      {/* Dog icon scaled on right */}
      <G
        transform="translate(9, 1) scale(0.65)"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M17.5 5.5 C16.2 3.8 15 4.2 14.5 4.8 L14.2 5.2 C13.8 5 13.2 5 12.5 5.2 C11.5 5.5 10.8 6.5 10.5 8 C8.8 10.2 6.8 12.2 4.2 13.2 C3.5 13.5 3 14.2 3 15 C3 16.5 4.5 17.5 6 17 C7.8 16.4 9.2 15.2 10.2 13.8 C10.1 14.8 10 16 9.8 17 C9.5 18.2 10.2 19.5 11.5 19.5 H13.5 C14.3 19.5 15 18.8 15 18 V14.5 C15.5 13.5 16 12 16 10 C16.8 9.5 17.5 8.5 17.8 7.5 C18.2 6.8 18 6 17.5 5.5 Z" />
      </G>
    </Svg>
  );
}
