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
  Voice note recorder. Records from the microphone with MediaRecorder and
  hands back a File (audio/webm, Opus) that becomes a normal attachment with
  the in-message audio player.
-->
<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'

  const dispatch = createEventDispatcher<{ done: File, cancel: void }>()
  let recorder: MediaRecorder | undefined
  let stream: MediaStream | undefined
  let chunks: Blob[] = []
  let seconds = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let error = ''
  let stopping: 'send' | 'cancel' | undefined

  onMount(async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m))
      recorder = mime !== undefined ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        stream?.getTracks().forEach((t) => { t.stop() })
        if (stopping === 'send' && chunks.length > 0) {
          const type = recorder?.mimeType ?? 'audio/webm'
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
          dispatch('done', new File([new Blob(chunks, { type })], `voice-note-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type }))
        } else dispatch('cancel')
      }
      recorder.start(250)
      timer = setInterval(() => { seconds++ }, 1000)
    } catch (e: any) {
      error = 'Microphone not available'
    }
  })
  onDestroy(() => {
    if (timer !== undefined) clearInterval(timer)
    if (recorder !== undefined && recorder.state !== 'inactive') {
      stopping = stopping ?? 'cancel'
      recorder.stop()
    } else stream?.getTracks().forEach((t) => { t.stop() })
  })
  function stop (how: 'send' | 'cancel'): void {
    stopping = how
    if (timer !== undefined) clearInterval(timer)
    if (recorder !== undefined && recorder.state !== 'inactive') recorder.stop()
    else dispatch('cancel')
  }
  const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
</script>

<div class="chat-voice">
  {#if error !== ''}
    <span>{error}</span><span class="grow" /><button on:click={() => { dispatch('cancel') }}>Close</button>
  {:else}
    <span class="dot" />
    <span class="bars">{#each [0.1, 0.3, 0.5, 0.2, 0.4, 0.6, 0.3, 0.5] as d}<i style="animation-delay: {d}s" />{/each}</span>
    <span>Recording · {fmt(seconds)}</span>
    <span class="grow" />
    <button on:click={() => { stop('cancel') }}>Cancel</button>
    <button class="send" on:click={() => { stop('send') }}>Attach</button>
  {/if}
</div>
