//
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
//

// Live call state for the chat huddle bar. Two kinds of signal: who is speaking
// right now (LiveKit, visible only to people connected to the call) and each
// person's microphone, camera and screen-share state, which the local client
// writes onto its own ParticipantInfo so that everyone, in the call or not,
// sees the same badges.

import { getCurrentEmployee } from '@hcengineering/contact'
import { getClient } from '@hcengineering/presentation'
import { state as mediaState } from '@hcengineering/media-resources'
import { RoomEvent, type Participant } from 'livekit-client'
import { derived, get, writable, type Readable } from 'svelte/store'

import { lkSessionConnected, screenSharingState, ScreenSharingState } from './liveKitClient'
import { infos } from './stores'
import { lk } from './utils'

/** Person refs of the people LiveKit currently hears speaking. */
export const speakers = writable<Set<string>>(new Set())

lk.on(RoomEvent.ActiveSpeakersChanged, (list: Participant[]) => {
  speakers.set(new Set(list.map((p) => p.identity)))
})
lk.on(RoomEvent.Disconnected, () => {
  speakers.set(new Set())
})

export function huddleSpeakers (): Readable<Set<string>> {
  return speakers
}

/** The local person's media flags, as they should appear on their ParticipantInfo. */
const myFlags = derived([mediaState, screenSharingState, lkSessionConnected], ([$media, $share, $connected]) => ({
  connected: $connected,
  mic: $media.microphone?.enabled === true,
  cam: $media.camera?.enabled === true,
  screen: $share === ScreenSharingState.Local
}))

let last = ''
myFlags.subscribe((flags) => {
  if (!flags.connected) {
    last = ''
    return
  }
  const key = `${flags.mic}|${flags.cam}|${flags.screen}`
  if (key === last) return
  last = key
  const me = getCurrentEmployee()
  const mine = get(infos).find((p) => p.person === me)
  if (mine === undefined) return
  if (mine.mic === flags.mic && mine.cam === flags.cam && mine.screen === flags.screen) return
  void getClient().diffUpdate(mine, { mic: flags.mic, cam: flags.cam, screen: flags.screen })
})
