<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022 Hardcore Engineering Inc.
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
  import { getMetadata, setMetadata } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import {
    Location,
    Popup,
    Scroller,
    deviceOptionsStore as deviceInfo,
    fetchMetadataLocalStorage,
    getCurrentLocation,
    location,
    setMetadataLocalStorage,
    themeStore
  } from '@hcengineering/ui'
  import workbench from '@hcengineering/workbench'
  import { onDestroy, onMount } from 'svelte'
  import Auth from './Auth.svelte'
  import Confirmation from './Confirmation.svelte'
  import ConfirmationSend from './ConfirmationSend.svelte'
  import CreateWorkspaceForm from './CreateWorkspaceForm.svelte'
  import Join from './Join.svelte'
  import AutoJoin from './AutoJoin.svelte'
  import LoginForm from './LoginForm.svelte'
  import ProvidersOnlyForm from './ProvidersOnlyForm.svelte'
  import PasswordRequest from './PasswordRequest.svelte'
  import PasswordRestore from './PasswordRestore.svelte'
  import SelectWorkspace from './SelectWorkspace.svelte'
  import SignupForm from './SignupForm.svelte'
  import LoginTfaForm from './LoginTfaForm.svelte'
  import LoginIcon from './icons/LoginIcon.svelte'
  import { Pages, getAccount, pages } from '..'
  import login from '../plugin'

  import AdminWorkspaces from './AdminWorkspaces.svelte'
  import ChangePassword from './ChangePassword.svelte'

  export let page: Pages = 'signup'

  const signUpDisabled = getMetadata(login.metadata.DisableSignUp) ?? false
  const localLoginHidden = getMetadata(login.metadata.HideLocalLogin) ?? false
  const useOTP = getMetadata(presentation.metadata.MailUrl) != null && getMetadata(presentation.metadata.MailUrl) !== ''
  let navigateUrl: string | undefined
  let tfaToken: string | undefined = undefined

  onDestroy(location.subscribe(updatePageLoc))

  function updatePageLoc (loc: Location): void {
    const token = getMetadata(presentation.metadata.Token)
    page = (loc.path[1] as Pages) ?? (token != null ? 'selectWorkspace' : 'login')
    if (page === 'join' && loc.query?.autoJoin !== undefined) {
      page = 'autoJoin'
    }

    const allowedUnauthPages: Pages[] = [
      'login',
      'signup',
      'password',
      'recovery',
      'join',
      'autoJoin',
      'confirm',
      'confirmationSend',
      'auth',
      'tfa'
    ]
    if (token === undefined ? !allowedUnauthPages.includes(page) : !pages.includes(page)) {
      const account = fetchMetadataLocalStorage(login.metadata.LastAccount)
      page = account != null ? 'login' : 'signup'
    }

    navigateUrl = loc.query?.navigateUrl ?? undefined
    tfaToken = loc.query?.token ?? undefined
  }

  async function chooseToken (): Promise<void> {
    if (page === 'auth') {
      // token handled by auth page
      return
    } else if (page === 'autoJoin') {
      // there's a separate workflow for auto join
      return
    }

    if (getMetadata(presentation.metadata.Token) == null) {
      const lastAccount = fetchMetadataLocalStorage(login.metadata.LastAccount)
      if (lastAccount != null) {
        try {
          const loginInfo = await getAccount(false)
          if (loginInfo != null) {
            setMetadata(presentation.metadata.Token, loginInfo.token)
            setMetadataLocalStorage(login.metadata.LoginAccount, loginInfo.account)
            updatePageLoc(getCurrentLocation())
          }
        } catch (err: any) {
          // do nothing
        }
      }
    }
  }

  onMount(chooseToken)
  const PILLS = ['Kanban & Scrum', 'Roadmaps', 'Service desk', 'SLAs', 'Automations', 'Workflows', 'Ideas', 'Docs', 'Chat', 'Time tracking', 'Forms', 'Public portal', 'Dashboards', 'Portfolio']
</script>

{#if page === 'admin'}
  <AdminWorkspaces />
{:else}
  <div class="theme-dark w-full h-full lg" class:lg--narrow={$deviceInfo.docWidth <= 900}>
    <div class="lg__sky" aria-hidden="true">
      <span class="lg__blob lg__blob--a" /><span class="lg__blob lg__blob--b" /><span class="lg__blob lg__blob--c" />
      <span class="lg__grid" />
      <span class="lg__stars" />
    </div>
    <div class="lg__brand" style:top={'calc(1.5rem + var(--huly-top-indent, 0rem))'}>
      <LoginIcon /><span class="lg__brandname">{getMetadata(workbench.metadata.PlatformTitle)}</span>
    </div>
    <div class="lg__layout">
      {#if $deviceInfo.docWidth > 900}
        <section class="lg__hero">
          <span class="lg__eyebrow">Work management, reimagined</span>
          <h1 class="lg__h1">Ship faster.<br /><span class="lg__grad">Feel it.</span></h1>
          <p class="lg__lead">Issues, sprints, roadmaps, service desk, docs and chat in one place. Self-hosted, no per-seat tax. For teams who would rather build than click.</p>
          <ul class="lg__points">
            <li style="--i: 0"><i class="lg__dot" style="background: var(--vibe-a); color: var(--vibe-a)" />Boards and workflows that bend to you, not the other way round</li>
            <li style="--i: 1"><i class="lg__dot" style="background: var(--vibe-b); color: var(--vibe-b)" />Customer portal, SLAs and automations out of the box</li>
            <li style="--i: 2"><i class="lg__dot" style="background: var(--vibe-c); color: var(--vibe-c)" />Ideas, docs and chat next to the work, no tab switching</li>
          </ul>
          <div class="lg__ticker"><div class="lg__track">{#each [...PILLS, ...PILLS] as p, k}<span class="lg__pill" class:lg__pill--alt={k % 3 === 1}>{p}</span>{/each}</div></div>
        </section>
      {/if}
      <section class="lg__card" class:lg__card--wide={$deviceInfo.docWidth <= 900}>
        <Scroller padding={'1rem 0'}>
          <div class="form-content">
            {#if page === 'login'}
              {#if localLoginHidden}
                <ProvidersOnlyForm />
              {:else}
                <LoginForm {navigateUrl} {signUpDisabled} {useOTP} />
              {/if}
            {:else if page === 'signup'}
              <SignupForm {navigateUrl} {signUpDisabled} {localLoginHidden} {useOTP} />
            {:else if page === 'createWorkspace'}
              <CreateWorkspaceForm />
            {:else if page === 'password'}
              <PasswordRequest {signUpDisabled} />
            {:else if page === 'recovery'}
              <PasswordRestore />
            {:else if page === 'selectWorkspace'}
              <SelectWorkspace {navigateUrl} />
            {:else if page === 'join'}
              <Join />
            {:else if page === 'autoJoin'}
              <AutoJoin />
            {:else if page === 'confirm'}
              <Confirmation />
            {:else if page === 'confirmationSend'}
              <ConfirmationSend />
            {:else if page === 'auth'}
              <Auth />
            {:else if page === 'changePassword'}
              <ChangePassword />
            {:else if page === 'tfa'}
              <LoginTfaForm {navigateUrl} token={tfaToken} on:back={() => (page = 'login')} />
            {/if}
          </div>
        </Scroller>
      </section>
    </div>
    <Popup />
  </div>
{/if}

<style lang="scss">
  // Fluid layout: every size is a clamp() between a phone floor and a large-display ceiling,
  // the page scrolls when the viewport is short, the card never exceeds the viewport, and
  // touch devices get taller targets.
  .lg { position: relative; overflow: auto; background: #0a0912; color: #e9ecf1; }
  .lg__sky { position: fixed; inset: 0; overflow: hidden; pointer-events: none; }
  .lg__blob { position: absolute; width: 60vmax; height: 60vmax; border-radius: 50%; filter: blur(70px); opacity: 0.5; mix-blend-mode: screen; animation: lgFloat 26s ease-in-out infinite alternate; }
  .lg__blob--a { left: -20vmax; top: -25vmax; background: radial-gradient(circle at 30% 30%, var(--vibe-a), transparent 60%); }
  .lg__blob--b { right: -25vmax; top: -10vmax; background: radial-gradient(circle at 60% 40%, var(--vibe-b), transparent 60%); animation-delay: -9s; }
  .lg__blob--c { left: 20vw; bottom: -35vmax; background: radial-gradient(circle at 50% 50%, var(--vibe-c), transparent 60%); animation-delay: -17s; }
  .lg__grid { position: absolute; inset: -40%; background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: 72px 72px; transform: perspective(700px) rotateX(60deg) translateY(160px); mask-image: radial-gradient(ellipse at 50% 70%, #000 15%, transparent 65%); -webkit-mask-image: radial-gradient(ellipse at 50% 70%, #000 15%, transparent 65%); animation: lgGrid 18s linear infinite; }
  .lg__stars { position: absolute; inset: 0; opacity: 0.6; background-image: radial-gradient(1px 1px at 20% 30%, rgba(255, 255, 255, 0.7), transparent), radial-gradient(1px 1px at 70% 20%, rgba(255, 255, 255, 0.5), transparent), radial-gradient(1.5px 1.5px at 40% 80%, rgba(255, 255, 255, 0.6), transparent), radial-gradient(1px 1px at 85% 65%, rgba(255, 255, 255, 0.5), transparent), radial-gradient(1px 1px at 10% 75%, rgba(255, 255, 255, 0.4), transparent), radial-gradient(1px 1px at 55% 50%, rgba(255, 255, 255, 0.35), transparent); }
  .lg__brand { position: fixed; left: clamp(0.75rem, 2.5vw, 1.75rem); z-index: 3; display: flex; align-items: center; gap: 0.5rem; }
  .lg__brandname { font-size: clamp(0.9rem, 1.1vw, 1.1rem); font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .lg__layout { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, clamp(21rem, 38vw, 34rem)); gap: clamp(1.5rem, 4vw, 4rem); align-items: center; width: 100%; max-width: 120rem; min-height: 100%; margin: 0 auto; padding: clamp(4rem, 9vh, 6.5rem) clamp(1rem, 5vw, 4.5rem) clamp(1rem, 4vh, 3rem); box-sizing: border-box; }
  .lg--narrow .lg__layout { grid-template-columns: 1fr; gap: 0; padding: clamp(4rem, 8vh, 5rem) clamp(0.5rem, 3vw, 1rem) 1rem; }
  .lg__hero { display: flex; flex-direction: column; gap: clamp(0.6rem, 1.4vh, 1.1rem); min-width: 0; max-width: 40rem; animation: riseIn 0.7s var(--ease-enter, ease-out) both; }
  .lg__eyebrow { font-size: clamp(0.65rem, 0.8vw, 0.8rem); font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(233, 236, 241, 0.6); }
  .lg__h1 { margin: 0; font-size: clamp(2.2rem, 5vw, 4.6rem); line-height: 1.02; font-weight: 900; letter-spacing: -0.03em; }
  .lg__grad { background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .lg__lead { margin: 0; max-width: 34rem; font-size: clamp(0.9rem, 1.15vw, 1.15rem); line-height: 1.6; color: rgba(233, 236, 241, 0.75); }
  .lg__points { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.3rem 0 0; padding: 0; list-style: none; li { display: flex; align-items: center; gap: 0.6rem; font-size: clamp(0.85rem, 1vw, 1rem); color: rgba(233, 236, 241, 0.85); animation: riseIn 0.6s var(--ease-enter, ease-out) both; animation-delay: calc(0.25s + var(--i) * 0.12s); } }
  .lg__dot { flex-shrink: 0; width: 0.6rem; height: 0.6rem; border-radius: 50%; box-shadow: 0 0 12px currentColor; }
  .lg__ticker { margin-top: 0.5rem; overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
  .lg__track { display: flex; gap: 0.5rem; width: max-content; animation: lgTicker 30s linear infinite; }
  .lg__pill { padding: 0.3rem 0.75rem; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px; background: rgba(255, 255, 255, 0.05); font-size: 0.78rem; white-space: nowrap; &--alt { border-color: var(--accent-brand-ring); background: var(--accent-brand-soft); } }
  .lg__card { position: relative; display: flex; flex-direction: column; justify-content: center; width: 100%; min-width: 0; max-width: 100%; max-height: calc(100dvh - clamp(5rem, 13vh, 9.5rem)); min-height: 0; padding: clamp(1rem, 2.5vw, 2.25rem); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: clamp(1rem, 1.5vw, 1.4rem); background: rgba(16, 14, 26, 0.55); backdrop-filter: blur(28px) saturate(1.4); -webkit-backdrop-filter: blur(28px) saturate(1.4); box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.08); box-sizing: border-box; overflow: hidden; animation: riseIn 0.8s var(--ease-enter, ease-out) both; animation-delay: 0.15s; &::before { content: ''; position: absolute; left: 2rem; right: 2rem; top: 0; height: 2px; border-radius: 2px; background: var(--accent-gradient); opacity: 0.9; } &--wide { max-height: none; } }
  .form-content { display: flex; flex-direction: column; justify-content: center; flex-grow: 1; min-width: 0; height: max-content; }
  .lg :global(.container) { max-width: 100%; min-width: 0; box-sizing: border-box; }
  .lg :global(.antiButton.contrast:not(:disabled)) { background-image: var(--accent-gradient) !important; background-color: transparent !important; border-color: transparent !important; color: #fff !important; box-shadow: var(--accent-glow); }
  .lg :global(.antiButton.contrast:not(:disabled):hover) { filter: brightness(1.08); box-shadow: var(--accent-glow-strong); }
  .lg :global(.editbox) { border-radius: 0.75rem; }
  @media (max-height: 640px) { .lg__points, .lg__ticker, .lg__eyebrow { display: none; } .lg__h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); } .lg__card { max-height: none; } }
  @media (pointer: coarse) { .lg :global(.editbox) { min-height: 3rem; } .lg :global(.antiButton) { min-height: 2.75rem; } .lg__pill { padding: 0.45rem 0.9rem; } }
  @keyframes lgFloat { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(6vw, 4vh, 0) scale(1.15); } }
  @keyframes lgGrid { from { background-position: 0 0; } to { background-position: 0 72px; } }
  @keyframes lgTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .lg__blob, .lg__grid, .lg__track { animation: none; } }
</style>
