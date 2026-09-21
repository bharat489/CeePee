<!--
// Copyright © 2026 Qicky Globaltech Private Limited
// SPDX-License-Identifier: EPL-2.0
-->
<!--
  Wraps occurrences of `query` inside `text` with a <mark> element.
  Case-insensitive substring match. Consumer should pass the RAW user
  search text (not the encoded $search wire-form) — see
  HighlightedText.helpers.ts for the prefix-stripping fall-back when an
  encoded string slips through.
-->
<script lang="ts">
  import { splitHighlightSegments } from './HighlightedText.helpers'

  export let text: string = ''
  export let query: string = ''
  /**
   * `enabled=false` short-circuits the highlight pass — consumers wire this
   * to the searchHighlight Customize-View toggle so users can opt out of
   * the marker styling without losing search itself.
   */
  export let enabled: boolean = true
  $: segments = enabled ? splitHighlightSegments(text, query) : [{ text, match: false }]
</script>

<!-- one inline element, so whitespace between segments survives flex parents -->
<span class="hl">{#each segments as seg}{#if seg.match}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>

<style>
  .hl {
    display: inline;
    white-space: pre-wrap;
  }
  mark {
    background: var(--global-warning-BackgroundColor, #fff3a3);
    color: inherit;
    padding: 0 0.05em;
    border-radius: 2px;
  }
</style>
