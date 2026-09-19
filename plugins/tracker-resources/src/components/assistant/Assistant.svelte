<!--
// Copyright © 2026 Qicky Globaltech Private Limited
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
<!--
  Floating fallback for the assistant: the same panel that lives in the
  sidebar, in a popup. Used only when the sidebar widget is unavailable.
  Works with no API key, by design.
-->
<script lang="ts">
  import { closePopup } from '@hcengineering/ui'

  import AssistantPanel from './AssistantPanel.svelte'
</script>

<div class="ask-popup motion-pop">
  <button class="ask-popup__x" title="Close" on:click={() => { closePopup() }}>×</button>
  <AssistantPanel />
</div>

<style lang="scss">
  .ask-popup { position: relative; display: flex; flex-direction: column; width: min(44rem, 94vw); height: min(42rem, 86vh); border-radius: 1rem; background: var(--theme-popup-color); box-shadow: var(--theme-popup-shadow); overflow: hidden; > :global(*:last-child) { flex: 1; min-height: 0; } }
  .ask-popup__x { position: absolute; top: 0.5rem; right: 0.6rem; z-index: 2; width: 1.8rem; height: 1.8rem; border: none; border-radius: 50%; background: transparent; color: var(--theme-dark-color); font: inherit; font-size: 1.1rem; cursor: pointer; &:hover { background: var(--theme-button-hovered); color: var(--theme-caption-color); } }
</style>
