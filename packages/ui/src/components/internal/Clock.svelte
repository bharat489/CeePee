<script lang="ts">
  import { onMount } from 'svelte'
  import { showPopup, getTimeZoneName, getPrimaryTimeZone } from '../..'
  import ClockPopup from './ClockPopup.svelte'

  let hours = ''
  let minutes = ''
  let label = ''
  let pressed: boolean = false

  // The clock follows the zone picked in its popup (first entry), not only the browser's.
  function updateTime (): void {
    const zone = getPrimaryTimeZone()
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
      hours = parts.find((p) => p.type === 'hour')?.value ?? ''
      minutes = parts.find((p) => p.type === 'minute')?.value ?? ''
    } catch {
      const date = new Date()
      hours = String(date.getHours()).padStart(2, '0')
      minutes = String(date.getMinutes()).padStart(2, '0')
    }
    label = getTimeZoneName()
  }

  onMount(() => {
    updateTime()
    const interval = setInterval(updateTime, 500)
    return () => {
      clearInterval(interval)
    }
  })
</script>

<button
  class="antiButton ghost jf-center bs-none no-focus statusButton"
  class:pressed
  on:click={() => {
    pressed = true
    showPopup(ClockPopup, {}, 'status', () => {
      pressed = false
    })
  }}
>
  {#if label !== ''}<span>{label}</span>&nbsp;&nbsp;{/if}
  <span>{hours}</span>
  <span class="blink">:</span>
  <span>{minutes}</span>
</button>

<style lang="scss">
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .blink {
    animation: blink 1s step-start 0s infinite;
  }
</style>
