import { useState } from 'react'
import './App.css'

type Provider = 'Ollama Local' | 'Ollama Cloud' | 'OpenRouter' | 'Unknown'

type Launcher = {
  name: string
  provider: Provider
  model: string
  purpose: string
  bestUse: string
  risk: 'Low' | 'Medium' | 'High'
  baseUrl: string
  auth: string
}

const projectPath = '/mnt/d/workspace/hermes/projects/open-source/local-agent-control'

const launchers: Launcher[] = [
  {
    name: 'Ollama Cloud',
    provider: 'Ollama Cloud',
    model: 'minimax-m2.5:cloud',
    purpose: 'High-capability remote model routed through your local Ollama service.',
    bestUse: 'Hard planning, bigger edits, and moments where local models need backup.',
    risk: 'Medium',
    baseUrl: 'http://172.18.16.1:11434',
    auth: 'ollama',
  },
  {
    name: 'Local planner',
    provider: 'Ollama Local',
    model: 'qwen3:14b',
    purpose: 'Local reasoning pass for breaking work into safe, inspectable steps.',
    bestUse: 'Planning, reviews, architecture notes, and pre-edit analysis.',
    risk: 'Low',
    baseUrl: 'http://172.18.16.1:11434',
    auth: 'ollama',
  },
  {
    name: 'Local coder',
    provider: 'Ollama Local',
    model: 'qwen2.5-coder:7b',
    purpose: 'Fast local coding loop for scoped implementation and test fixes.',
    bestUse: 'Small React, TypeScript, shell, and repository editing tasks.',
    risk: 'Low',
    baseUrl: 'http://172.18.16.1:11434',
    auth: 'ollama',
  },
  {
    name: 'OpenRouter fallback',
    provider: 'OpenRouter',
    model: 'qwen/qwen-2.5-coder-32b-instruct',
    purpose: 'Cloud fallback when local Ollama and Ollama Cloud are not enough.',
    bestUse: 'Rare compatibility fallback, larger context needs, or model comparison.',
    risk: 'High',
    baseUrl: 'https://openrouter.ai/api/v1',
    auth: '${OPENROUTER_API_KEY:-replace-with-openrouter-token}',
  },
]

function commandFor(launcher: Launcher) {
  return [
    `cd ${projectPath}`,
    `LLM_MODEL="${launcher.model}" \\`,
    `LLM_BASE_URL="${launcher.baseUrl}" \\`,
    `LLM_API_KEY="${launcher.auth}" \\`,
    'openhands --override-with-envs',
  ].join('\n')
}

const smartScript = `#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH="/mnt/d/workspace/hermes/projects/open-source/local-agent-control"
MODE="\${1:-coder}"

case "$MODE" in
  cloud)
    export LLM_MODEL="minimax-m2.5:cloud"
    export LLM_BASE_URL="http://172.18.16.1:11434"
    export LLM_API_KEY="\${LLM_API_KEY:-ollama}"
    ;;
  planner)
    export LLM_MODEL="qwen3:14b"
    export LLM_BASE_URL="http://172.18.16.1:11434"
    export LLM_API_KEY="\${LLM_API_KEY:-ollama}"
    ;;
  coder)
    export LLM_MODEL="qwen2.5-coder:7b"
    export LLM_BASE_URL="http://172.18.16.1:11434"
    export LLM_API_KEY="\${LLM_API_KEY:-ollama}"
    ;;
  openrouter)
    export LLM_MODEL="qwen/qwen-2.5-coder-32b-instruct"
    export LLM_BASE_URL="https://openrouter.ai/api/v1"
    export LLM_API_KEY="\${OPENROUTER_API_KEY:-<OPENROUTER_API_KEY>}"
    ;;
  ollama-cloud-direct)
    export LLM_MODEL="minimax-m2.5:cloud"
    export LLM_BASE_URL="https://ollama.com/api"
    export LLM_API_KEY="\${OLLAMA_API_KEY:-<OLLAMA_API_KEY>}"
    ;;
  *)
    echo "Usage: ~/start-openhands-smart.sh [cloud|planner|coder|openrouter|ollama-cloud-direct]"
    exit 1
    ;;
esac

cd "$PROJECT_PATH"
openhands --override-with-envs`

const scriptInstallCommand = `cat > ~/start-openhands-smart.sh <<'EOF'
${smartScript}
EOF
chmod 700 ~/start-openhands-smart.sh`

function App() {
  const [activeProvider, setActiveProvider] = useState<Provider>('Unknown')
  const [selectedModel, setSelectedModel] = useState('No launcher copied yet')
  const [lastCommand, setLastCommand] = useState('Nothing copied yet')

  async function copyText(text: string, provider: Provider, model: string) {
    await navigator.clipboard.writeText(text)
    setActiveProvider(provider)
    setSelectedModel(model)
    setLastCommand(text.split('\n')[0])
  }

  const safetyStatus =
    activeProvider === 'OpenRouter'
      ? 'Cloud fallback selected. Use placeholders and keep keys in environment variables.'
      : 'Copy-safe. No real API keys are embedded.'

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Local Agent Control</p>
          <h1>Launch OpenHands against the right model without touching secrets.</h1>
        </div>
        <p className="lede">
          A small local control panel for WSL, Ollama local, Ollama Cloud, and an OpenRouter fallback.
        </p>
      </section>

      <section className="dashboard" aria-label="Current launcher status">
        <div className="status-tile">
          <span>Active provider</span>
          <strong>{activeProvider}</strong>
        </div>
        <div className="status-tile">
          <span>Selected model</span>
          <strong>{selectedModel}</strong>
        </div>
        <div className="status-tile wide">
          <span>Project path</span>
          <strong>{projectPath}</strong>
        </div>
        <div className="status-tile wide">
          <span>Last command copied</span>
          <strong>{lastCommand}</strong>
        </div>
        <div className="status-tile safety">
          <span>Safety status</span>
          <strong>{safetyStatus}</strong>
        </div>
      </section>

      <section className="launchers" aria-label="Model launcher cards">
        {launchers.map((launcher) => {
          const command = commandFor(launcher)

          return (
            <article className="launcher-card" key={launcher.name}>
              <div className="card-heading">
                <div>
                  <p>{launcher.provider}</p>
                  <h2>{launcher.name}</h2>
                </div>
                <span className={`risk risk-${launcher.risk.toLowerCase()}`}>{launcher.risk}</span>
              </div>
              <dl>
                <div>
                  <dt>Model</dt>
                  <dd>{launcher.model}</dd>
                </div>
                <div>
                  <dt>Purpose</dt>
                  <dd>{launcher.purpose}</dd>
                </div>
                <div>
                  <dt>Best use case</dt>
                  <dd>{launcher.bestUse}</dd>
                </div>
              </dl>
              <pre>{command}</pre>
              <button type="button" onClick={() => copyText(command, launcher.provider, launcher.model)}>
                Copy WSL command
              </button>
            </article>
          )
        })}
      </section>

      <section className="script-section" aria-labelledby="smart-script-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Generated script</p>
            <h2 id="smart-script-title">~/start-openhands-smart.sh</h2>
          </div>
          <button
            type="button"
            onClick={() => copyText(scriptInstallCommand, 'Unknown', '~/start-openhands-smart.sh')}
          >
            Copy installer
          </button>
        </div>
        <pre>{smartScript}</pre>
      </section>

      <section className="deployment" aria-labelledby="deployment-title">
        <p className="eyebrow">Oracle VM deployment</p>
        <h2 id="deployment-title">Static build, nginx, no Docker</h2>
        <ol>
          <li>Clone the repository on the VM.</li>
          <li>Run npm install.</li>
          <li>Run npm run build.</li>
          <li>Serve the generated dist directory with nginx.</li>
          <li>Keep API keys in server or shell environment variables. Commit no secrets.</li>
        </ol>
        <pre>{`git clone <REPO_URL> local-agent-control
cd local-agent-control
npm install
npm run build
sudo cp -r dist/* /var/www/local-agent-control/
sudo nginx -t
sudo systemctl reload nginx`}</pre>
      </section>
    </main>
  )
}

export default App
