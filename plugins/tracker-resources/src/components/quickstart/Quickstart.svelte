<!--
// Copyright © 2026 Hardcore Engineering Inc.
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
  Quickstart: a floating guide for the first week.

  Seven steps, each one screen away. A step completes itself when the data
  says so (a sprint exists, a milestone has a date, someone else joined) or
  when the person has followed its "Guide me" -- nothing is tracked beyond
  that, and the whole panel lives in this browser's local storage. Dismiss
  is permanent for this browser; collapse keeps a small pill.
-->
<script lang="ts">
  import contact from '@hcengineering/contact'
  import { createQuery } from '@hcengineering/presentation'
  import { settingId } from '@hcengineering/setting'
  import { trackerId, type Project } from '@hcengineering/tracker'
  import { getCurrentLocation, navigate, showPopup, type AnyComponent } from '@hcengineering/ui'
  import { workbenchId } from '@hcengineering/workbench'

  import tracker from '../../plugin'

  const KEY = 'ceepee.quickstart'
  interface Saved {
    dismissed?: boolean
    collapsed?: boolean
    visited?: string[]
  }
  function load (): Saved {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}')
    } catch {
      return {}
    }
  }
  function save (s: Saved): void {
    state = s
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // private mode: the panel simply forgets between reloads
    }
  }
  let state: Saved = load()
  $: dismissed = state.dismissed === true
  $: collapsed = state.collapsed === true
  const visited = (id: string, s: Saved): boolean => s.visited?.includes(id) === true

  // ---- what the workspace already has ------------------------------------
  const projectQ = createQuery()
  const sprintQ = createQuery()
  const milestoneQ = createQuery()
  const decisionQ = createQuery()
  const peopleQ = createQuery()
  let projects: Project[] = []
  let sprints = 0
  let milestones = 0
  let decisions = 0
  let people = 0
  projectQ.query(
    tracker.class.Project,
    {},
    (r) => {
      projects = r
    },
    { limit: 5 }
  )
  sprintQ.query(
    tracker.class.Sprint,
    {},
    (r) => {
      sprints = r.length
    },
    { limit: 1 }
  )
  milestoneQ.query(
    tracker.class.Milestone,
    {},
    (r) => {
      milestones = r.length
    },
    { limit: 1 }
  )
  decisionQ.query(
    tracker.class.Decision,
    {},
    (r) => {
      decisions = r.length
    },
    { limit: 1 }
  )
  peopleQ.query(
    contact.mixin.Employee,
    { active: true },
    (r) => {
      people = r.length
    },
    { limit: 3 }
  )

  $: project = projects[0]

  function goProject (special: string): void {
    if (project === undefined) return
    const loc = getCurrentLocation()
    navigate({ path: [workbenchId, loc.path[1], trackerId, project._id, special] })
  }
  function goSettings (category: string): void {
    const loc = getCurrentLocation()
    navigate({ path: [workbenchId, loc.path[1], settingId, category] })
  }

  interface Step {
    id: string
    title: string
    text: string
    cta: string
    done: boolean
    go: () => void
  }
  let steps: Step[] = []
  $: steps = [
    {
      id: 'team',
      title: 'Invite your team',
      text: 'Add people, give each a position and a role, and send invite links — all on one screen.',
      cta: 'Open team setup',
      done: people > 1 || visited('team', state),
      go: () => {
        goSettings('team')
      }
    },
    {
      id: 'sprint',
      title: 'Organize your first sprint',
      text: 'Rank the backlog, drag issues into a time-boxed sprint, and start it when the team is ready.',
      cta: 'Open backlog',
      done: sprints > 0 || visited('sprint', state),
      go: () => {
        goProject('backlog')
      }
    },
    {
      id: 'progress',
      title: 'View progress at a glance',
      text: 'Burndown, velocity and cumulative flow, computed from the history you already have.',
      cta: 'Open reports',
      done: visited('progress', state),
      go: () => {
        goProject('reports')
      }
    },
    {
      id: 'deadlines',
      title: 'Stay on top of deadlines',
      text: 'Milestones carry the dates that matter; the dashboard shows what is due this week.',
      cta: 'Open milestones',
      done: milestones > 0 || visited('deadlines', state),
      go: () => {
        goProject('milestones')
      }
    },
    {
      id: 'deps',
      title: 'Visualize dependencies',
      text: 'Mark what blocks what. The Gantt view shows the chain and warns when a shift cascades.',
      cta: 'Open issues',
      done: visited('deps', state),
      go: () => {
        goProject('issues')
      }
    },
    {
      id: 'decide',
      title: 'Record a decision',
      text: 'Write down what was decided and why, so nobody relitigates it in a month.',
      cta: 'Open decisions',
      done: decisions > 0 || visited('decide', state),
      go: () => {
        goProject('decisions')
      }
    },
    {
      id: 'assistant',
      title: 'Ask the assistant',
      text: 'What should I work on next? What went quiet? Ctrl/Cmd-Shift-A anywhere, no API key needed.',
      cta: 'Ask now',
      done: visited('assistant', state),
      go: () => {
        showPopup('tracker:component:Assistant' as AnyComponent, {}, 'top')
      }
    }
  ]
  $: doneCount = steps.filter((s) => s.done).length
  $: pct = steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100)

  let open: string | undefined
  let opened = false
  $: if (!opened && steps.length > 0) {
    open = (steps.find((s) => !s.done) ?? steps[0]).id
    opened = true
  }

  function guide (s: Step): void {
    save({ ...state, visited: Array.from(new Set([...(state.visited ?? []), s.id])) })
    s.go()
  }
</script>

{#if !dismissed}
  {#if collapsed}
    <button
      class="qs-pill"
      on:click={() => {
        save({ ...state, collapsed: false })
      }}
    >
      <span class="qs-pill__spark">✦</span>
      Quickstart
      <span class="qs-pill__n">{doneCount}/{steps.length}</span>
    </button>
  {:else}
    <aside class="qs" aria-label="Quickstart">
      <header class="qs__head">
        <span class="qs__title">Quickstart</span>
        <button
          class="qs__collapse"
          title="Collapse"
          on:click={() => {
            save({ ...state, collapsed: true })
          }}
        >
          ⤡
        </button>
      </header>
      <div class="qs__progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
        <span class="qs__progress-fill" style="width: {pct}%" />
      </div>

      <ul class="qs__steps">
        {#each steps as s, i (s.id)}
          <li class="step motion-rise" style="--i: {i}" class:step--done={s.done} class:step--open={open === s.id}>
            <button
              class="step__row"
              on:click={() => {
                open = open === s.id ? undefined : s.id
              }}
            >
              <span class="step__check">{#if s.done}✓{/if}</span>
              <span class="step__title">{s.title}</span>
              <span class="step__chev">▾</span>
            </button>
            {#if open === s.id}
              <div class="step__body motion-rise">
                <div class="illus">
                  <span class="illus__label">{s.title.split(' ').slice(-1)[0]}</span>
                  <span class="illus__row"><i style="width: 55%" /><i class="illus__accent" style="width: 18%" /></span>
                  <span class="illus__row"><i style="width: 40%" /><i class="illus__accent" style="width: 12%" /></span>
                  <span class="illus__row"><i style="width: 62%" /><i class="illus__accent" style="width: 22%" /></span>
                  <span class="illus__row"><i style="width: 35%" /><i class="illus__accent" style="width: 15%" /></span>
                </div>
                <p class="step__text">{s.text}</p>
                <button
                  class="step__cta"
                  on:click={() => {
                    guide(s)
                  }}
                >
                  {s.cta}
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      <button
        class="qs__dismiss"
        on:click={() => {
          save({ ...state, dismissed: true })
        }}
      >
        Dismiss Quickstart
      </button>
    </aside>
  {/if}
{/if}

<style lang="scss">
  .qs,
  .qs-pill {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 50;
    font-size: 0.875rem;
  }
  @media (max-width: 900px) {
    .qs,
    .qs-pill {
      display: none;
    }
  }
  .qs {
    display: flex;
    flex-direction: column;
    width: 21rem;
    max-height: min(42rem, 80vh);
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.9rem;
    box-shadow: var(--theme-popup-shadow);
    overflow: hidden;
    animation: surfaceIn var(--motion-slow) var(--ease-enter) both;
  }
  .qs__head {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0.9rem 1rem 0.5rem;
  }
  .qs__title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--theme-caption-color);
  }
  .qs__collapse {
    position: absolute;
    right: 0.6rem;
    top: 0.6rem;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.4rem;
    background: transparent;
    color: var(--theme-dark-color);
    font: inherit;
    cursor: pointer;
    &:hover {
      background: var(--theme-button-hovered);
      color: var(--theme-caption-color);
    }
  }
  .qs__progress {
    margin: 0.25rem 1rem 0.5rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--theme-button-pressed);
    overflow: hidden;
  }
  .qs__progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-image: var(--accent-gradient);
    transition: width var(--motion-slow) var(--ease-enter);
  }
  .qs__steps {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }
  .step {
    border-top: 1px solid var(--theme-divider-color);
    &--done .step__check {
      background: var(--theme-caption-color);
      color: var(--theme-popup-color);
      border-color: transparent;
    }
    &--open .step__chev {
      transform: rotate(180deg);
    }
  }
  .step__row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.8rem 1rem;
    border: none;
    background: transparent;
    color: var(--theme-caption-color);
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--motion-fast) var(--ease-standard);
    &:hover {
      background: var(--theme-button-hovered);
    }
  }
  .step__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.15rem;
    height: 1.15rem;
    border: 1.5px solid var(--theme-trans-color);
    border-radius: 50%;
    font-size: 0.7rem;
    transition: var(--transition-interactive);
  }
  .step__title {
    flex: 1;
  }
  .step__chev {
    color: var(--theme-trans-color);
    transition: transform var(--motion-base) var(--ease-standard);
  }
  .step__body {
    padding: 0 1rem 1rem;
  }
  .illus {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.75rem;
    border: 3px solid transparent;
    border-radius: 0.75rem;
    background:
      linear-gradient(var(--theme-panel-color), var(--theme-panel-color)) padding-box,
      var(--accent-gradient) border-box;
  }
  .illus__label {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--theme-caption-color);
    text-transform: capitalize;
  }
  .illus__row {
    display: flex;
    gap: 0.4rem;
    i {
      display: block;
      height: 0.4rem;
      border-radius: 999px;
      background: var(--theme-button-pressed);
    }
    .illus__accent {
      background-image: var(--accent-gradient);
    }
  }
  .step__text {
    margin: 0 0 0.75rem;
    color: var(--theme-content-color);
    line-height: 1.45;
  }
  .step__cta {
    padding: 0.5rem 0.9rem;
    border: none;
    border-radius: 0.5rem;
    background-image: var(--accent-gradient);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform var(--motion-fast) var(--ease-standard),
      box-shadow var(--motion-fast) var(--ease-standard),
      filter var(--motion-fast) var(--ease-standard);
    &:hover {
      box-shadow: var(--accent-glow);
      filter: brightness(1.08);
    }
    &:active {
      transform: scale(0.97);
    }
  }
  .qs__dismiss {
    padding: 0.75rem 1rem;
    border: none;
    border-top: 1px solid var(--theme-divider-color);
    background: var(--theme-comp-header-color);
    color: var(--theme-content-color);
    font: inherit;
    cursor: pointer;
    &:hover {
      color: var(--theme-caption-color);
      background: var(--theme-button-hovered);
    }
  }
  .qs-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--theme-popup-divider);
    border-radius: 999px;
    background: var(--theme-popup-color);
    color: var(--theme-caption-color);
    font: inherit;
    font-weight: 600;
    box-shadow: var(--theme-popup-shadow);
    cursor: pointer;
    animation: popIn var(--motion-base) var(--ease-emphasis) both;
    &:hover {
      box-shadow: var(--accent-glow);
    }
  }
  .qs-pill__spark {
    color: var(--accent-brand);
  }
  .qs-pill__n {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
</style>
