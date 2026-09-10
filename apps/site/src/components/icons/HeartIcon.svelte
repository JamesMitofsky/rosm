<script lang="ts">
  let { size = 16, class: className = "" }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" class={className}>
  <path
    d="M12 21.35 C11.6 21.35 11.2 21.2 10.9 20.95 L3.6 14.2 C1.5 12.25 1.5 9 3.6 7.05 C5.55 5.25 8.6 5.25 10.55 7.05 L12 8.4 L13.45 7.05 C15.4 5.25 18.45 5.25 20.4 7.05 C22.5 9 22.5 12.25 20.4 14.2 L13.1 20.95 C12.8 21.2 12.4 21.35 12 21.35 Z"
  />
</svg>
