//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021 Hardcore Engineering, Inc.
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

import { createApp } from '@hcengineering/ui'
import { configurePlatform } from './platform'

// After a deploy, tabs that are still open hold the old chunk names; the first
// lazy load that 404s would leave a blank panel. Reload once instead.
window.addEventListener('unhandledrejection', (e) => {
  const reason: any = e.reason
  const msg = String(reason?.message ?? reason ?? '')
  if (reason?.name === 'ChunkLoadError' || /Loading (CSS )?chunk .* failed/i.test(msg)) {
    const key = 'ceepee.chunkReload'
    if (sessionStorage.getItem(key) !== '1') {
      sessionStorage.setItem(key, '1')
      window.location.reload()
    }
  }
})
window.addEventListener('load', () => { setTimeout(() => { sessionStorage.removeItem('ceepee.chunkReload') }, 15000) })

configurePlatform().then(() => {
  createApp(document.body)
  // the boot screen from index.ejs fades out once the app shell has mounted
  setTimeout(() => {
    ;(window as any).__ceepeeBootDone?.()
  }, 400)
})
