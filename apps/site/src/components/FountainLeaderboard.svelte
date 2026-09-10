<script lang="ts">
  import { onMount } from "svelte";
  import { apiFetch } from "@/lib/api";
  import type { LeaderboardEntry } from "@/lib/leaderboard";

  // Ranked list of the OSM contributors who've updated the most distinct points
  // through the app. Splits into two compact tables side-by-side on desktop
  // (ranks 1–5 left, 6–10 right), each with its own header; on mobile they stack
  // into a single column. While loading, shows headers with pulsing skeleton rows.
  let { class: className = "" }: { class?: string } = $props();

  let leaders = $state<LeaderboardEntry[]>([]);
  let loading = $state(true);

  onMount(() => {
    let alive = true;
    apiFetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { leaders: LeaderboardEntry[] } | null) => {
        if (alive && j) leaders = j.leaders;
      })
      .catch(() => {})
      .finally(() => {
        if (alive) loading = false;
      });
    return () => {
      alive = false;
    };
  });

  const columns = $derived([leaders.slice(0, 5), leaders.slice(5, 10)].filter((c) => c.length > 0));
</script>

{#snippet headerRow(extraClass: string)}
  <div
    class="text-muted border-base/15 grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-3 border-b pb-2 font-mono text-[0.65rem] font-medium tracking-[0.14em] uppercase {extraClass}"
  >
    <span>#</span>
    <span>Contributor</span>
    <span class="text-right">Points</span>
  </div>
{/snippet}

{#snippet skeletonRow()}
  <div class="border-border grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 border-b py-2.5">
    <span class="bg-base/10 h-3 w-3 animate-pulse rounded"></span>
    <span class="bg-base/10 h-3 w-28 animate-pulse rounded"></span>
    <span class="bg-base/10 h-3 w-6 animate-pulse justify-self-end rounded"></span>
  </div>
{/snippet}

{#if loading}
  <div class="flex flex-col gap-x-16 sm:flex-row {className}">
    {#each [0, 1] as ci (ci)}
      <div
        class="w-full sm:max-w-xs {ci === 1
          ? '[&>*:last-child]:border-b-0'
          : 'sm:[&>*:last-child]:border-b-0'}"
      >
        {@render headerRow(ci > 0 ? "hidden sm:grid" : "")}
        {#each Array(5) as _, i (i)}
          {@render skeletonRow()}
        {/each}
      </div>
    {/each}
  </div>
{:else if leaders.length === 0}
  <p class="text-muted text-sm {className}">
    No contributors yet — be the first to update a fountain.
  </p>
{:else}
  <div class="flex flex-col gap-x-16 sm:flex-row {className}">
    {#each columns as col, ci (ci)}
      <div
        class="w-full sm:max-w-xs {ci === columns.length - 1
          ? '[&>*:last-child]:border-b-0'
          : 'sm:[&>*:last-child]:border-b-0'}"
      >
        {@render headerRow(ci > 0 ? "hidden sm:grid" : "")}
        {#each col as l, i (l.username)}
          <div
            class="border-border grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-3 border-b py-2.5"
          >
            <span class="text-muted font-mono text-sm tabular-nums">{ci * 5 + i + 1}</span>
            <span class="min-w-0 font-medium">
              <a
                href={`https://www.openstreetmap.org/user/${encodeURIComponent(l.username)}`}
                target="_blank"
                rel="noopener noreferrer"
                class="decoration-base/20 hover:decoration-base block truncate underline-offset-4 hover:underline"
              >
                {l.username}
              </a>
            </span>
            <span class="text-muted text-right text-sm tabular-nums">{l.points}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}
