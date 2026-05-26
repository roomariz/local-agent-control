import { useMemo, useState } from 'react'
import './App.css'

type EfficiencyMode = 'Free assisted' | 'Balanced' | 'Reliable'
type Provider = 'Ollama Local' | 'Ollama Cloud' | 'OpenRouter'

type Route = {
  mode: string
  selectedModel: string
  provider: Provider
  costLabel: string
  privacyLabel: string
  reason: string
  warning?: string
  fallbackNote?: string
}

const defaultProjectPath = '/mnt/d/workspace/hermes/projects/open-source/local-agent-control'
const taskExample =
  'Inspect src/App.tsx and src/App.css. Add a router warning banner. Do not install dependencies. Run npm run build.'
const localWarning = 'Local models may fail OpenHands tool-call formatting.'

const modes: EfficiencyMode[] = ['Free assisted', 'Balanced', 'Reliable']

const planningTerms = ['planning', 'plan', 'review', 'design', 'explain', 'architecture', 'inspect']
const smallTerms = ['small', 'css', 'readme', 'typo', 'copy', 'simple', 'tiny', 'text', 'polish']
const codingTerms = ['implement', 'debug', 'refactor', 'multi-file', 'build', 'failing', 'feature', 'fix']
const fallbackTerms = ['openrouter', 'hard fallback', 'fallback']

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term))
}

function detectRoute(task: string, efficiencyMode: EfficiencyMode): Route {
  const normalizedTask = task.toLowerCase()
  const isPlanning = includesAny(normalizedTask, planningTerms)
  const isSmall = includesAny(normalizedTask, smallTerms)
  const isCoding = includesAny(normalizedTask, codingTerms)
  const requestsFallback = includesAny(normalizedTask, fallbackTerms)

  if (efficiencyMode === 'Free assisted') {
    if (isSmall) {
      return {
        mode: 'Free assisted',
        selectedModel: 'openai/qwen2.5-coder:7b',
        provider: 'Ollama Local',
        costLabel: 'Free local',
        privacyLabel: 'Local through Ollama',
        reason: 'Small, CSS, README, typo, copy, and simple tasks route to the local coder.',
        warning: `Experimental local OpenHands mode. ${localWarning}`,
      }
    }

    return {
      mode: 'Free assisted',
      selectedModel: 'openai/qwen3:14b',
      provider: 'Ollama Local',
      costLabel: 'Free local',
      privacyLabel: 'Local through Ollama',
      reason: isPlanning
        ? 'Planning, review, design, and explanation tasks route to the local planner.'
        : 'Free assisted defaults to the local planner when the task is not clearly tiny.',
      warning: `Experimental local OpenHands mode. ${localWarning}`,
    }
  }

  if (efficiencyMode === 'Balanced') {
    if (isSmall) {
      return {
        mode: 'Balanced',
        selectedModel: 'openai/qwen2.5-coder:7b',
        provider: 'Ollama Local',
        costLabel: 'Free local',
        privacyLabel: 'Local through Ollama',
        reason: 'The task looks small or text/CSS-oriented, so Balanced starts with the local coder.',
        warning: `Experimental local OpenHands mode. ${localWarning}`,
        fallbackNote: 'If local tool calls fail, rerun in Reliable mode or use OpenRouter fallback.',
      }
    }

    if (isPlanning) {
      return {
        mode: 'Balanced',
        selectedModel: 'openai/qwen3:14b',
        provider: 'Ollama Local',
        costLabel: 'Free local',
        privacyLabel: 'Local through Ollama',
        reason: 'The task reads like planning, review, design, or explanation work.',
        warning: `Experimental local OpenHands mode. ${localWarning}`,
        fallbackNote: 'If local tool calls fail, rerun in Reliable mode or use OpenRouter fallback.',
      }
    }

    return {
      mode: 'Balanced',
      selectedModel: 'openai/minimax-m2.5:cloud',
      provider: 'Ollama Cloud',
      costLabel: 'Paid cloud',
      privacyLabel: 'Remote model via local Ollama endpoint',
      reason: isCoding
        ? 'Implementation, debugging, refactors, build failures, and feature work route to Ollama Cloud.'
        : 'Balanced defaults autonomous OpenHands work to Ollama Cloud.',
      fallbackNote: 'OpenRouter fallback is available if cloud fails.',
    }
  }

  if (requestsFallback) {
    return {
      mode: 'Reliable',
      selectedModel: 'openrouter/qwen/qwen-2.5-coder-32b-instruct',
      provider: 'OpenRouter',
      costLabel: 'Paid fallback',
      privacyLabel: 'Remote OpenRouter request',
      reason: 'The task explicitly asks for fallback routing.',
      fallbackNote: 'LLM_BASE_URL is unset for OpenRouter and the key is read from OPENROUTER_API_KEY.',
    }
  }

  if (isSmall || isPlanning) {
    return {
      mode: 'Reliable',
      selectedModel: isSmall ? 'openai/qwen2.5-coder:7b' : 'openai/qwen3:14b',
      provider: 'Ollama Local',
      costLabel: 'Free local',
      privacyLabel: 'Local through Ollama',
      reason: isSmall
        ? 'Reliable allows local routing only for tiny edits.'
        : 'Reliable allows local routing for planning before autonomous work.',
      warning: `Experimental local OpenHands mode. ${localWarning}`,
      fallbackNote: 'Default autonomous coding still uses Ollama Cloud.',
    }
  }

  return {
    mode: 'Reliable',
    selectedModel: 'openai/minimax-m2.5:cloud',
    provider: 'Ollama Cloud',
    costLabel: 'Paid cloud',
    privacyLabel: 'Remote model via local Ollama endpoint',
    reason: 'Reliable defaults autonomous coding to Ollama Cloud.',
    fallbackNote: 'Hard fallback: openrouter/qwen/qwen-2.5-coder-32b-instruct.',
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

const agentRouterScript = `#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH="\${1:-/mnt/d/workspace/hermes/projects/open-source/local-agent-control}"
TASK="\${2:-}"
MODE="\${3:-balanced}"

if [[ -z "$TASK" ]]; then
  echo "Usage: ~/agent-router.sh <project-path> <task> [free|balanced|reliable]"
  exit 1
fi

TASK_LOWER="$(printf '%s' "$TASK" | tr '[:upper:]' '[:lower:]')"
MODE_LOWER="$(printf '%s' "$MODE" | tr '[:upper:]' '[:lower:]')"
ROUTE="cloud"

is_planning=false
is_small=false
is_coding=false
requests_fallback=false

case "$TASK_LOWER" in
  *planning*|*plan*|*review*|*design*|*explain*|*architecture*|*inspect*) is_planning=true ;;
esac

case "$TASK_LOWER" in
  *small*|*css*|*readme*|*typo*|*copy*|*simple*|*tiny*|*text*|*polish*) is_small=true ;;
esac

case "$TASK_LOWER" in
  *implement*|*debug*|*refactor*|*multi-file*|*build*|*failing*|*feature*|*fix*) is_coding=true ;;
esac

case "$TASK_LOWER" in
  *openrouter*|*"hard fallback"*|*fallback*) requests_fallback=true ;;
esac

case "$MODE_LOWER" in
  free|free-assisted|"free assisted")
    if [[ "$is_small" == true ]]; then
      ROUTE="local-coder"
    else
      ROUTE="local-planner"
    fi
    ;;
  balanced)
    if [[ "$is_small" == true ]]; then
      ROUTE="local-coder"
    elif [[ "$is_planning" == true ]]; then
      ROUTE="local-planner"
    else
      ROUTE="cloud"
    fi
    ;;
  reliable)
    if [[ "$requests_fallback" == true ]]; then
      ROUTE="openrouter"
    elif [[ "$is_small" == true ]]; then
      ROUTE="local-coder"
    elif [[ "$is_planning" == true && "$is_coding" == false ]]; then
      ROUTE="local-planner"
    else
      ROUTE="cloud"
    fi
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Use: free, balanced, or reliable"
    exit 1
    ;;
esac

case "$ROUTE" in
  local-planner)
    echo "Warning: local OpenHands mode is experimental. Local models may fail tool-call formatting."
    export LLM_MODEL="openai/qwen3:14b"
    export LLM_BASE_URL="http://172.18.16.1:11434/v1"
    export LLM_API_KEY="ollama"
    ;;
  local-coder)
    echo "Warning: local OpenHands mode is experimental. Local models may fail tool-call formatting."
    export LLM_MODEL="openai/qwen2.5-coder:7b"
    export LLM_BASE_URL="http://172.18.16.1:11434/v1"
    export LLM_API_KEY="ollama"
    ;;
  cloud)
    export LLM_MODEL="openai/minimax-m2.5:cloud"
    export LLM_BASE_URL="http://172.18.16.1:11434/v1"
    export LLM_API_KEY="ollama"
    ;;
  openrouter)
    export LLM_MODEL="openrouter/qwen/qwen-2.5-coder-32b-instruct"
    unset LLM_BASE_URL
    export LLM_API_KEY="\${OPENROUTER_API_KEY}"
    ;;
esac

echo "Mode: $MODE_LOWER"
echo "Route: $ROUTE"
echo "Model: $LLM_MODEL"

cd "$PROJECT_PATH"
openhands --override-with-envs -t "$TASK"`

const installCommand = `cat > ~/agent-router.sh <<'EOF'
${agentRouterScript}
EOF
chmod 700 ~/agent-router.sh`

function App() {
  const [task, setTask] = useState('')
  const [projectPath, setProjectPath] = useState(defaultProjectPath)
  const [efficiencyMode, setEfficiencyMode] = useState<EfficiencyMode>('Balanced')
  const [copiedLabel, setCopiedLabel] = useState('Ready')

  const route = useMemo(() => detectRoute(task, efficiencyMode), [task, efficiencyMode])
  const taskForCommand = task.trim() || taskExample
  const command = `~/agent-router.sh ${shellQuote(projectPath)} ${shellQuote(taskForCommand)} ${shellQuote(
    efficiencyMode.toLowerCase().replace(' ', '-'),
  )}`

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopiedLabel(label)
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Local Agent Control</p>
        <h1>Describe the coding task once. Copy one OpenHands command.</h1>
        <p className="lede">
          A Cursor and Claude CLI style task launcher for WSL, local Ollama, Ollama Cloud, and OpenRouter
          fallback routing.
        </p>
      </section>

      <section className="launcher" aria-labelledby="launcher-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Task launcher</p>
            <h2 id="launcher-title">Route the task</h2>
          </div>
          <span className="copy-state">{copiedLabel}</span>
        </div>

        <div className="control-grid">
          <label className="field task-field">
            <span>Task</span>
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Describe the coding task..."
              rows={7}
            />
            <small>{taskExample}</small>
          </label>

          <div className="side-controls">
            <label className="field">
              <span>Project path</span>
              <input
                type="text"
                value={projectPath}
                onChange={(event) => setProjectPath(event.target.value)}
              />
            </label>

            <fieldset className="mode-selector">
              <legend>Efficiency mode</legend>
              {modes.map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name="efficiency-mode"
                    value={mode}
                    checked={efficiencyMode === mode}
                    onChange={() => setEfficiencyMode(mode)}
                  />
                  <span>{mode}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>

        <div className="route-preview" aria-label="Detected route preview">
          <div>
            <span>Mode</span>
            <strong>{route.mode}</strong>
          </div>
          <div>
            <span>Selected model</span>
            <strong>{route.selectedModel}</strong>
          </div>
          <div>
            <span>Provider</span>
            <strong>{route.provider}</strong>
          </div>
          <div>
            <span>Cost</span>
            <strong>{route.costLabel}</strong>
          </div>
          <div>
            <span>Privacy</span>
            <strong>{route.privacyLabel}</strong>
          </div>
          <div className="reason">
            <span>Reason</span>
            <strong>{route.reason}</strong>
          </div>
        </div>

        {route.warning ? <p className="warning">{route.warning}</p> : null}
        {route.fallbackNote ? <p className="note">{route.fallbackNote}</p> : null}

        <div className="command-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Generated command</p>
              <h2>Run in WSL</h2>
            </div>
            <button type="button" onClick={() => copyText(command, 'Command copied')}>
              Copy
            </button>
          </div>
          <pre>{command}</pre>
        </div>
      </section>

      <section className="script-section" aria-labelledby="router-script-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Displayed script</p>
            <h2 id="router-script-title">~/agent-router.sh</h2>
          </div>
          <button type="button" onClick={() => copyText(installCommand, 'Installer copied')}>
            Copy installer
          </button>
        </div>
        <p className="note">
          The script accepts project path, task, and optional mode. It never embeds real API keys.
        </p>
        <pre>{agentRouterScript}</pre>
      </section>
    </main>
  )
}

export default App
