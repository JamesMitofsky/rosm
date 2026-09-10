<script lang="ts">
  import type { Snippet } from "svelte";

  // The frosted card every overlay on the map page floats in. One place for the
  // recipe so the legend, the route bar and the locate pill read as one family
  // and a tweak to the glass reaches all of them.
  let { class: className = "", children }: { class?: string; children: Snippet } = $props();
</script>

<div class="bg-surface/85 border-base/10 rounded-xl border shadow-lg backdrop-blur-md {className}">
  {@render children()}
</div>
