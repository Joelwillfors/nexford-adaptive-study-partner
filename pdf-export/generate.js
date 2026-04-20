#!/usr/bin/env node
/**
 * AI Systems Portfolio — PDF Generator
 * Fetches SVGs from mermaid.ink for each diagram, builds a styled HTML,
 * then uses system Chrome headless to print to PDF.
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ── Diagrams (mermaid source) ────────────────────────────────────────

const DIAGRAMS = {
  nexford: `flowchart TD
    subgraph StudentFlow [Student Portal]
        S[Student asks question]
    end
    subgraph TeacherFlow [Teacher Portal]
        T[Teacher uploads PDF]
        TD[Teacher Dashboard]
    end
    subgraph IngestionPipeline [Document Ingestion Pipeline]
        UP[POST /api/ingest -- 202 Accepted]
        QU[(grading_tasks queue)]
        EX[PDF text extraction]
        CH[Overlap-aware chunking]
        EM[Batch embeddings text-embedding-3-small]
        VDB[(pgvector document_embeddings)]
    end
    subgraph MentorPipeline [Socratic Mentor Agent]
        CA[POST /api/chat]
        EMQ[Embed student question]
        RPC[match_documents RPC cosine threshold 0.50]
        GPT[GPT-4o Socratic system prompt]
        RES[One Socratic question or Exit Condition]
    end
    subgraph ProfilerAgent [Profiler Agent Async]
        PA[fire-and-forget background]
        KG[(learner_profiles knowledge_graph JSONB)]
    end
    T --> UP --> QU --> EX --> CH --> EM --> VDB
    S --> CA --> EMQ --> RPC --> VDB
    RPC --> GPT --> RES --> S
    CA --> PA --> KG --> TD`,

  sweetspot: `flowchart TD
    DA[Discovery Agent] --> FS
    EX[Explore Page] --> ER
    CH[Travel Chat] --> TC
    MA[My Alerts] --> SA
    FS[find-sweetspots Core Engine] --> SG[Stormglass API]
    FS --> SERP[SerpAPI Google Flights]
    FS --> WC[(weather cache)]
    FS --> FC[(flight cache)]
    FS --> PRO[(profiles)]
    ER[explore-radar] --> WC
    TC[travel-chat] --> AIGTW[AI Gateway]
    PA[process-alerts] --> FS
    PA --> SA[(surf alerts)]
    PA --> RESEND[Resend Email]
    RWC[refresh-weather-cache] --> WGU[Windguru Scraper]
    RWC --> OM[Open-Meteo]
    RWC --> WC
    CCS[checkout + webhook] --> STRIPE[Stripe]`,

  alphaDesk: `flowchart TD
    subgraph Entry [Entry Points]
        HTTP[POST /snipe -- 202 Accepted]
        RT[Supabase Realtime worker trigger]
    end
    subgraph Queue [Idempotent Task Queue]
        QU[(scrape_tasks claimTask contract)]
    end
    subgraph Scraping [Data Ingestion]
        PUP[Puppeteer scraper listing data]
        PDF[PDF parser prospectus]
        EXT[Boliga + BBR registries]
    end
    subgraph EvidenceTiers [Deterministic Evidence Tiering]
        T0[TIER 0 Binding registry facts]
        T1[TIER 1 Historical comps]
        T2[TIER 2 Marketing text]
    end
    subgraph Agents [Specialist Agents]
        CFO[CFO Agent financial analysis]
        VIS[Visual Agent photo assessment]
        ARC[Architect Agent structural eval]
        AUD[Auditor Agent legal scan]
    end
    subgraph Council [Council Appraiser]
        VY[Visionary persona upside]
        CY[Cynic persona risks]
        QT[Quant persona numbers]
        LP[Lead Partner synthesis verdict + spread + conviction]
    end
    subgraph Output [AlphaDesk Frontend]
        UI[Verdict + range bar + negotiation playbook]
    end
    HTTP --> QU
    RT --> QU
    QU --> PUP & PDF & EXT
    PUP & PDF & EXT --> T0 & T1 & T2
    T0 & T1 & T2 --> CFO & VIS & ARC & AUD
    CFO & VIS & ARC & AUD --> VY & CY & QT
    VY & CY & QT --> LP --> UI`,
};

// ── Fetch SVG from mermaid.ink ───────────────────────────────────────

function fetchSvg(mermaidCode) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(mermaidCode, "utf-8").toString("base64url");
    const url = `https://mermaid.ink/svg/${encoded}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`mermaid.ink returned ${res.statusCode}`));
      });
    }).on("error", reject);
  });
}

// ── Build HTML ───────────────────────────────────────────────────────

function buildHtml(svgs) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Systems Portfolio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 10.5pt;
    line-height: 1.6;
    color: #111;
    background: #fff;
    padding: 0;
  }

  /* ── Cover Page ── */
  .cover {
    page-break-after: always;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px 72px;
    border-bottom: 3px solid #FFB300;
  }
  .cover-eyebrow {
    font-size: 9pt;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 20px;
  }
  .cover-title {
    font-size: 42pt;
    font-weight: 700;
    line-height: 1.1;
    color: #0f0f0f;
    margin-bottom: 12px;
  }
  .cover-title span { color: #FFB300; }
  .cover-subtitle {
    font-size: 13pt;
    font-weight: 400;
    color: #6b7280;
    margin-bottom: 56px;
  }
  .cover-meta {
    display: flex;
    gap: 48px;
    margin-top: auto;
    padding-top: 48px;
    border-top: 1px solid #e5e7eb;
  }
  .cover-meta-item { }
  .cover-meta-label {
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 4px;
  }
  .cover-meta-value {
    font-size: 10pt;
    font-weight: 500;
    color: #0f0f0f;
  }
  .cover-tag {
    display: inline-block;
    background: #FFB300;
    color: #0f0f0f;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 4px;
    margin-bottom: 24px;
  }

  /* ── Page Layout ── */
  .page {
    padding: 56px 72px;
    page-break-before: always;
  }

  /* ── Section Header ── */
  .section-number {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #FFB300;
    margin-bottom: 6px;
  }
  .section-title {
    font-size: 22pt;
    font-weight: 700;
    color: #0f0f0f;
    line-height: 1.2;
    margin-bottom: 4px;
  }
  .section-badge {
    display: inline-block;
    font-size: 8pt;
    font-weight: 500;
    color: #6b7280;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 2px 8px;
    margin-bottom: 8px;
  }
  .section-context {
    font-size: 10.5pt;
    color: #374151;
    line-height: 1.65;
    margin-bottom: 24px;
    max-width: 680px;
  }

  /* ── Stack Pills ── */
  .stack {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 28px;
  }
  .stack-label {
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 8px;
    display: block;
  }
  .pill {
    font-size: 8.5pt;
    font-weight: 500;
    color: #374151;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 3px 9px;
  }

  /* ── Diagram ── */
  .diagram-block {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 24px;
    margin: 24px 0;
    text-align: center;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .diagram-label {
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 16px;
  }
  .diagram-block svg {
    max-width: 100%;
    height: auto;
    max-height: 420px;
  }

  /* ── Project Metadata Bar ── */
  .project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    padding: 12px 0;
    margin: 12px 0 20px;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .project-meta-label {
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 3px;
  }
  .project-meta-value {
    font-size: 9pt;
    font-weight: 500;
    color: #374151;
  }

  /* ── Engineering Decisions ── */
  .decisions-title {
    font-size: 11pt;
    font-weight: 600;
    color: #0f0f0f;
    margin: 28px 0 12px;
    break-after: avoid;
  }

  .decision {
    border-left: 3px solid #FFB300;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: #fffbeb;
    border-radius: 0 6px 6px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .decision-title {
    font-size: 9.5pt;
    font-weight: 600;
    color: #0f0f0f;
    margin-bottom: 4px;
  }
  .decision-body {
    font-size: 9.5pt;
    color: #374151;
    line-height: 1.6;
  }

  .stack-label {
    break-after: avoid;
    page-break-after: avoid;
  }

  /* ── Prompt Iteration Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin: 20px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  th {
    background: #f3f4f6;
    font-weight: 600;
    font-size: 8pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6b7280;
    padding: 8px 12px;
    text-align: left;
    border-bottom: 2px solid #e5e7eb;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
    line-height: 1.5;
    color: #374151;
  }
  tr:last-child td { border-bottom: none; }
  td:first-child { font-weight: 500; color: #ef4444; }
  td:nth-child(2) { color: #6b7280; }
  td:last-child { color: #059669; font-weight: 500; }

  /* ── Closing ── */
  .closing {
    page-break-before: always;
    padding: 56px 72px;
  }
  .closing-title {
    font-size: 18pt;
    font-weight: 700;
    color: #0f0f0f;
    margin-bottom: 24px;
  }
  .three-col {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 28px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .col-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .col-card-title {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #FFB300;
    margin-bottom: 8px;
  }
  .col-card-body {
    font-size: 9.5pt;
    color: #374151;
    line-height: 1.6;
  }
  .closing-principles {
    margin-top: 32px;
    padding: 20px 24px;
    background: #0f0f0f;
    border-radius: 8px;
    color: #fff;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .closing-principles p {
    font-size: 10pt;
    line-height: 1.7;
    color: #d1d5db;
    margin-bottom: 10px;
  }
  .closing-principles p:last-child { margin-bottom: 0; }
  .closing-principles strong { color: #FFB300; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page, .cover, .closing { padding: 40px 56px; }
  }
</style>
</head>
<body>

<!-- ══ COVER ══════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-tag">Technical Portfolio</div>
  <div class="cover-eyebrow">AI Product Specialist · Nexford University</div>
  <div class="cover-title">AI Systems<br><span>Portfolio</span></div>
  <div class="cover-subtitle">Rapid Prototyping &middot; Agentic Orchestration &middot; Production Architecture</div>

  <div style="max-width:640px;font-size:10.5pt;color:#374151;line-height:1.7;margin-top:32px;">
    Three projects demonstrating a consistent pattern: treating the model as one stage in a system,
    not the system itself. Each was built under real constraints — time pressure, API rate limits,
    pedagogical requirements — and each required explicit product decisions about what the AI
    should and should not do.
  </div>

  <div class="cover-meta">
    <div class="cover-meta-item">
      <div class="cover-meta-label">Projects</div>
      <div class="cover-meta-value">Nexford Socratic Evaluator · SweetSpot · AlphaDesk</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Core Skills</div>
      <div class="cover-meta-value">RAG · Multi-Agent Orchestration · Prompt Engineering</div>
    </div>
  </div>
</div>

<!-- ══ PROJECT 1: NEXFORD SOCRATIC EVALUATOR ══════════════════════════ -->
<div class="page">
  <div class="section-number">Project 01</div>
  <div class="section-title">Nexford Socratic Evaluator</div>
  <div class="section-badge">R&amp;D Prototype &mdash; Built in under 12 hours</div>

  <div class="project-meta">
    <div><div class="project-meta-label">Build Time</div><div class="project-meta-value">Under 12 hours</div></div>
    <div><div class="project-meta-label">Agents</div><div class="project-meta-value">2 (Socratic Mentor + Profiler)</div></div>
    <div><div class="project-meta-label">Core Skills</div><div class="project-meta-value">RAG &middot; Prompt Engineering &middot; Multi-Agent Orchestration &middot; Knowledge Graphs</div></div>
  </div>

  <div class="section-context">
    The problem this addresses is well-validated: Fermi &mdash; the adaptive learning product from the founders of Sana Labs &mdash;
    recently raised $100M+ on the thesis that knowing <em>where</em> a student's reasoning breaks down, not just <em>whether</em>
    they got the answer right, is the next frontier in EdTech. This prototype builds toward that same thesis: a system that forces
    students to reason through problems rather than retrieve answers, while simultaneously generating structured diagnostics that
    tell teachers exactly which concepts are failing and why.
  </div>

  <span class="stack-label">Stack</span>
  <div class="stack">
    <span class="pill">Next.js 15</span>
    <span class="pill">TypeScript</span>
    <span class="pill">Supabase</span>
    <span class="pill">pgvector</span>
    <span class="pill">OpenAI text-embedding-3-small</span>
    <span class="pill">GPT-4o</span>
    <span class="pill">Tailwind CSS v4</span>
  </div>

  <div class="diagram-block">
    <div class="diagram-label">System Architecture — Dual-Agent Pipeline</div>
    ${svgs.nexford}
  </div>

  <div class="decisions-title">Key Engineering Decisions</div>

  <div class="decision">
    <div class="decision-title">Dual-agent orchestration</div>
    <div class="decision-body">
      The Socratic Mentor runs synchronously (the student waits for it) while the Profiler Agent fires
      asynchronously after every exchange via a 202 Accepted pattern on <code>/api/ingest</code>. They share the same interaction but serve different principals:
      the student gets a question, the teacher gets a diagnostic. The separation is a product decision, not a technical one.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">Actionable knowledge graphs</div>
    <div class="decision-body">
      The Profiler Agent writes structured data into a JSONB knowledge graph: <code>reasoning_step_failed</code>
      (which step in the logical chain breaks), <code>misconception</code> (the specific false belief), and <code>bottleneck</code>
      (a plain-English diagnostic). The Teacher Dashboard inverts this into a concept-centric view —
      "7 students stuck on the Matching Principle" — rather than a raw student table.
      When a concept card crosses a threshold of students stuck at the same reasoning step, the teacher has
      a direct signal to schedule a supplementary lecture or push targeted review material for that specific gap.
      This is the kind of intervention intelligence that enterprise EdTech platforms charge significant fees to provide.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">RAG calibration for academic text</div>
    <div class="decision-body">
      Dense academic language has lower cosine similarity scores against conversational student queries
      than typical RAG benchmarks assume. An initial threshold of 0.72 returned zero chunks silently.
      Diagnosed by adding explicit RPC error logging; resolved by calibrating to 0.50 for this text type.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">Prompt engineering as product design — 5 documented iterations</div>
    <div class="decision-body">Each iteration was driven by an observed user-experience failure:</div>
  </div>

  <table>
    <thead>
      <tr><th>Failure observed</th><th>Root cause</th><th>Fix</th></tr>
    </thead>
    <tbody>
      <tr><td>Excessive praise, wordy responses</td><td>Default LLM helpfulness</td><td>Clinical tone + one-question rule</td></tr>
      <tr><td>"What is the name of the principle?"</td><td>Vocabulary test, not reasoning</td><td>Scenario-grounded questions</td></tr>
      <tr><td>"You should review Accrual Accounting"</td><td>No-context fallback named the answer</td><td>Fallback scaffolds via student's own numbers</td></tr>
      <tr><td>Endless questions after student got it right</td><td>No exit condition</td><td>Earned praise + summary + handoff</td></tr>
      <tr><td>"I don't know" → agent gives up</td><td>No decomposition rule</td><td>Break to smallest atomic concrete step</td></tr>
    </tbody>
  </table>

  <div class="decision">
    <div class="decision-title">Exit Condition design — preventing the Socratic Death Spiral</div>
    <div class="decision-body">
      An agent that keeps asking Socratic questions after the student has demonstrated understanding
      is a worse product than one that never asks. The exit condition is explicit: confirm with brief
      earned praise (the only time praise is permitted), restate the principle in one sentence,
      hand the steering wheel back with a transition question.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">Roadmap — closing the learning loop</div>
    <div class="decision-body">
      Three natural extensions deepen both engagement and insight:
      <br><br>
      <strong>Adaptive quizzes:</strong> After a Socratic exchange exits cleanly, trigger a short 2&ndash;3 question
      formative quiz generated from the same RAG context. Reinforces retention and gives the system a second
      signal on whether the concept was truly understood or just performed in conversation.
      <br><br>
      <strong>Concept-level alerts for teachers:</strong> When a concept card crosses a configurable threshold
      (e.g. 5 students sharing the same <code>reasoning_step_failed</code>), surface a push notification or dashboard
      alert prompting a lecturer to schedule a supplementary session — turning passive analytics into active intervention.
      <br><br>
      <strong>Cross-cohort insight aggregation:</strong> Aggregate bottleneck data across cohorts to give curriculum
      designers evidence about which modules need rewriting at the source, not just which students need remediation downstream.
    </div>
  </div>
</div>

<!-- ══ PROJECT 2: SWEETSPOT ════════════════════════════════════════════ -->
<div class="page">
  <div class="section-number">Project 02</div>
  <div class="section-title">SweetSpot</div>
  <div class="section-badge">Live Production Product &mdash; Surf Travel Discovery Engine</div>

  <div class="project-meta">
    <div><div class="project-meta-label">Status</div><div class="project-meta-value">Live Production</div></div>
    <div><div class="project-meta-label">Scope</div><div class="project-meta-value">65+ locations &middot; 36 flight clusters</div></div>
    <div><div class="project-meta-label">Core Skills</div><div class="project-meta-value">Edge Computing &middot; Physics Scoring &middot; Multi-layer Caching &middot; Stripe Billing</div></div>
  </div>

  <div class="section-context">
    A live, revenue-generating surf travel discovery engine that fuses real-time marine weather
    forecasting with live flight pricing. The core engineering challenge: running physics-based
    wave quality scoring and flight price optimization across 65+ global locations within the
    latency and cost constraints of a Supabase Edge Function.
    The scoring pipeline is domain-agnostic by design: the location registry, condition API integrations,
    and flight cluster mappings are configuration &mdash; adding a new travel vertical (ski resorts,
    beach destinations, digital-nomad hubs) requires no architectural change, only new location data.
  </div>

  <span class="stack-label">Stack</span>
  <div class="stack">
    <span class="pill">React</span>
    <span class="pill">TypeScript</span>
    <span class="pill">Supabase Edge Functions</span>
    <span class="pill">Stormglass API</span>
    <span class="pill">SerpAPI (Google Flights)</span>
    <span class="pill">Stripe</span>
  </div>

  <div class="diagram-block">
    <div class="diagram-label">System Architecture — Edge Computing + API Orchestration</div>
    ${svgs.sweetspot}
  </div>

  <div class="decisions-title">Key Engineering Decisions</div>

  <div class="decision">
    <div class="decision-title">Physics-based scoring under API rate limits</div>
    <div class="decision-body">
      The core <code>find-sweetspots</code> Edge Function (2,200+ LOC) fetches 14-day forecasts for 65+ global locations
      mapped against 36 regional flight clusters. Wave quality scoring uses shoaling approximations;
      flight price optimization uses a Gaussian decay model. Both run deterministically — no LLM in the
      scoring path — which means results are reproducible and explainable.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">4-layer caching with dynamic TTLs</div>
    <div class="decision-body">
      Weather data, flight prices, and computed scores each have different staleness tolerances.
      A flat cache would either over-serve stale flight prices or over-fetch expensive weather forecasts.
      The layered strategy with dynamic TTLs manages API cost and latency independently per data type.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">Strict contextual constraints as product features</div>
    <div class="decision-body">
      "Weekend Warrior" mode verifies Friday arrivals before 23:00 and Sunday departures after 15:00 —
      constraints that are non-negotiable for the target user. These live in the deterministic logic layer,
      not in a prompt. The LLM (Travel Chat) only handles the conversational layer; it cannot override
      a constraint it does not know exists.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">Full subscription + alerting infrastructure</div>
    <div class="decision-body">
      Complete Stripe subscription lifecycle (checkout &rarr; webhook &rarr; profile update) and a surf alerts system
      (user-configured thresholds &rarr; cron job &rarr; email via Resend) are live in production.
    </div>
  </div>
</div>

<!-- ══ PROJECT 3: ALPHADESK ════════════════════════════════════════════ -->
<div class="page">
  <div class="section-number">Project 03</div>
  <div class="section-title">AlphaDesk</div>
  <div class="section-badge">Multi-Agent Appraisal Pipeline &mdash; Real Estate Due Diligence</div>

  <div class="project-meta">
    <div><div class="project-meta-label">Agents</div><div class="project-meta-value">5 (CFO + Visual + Architect + Auditor + Council)</div></div>
    <div><div class="project-meta-label">Pattern</div><div class="project-meta-value">202 Accepted + Idempotent Task Queue</div></div>
    <div><div class="project-meta-label">Core Skills</div><div class="project-meta-value">Multi-Agent Council &middot; Evidence Tiering &middot; Async Workers</div></div>
  </div>

  <div class="section-context">
    An automated real estate appraisal and due diligence pipeline for Danish residential listings.
    The core product problem: LLMs hallucinate confidently on numerical claims (price per sqm, registry data,
    legal obligations). The architecture was designed to make hallucination structurally difficult
    rather than prompting-difficult.
  </div>

  <span class="stack-label">Stack</span>
  <div class="stack">
    <span class="pill">Node.js</span>
    <span class="pill">Puppeteer</span>
    <span class="pill">Supabase Realtime Workers</span>
    <span class="pill">OpenAI GPT-4o</span>
    <span class="pill">Next.js</span>
  </div>

  <div class="diagram-block">
    <div class="diagram-label">System Architecture — Council Pattern + Evidence Tiering</div>
    ${svgs.alphaDesk}
  </div>

  <div class="decisions-title">Key Engineering Decisions</div>

  <div class="decision">
    <div class="decision-title">Evidence tiering as hallucination prevention</div>
    <div class="decision-body">
      TIER 0 data (binding registry facts, legal obligations, verified sqm from BBR) is injected as inviolable
      ground truth. The model cannot reason its way around a registered easement because the easement is in the
      context as a fact. TIER 2 data (marketing text) is explicitly flagged as unverified.
      The LLM knows the difference between what it is told is certain and what is soft.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">The Council as a product pattern</div>
    <div class="decision-body">
      A single LLM call producing a verdict is not reliable enough for a financial decision. The Council encodes
      structured disagreement into one completion: three personas (Visionary for upside, Cynic for risks, Quant for numbers)
      producing a spread percentage and an uncertainty flag. A wide spread is surfaced to the user as "high uncertainty,"
      not hidden behind an average.
    </div>
  </div>

  <div class="decision">
    <div class="decision-title">202 Accepted + idempotent task contract</div>
    <div class="decision-body">
      The HTTP trigger and the Supabase Realtime worker use identical <code>claimTask</code> / <code>markCompleted</code> /
      <code>markFailed</code> contracts against the same <code>scrape_tasks</code> table.
      Two concurrent triggers claiming the same task will not corrupt state — only one succeeds the lock.
      This pattern generalises to any multi-team AI feature environment.
    </div>
  </div>
</div>

<!-- ══ CLOSING ═════════════════════════════════════════════════════════ -->
<div class="closing">
  <div class="section-number">Summary</div>
  <div class="closing-title">For the CPO</div>

  <div class="three-col">
    <div class="col-card">
      <div class="col-card-title">Build Fast</div>
      <div class="col-card-body">
        The Nexford Socratic Evaluator went from concept to running two-agent system in under 12 hours.
        SweetSpot is live and revenue-generating. AlphaDesk has an end-to-end pipeline from URL to
        structured verdict. None waited to be complete before being useful.
      </div>
    </div>
    <div class="col-card">
      <div class="col-card-title">Think in Systems</div>
      <div class="col-card-body">
        Two agents with separate responsibilities, shared task queue contracts, grounding layers that
        separate retrieval quality from generation quality, and knowledge graph schemas designed for
        teacher actionability rather than raw logging.
      </div>
    </div>
    <div class="col-card">
      <div class="col-card-title">Advise</div>
      <div class="col-card-body">
        Explicit product decisions documented: why the Socratic prompt must not name principles before
        the student discovers them; why the exit condition is as important as the struggle;
        why evidence tiers make hallucination structurally difficult rather than prompting-difficult.
      </div>
    </div>
  </div>

  <div class="closing-principles">
    <p><strong>Consistent principle across all three projects:</strong> the model is one stage in a system, not the system itself.</p>
    <p>Deterministic tiers (AlphaDesk), physics-based scoring (SweetSpot), and RAG with calibrated thresholds (Nexford)
    all constrain what the LLM is asked to do — rather than asking the LLM to do everything.</p>
    <p>The strongest argument: the Nexford Socratic Evaluator is not a generic AI demo. It was built against
    Nexford's specific pedagogical philosophy and iterated against real observed failure modes in the conversation.
    <strong>That is what the role asks for.</strong></p>
  </div>
</div>

</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const outDir = path.join(__dirname, "..");
  const htmlPath = path.join(outDir, "Docs", "AI_SYSTEMS_PORTFOLIO.html");
  const pdfPath = path.join(outDir, "Docs", "AI_SYSTEMS_PORTFOLIO.pdf");

  console.log("Fetching mermaid diagrams from mermaid.ink...");
  const svgs = {};
  for (const [key, code] of Object.entries(DIAGRAMS)) {
    process.stdout.write(`  Rendering ${key}... `);
    try {
      svgs[key] = await fetchSvg(code);
      console.log("ok");
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      svgs[key] = `<p style="color:red">Diagram unavailable: ${err.message}</p>`;
    }
  }

  console.log("Building HTML...");
  const html = buildHtml(svgs);
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML written → ${htmlPath}`);

  console.log("Generating PDF with Chrome headless...");
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const result = spawnSync(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--print-to-pdf=${pdfPath}`,
    "--print-to-pdf-no-header",
    `--virtual-time-budget=3000`,
    `file://${htmlPath}`,
  ], { encoding: "utf-8", timeout: 30000 });

  if (result.status === 0 || fs.existsSync(pdfPath)) {
    const size = (fs.statSync(pdfPath).size / 1024).toFixed(0);
    console.log(`\nPDF generated → ${pdfPath} (${size} KB)`);
    fs.unlinkSync(htmlPath);
    console.log("HTML intermediary removed.");
  } else {
    console.error("Chrome exited with status", result.status);
    console.error(result.stderr);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
