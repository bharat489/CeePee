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

// Huddles: a chat's own call. Every channel, direct message and document
// thread gets one video room on the main floor, named after it, created the
// first time someone calls. Who is in the call comes from love's
// ParticipantInfo documents, so every open tab sees the participants live and
// can join or leave without leaving the conversation.

import core, { AccountRole, getCurrentAccount } from '@hcengineering/core'
import love, { RoomAccess, RoomType, type Room } from '@hcengineering/love'
import { getMetadata, getResource } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'

/** Calls need a media server; without LIVEKIT_WS everything call-related stays hidden. */
export function huddlesEnabled (): boolean {
  return (getMetadata(love.metadata.WebSocketURL) ?? '') !== '' && getCurrentAccount().role !== AccountRole.ReadOnlyGuest
}

export function huddleRoomName (title: string): string {
  return `Call · ${title}`
}

/** The chat's room, created on first use below everything else on the main floor. */
export async function ensureHuddleRoom (title: string): Promise<Room> {
  const client = getClient()
  const name = huddleRoomName(title)
  let room: Room | undefined = await client.findOne(love.class.Room, { name })
  if (room === undefined) {
    const rooms = await client.findAll(love.class.Room, { floor: love.ids.MainFloor })
    const y = rooms.reduce((m, r) => Math.max(m, r.y + r.height), 0)
    const id = await client.createDoc(love.class.Room, core.space.Workspace, {
      name,
      type: RoomType.Video,
      access: RoomAccess.Open,
      floor: love.ids.MainFloor,
      width: 3,
      height: 2,
      x: 0,
      y,
      language: 'en',
      startWithTranscription: false,
      startWithRecording: false,
      description: null
    })
    room = await client.findOne(love.class.Room, { _id: id })
  }
  if (room === undefined) throw new Error('The call room could not be created')
  return room
}

export async function joinHuddle (title: string): Promise<void> {
  const room = await ensureHuddleRoom(title)
  const join = await getResource(love.function.JoinRoomCall)
  await join(room)
}

export async function leaveHuddle (): Promise<void> {
  const leave = await getResource(love.function.LeaveRoomCall)
  await leave()
}

/** m:ss, or h:mm:ss past the hour. */
export function huddleElapsed (from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const two = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m % 60)}:${two(s % 60)}` : `${m}:${two(s % 60)}`
}
