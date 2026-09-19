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
<!-- The attach menu of the composer: photos and videos, any document, the camera, a voice note. -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()
  const pick = (kind: 'photo' | 'document' | 'camera' | 'voice'): void => {
    dispatch('close', kind)
  }
</script>

<div class="chat-attach">
  <button on:click={() => { pick('photo') }}><span class="ic" style="background: linear-gradient(135deg, #7c3aed, #ec4899)">🖼️</span>Photo or video</button>
  <button on:click={() => { pick('document') }}><span class="ic" style="background: linear-gradient(135deg, #0ea5e9, #6366f1)">📄</span>Document</button>
  <button on:click={() => { pick('camera') }}><span class="ic" style="background: linear-gradient(135deg, #f97316, #ec4899)">📷</span>Camera</button>
  <button on:click={() => { pick('voice') }}><span class="ic" style="background: linear-gradient(135deg, #22c55e, #14b8a6)">🎙️</span>Voice message</button>
</div>
