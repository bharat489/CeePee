<!--
// Copyright © 2023 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { convertTimeZone, showPopup, TimeZone, CITY_ALIASES, getClockLabel, setClockLabel, getTimeZoneCity } from '../..'
  import ClockFace from './ClockFace.svelte'
  import TimeZonesPopup from '../TimeZonesPopup.svelte'

  const clockSize: string = '80px'
  const tzs: string[] = []
  const timeZones: TimeZone[] = []

  const localTZ: string = Intl.DateTimeFormat().resolvedOptions().timeZone
  let selectedTZ: string[] = [localTZ]
  const savedTZ = localStorage.getItem('TimeZones')
  if (savedTZ === null && selectedTZ[0] !== '') localStorage.setItem('TimeZones', JSON.stringify(selectedTZ))
  else if (savedTZ !== null) selectedTZ = JSON.parse(savedTZ)

  if (!Intl.supportedValuesOf) console.log('Your browser does not support Intl.supportedValuesOf().')
  else for (const timeZone of Intl.supportedValuesOf('timeZone')) tzs.push(timeZone)

  if (tzs.length > 0) tzs.forEach((tz) => timeZones.push(convertTimeZone(tz)))
  // cities that share a zone (Mumbai → Asia/Kolkata): picking one sets the zone and the status bar label
  for (const a of CITY_ALIASES) if (tzs.includes(a.zone)) timeZones.push({ id: `${a.zone}|${a.city}`, continent: a.zone.split('/')[0], city: `${a.city} (${getTimeZoneCity(a.zone)})`, short: a.city })
  let clockLabel = getClockLabel() ?? ''
  const applyResult = (result: string): { zone: string, label?: string } => {
    const k = result.indexOf('|')
    return k < 0 ? { zone: result } : { zone: result.slice(0, k), label: result.slice(k + 1) }
  }
  function saveLabel (): void {
    setClockLabel(clockLabel)
  }

  const saveTZ = (): void => {
    selectedTZ = selectedTZ
    localStorage.setItem('TimeZones', JSON.stringify(selectedTZ))
  }

  const changeTimeZone = (
    event: MouseEvent & { currentTarget: EventTarget & HTMLSpanElement },
    index: number
  ): void => {
    showPopup(
      TimeZonesPopup,
      {
        timeZones,
        selected: selectedTZ[index],
        count: selectedTZ.length,
        reset: selectedTZ.filter((tz) => tz === localTZ).length > 0 ? null : localTZ
      },
      event.currentTarget,
      (result) => {
        if (result !== undefined) {
          if (result === 'delete') selectedTZ.splice(index, 1)
          else {
            const r = applyResult(result)
            selectedTZ[index] = r.zone
            if (r.label !== undefined && index === 0) {
              clockLabel = r.label
              saveLabel()
            }
          }
          saveTZ()
        }
      },
      (result) => {
        if (result !== undefined) {
          if (result === 'reset') {
            selectedTZ[index] = localTZ
          } else {
            const r = applyResult(result)
            selectedTZ = [r.zone, ...selectedTZ]
            if (r.label !== undefined) {
              clockLabel = r.label
              saveLabel()
            }
          }
          saveTZ()
        }
      }
    )
  }
</script>

<div class="antiPopup" style:flex-direction={'column'} style:padding={'12px'} style:gap={'8px'}>
<div class="clocks">
  {#each selectedTZ as selected, i}
    <div class="statusPopup-option">
      <ClockFace bind:timeZone={selected} size={clockSize} />
      {#if selected !== ''}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
          class="label overflow-label"
          style:max-width={clockSize}
          on:click={(ev) => {
            changeTimeZone(ev, i)
          }}
        >
          {convertTimeZone(selected).short}
        </span>
      {/if}
    </div>
  {/each}
</div>
<label class="clock-label"><span>Status bar shows</span><input class="clock-label__input" placeholder={getTimeZoneCity(selectedTZ[0] ?? localTZ)} bind:value={clockLabel} on:change={saveLabel} /></label>
<span class="clock-hint">Click a city to change its zone. Search for your city: Mumbai, Delhi, Bengaluru and 40 others map to the right zone.</span>
</div>

<style lang="scss">
  .clocks { display: flex; flex-direction: row; gap: 0.5rem; }
  .clock-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--theme-dark-color); }
  .clock-label__input { flex: 1; min-width: 8rem; padding: 0.25rem 0.5rem; border: 1px solid var(--theme-divider-color); border-radius: 0.4rem; background: var(--theme-bg-color); color: var(--theme-caption-color); font: inherit; font-size: 0.8125rem; }
  .clock-hint { max-width: 22rem; font-size: 0.7rem; color: var(--theme-trans-color); }
</style>
