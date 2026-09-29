# Echo — AP Exception Intelligence

> **Institutional memory for Accounts Payable decisions.**

Echo is a memory-backed Accounts Payable (AP) exception decision-support system that helps teams understand the difference between **written policy** and **historical organizational practice**.

When an invoice exception occurs, Echo retrieves relevant historical decisions from **Hindsight Cloud**, identifies the conditions behind those decisions, presents the supporting evidence, and lets a human make the final decision.

Echo does **not** replace the ERP, AP platform, or human approver.

It helps answer:

> **“What did we do before, why did we do it, and does that precedent actually apply here?”**

---

## The Problem

Accounts Payable teams don't operate entirely from written policy.

A policy might say:

> **Invoices above ₹50,000 require CFO approval.**

But historical practice may show that comparable fuel-surcharge invoices were repeatedly approved when a supporting annexure was attached.

That knowledge is often buried in:

* Previous invoice exceptions
* Approval records
* Emails
* Case histories
* Institutional knowledge of experienced employees

When those employees are unavailable, the next person may have to investigate the same problem from scratch.

Traditional AI approaches create another problem:

**Giving an LLM the entire historical database is expensive, noisy, and difficult to trust.**

Echo takes a different approach.

---

# The Core Idea

Echo separates three things:

### POLICY

What the written rule says.

### EVIDENCE

What historical cases actually show.

### INFERENCE

What Echo can reasonably conclude from that evidence.

The LLM is **not the source of truth**.

Historical facts come from the memory layer and deterministic validation.

The LLM is used to explain already-retrieved evidence.

---

# How Echo Works

```text
                    AP / ERP
                       │
                       ▼
               Invoice Exception
                       │
                       ▼
                    ECHO
                       │
                       ▼
              Issue-Family Routing
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
    Pattern Memory            Case Memory
          │                         │
          └────────────┬────────────┘
                       ▼
              Targeted Retrieval
                       │
                       ▼
              Relevant Evidence
                       │
                       ▼
          Deterministic Validation
                       │
                       ▼
                Small Evidence
                   Bundle
                       │
                       ▼
                     LLM
                       │
                       ▼
             Human Decision
                       │
              ┌────────┴────────┐
              │                 │
           Approve            Reject
              │                 │
              └────────┬────────┘
                       ▼
                Memory Update
                       │
                       ▼
                 Hindsight Cloud
```

The important architectural principle is:

> **Memory is not context.**

Echo does not dump an organization's entire historical memory into every LLM prompt.

---

# Targeted Memory Retrieval

Echo uses deterministic issue-family routing before historical retrieval.

Current issue families include:

```text
AMOUNT MISMATCH
MISSING PO
GST MISMATCH
DUPLICATE SUSPECT
PERMISSION / APPROVAL
```

For example:

```text
Amount mismatch
       ↓
Amount-related memory

Missing PO
       ↓
PO-related memory

Approval issue
       ↓
Approval-related memory
```

This prevents unrelated historical cases from being retrieved simply because they happen to be semantically similar.

The intended retrieval window is deliberately small:

```text
≤ 3 relevant patterns
≤ 5–8 supporting cases
```

rather than sending dozens or hundreds of memories to the model.

---

# Two-Layer Institutional Memory

Echo uses two conceptual memory layers in Hindsight Cloud.

```text
Hindsight Cloud
│
├── CASE MEMORY
│   ├── C01
│   ├── C02
│   ├── C03
│   └── New resolved cases
│
└── PATTERN MEMORY
    ├── Amount mismatch + fuel surcharge
    ├── Missing PO + retroactive PO
    ├── GST mismatch + tax discrepancy
    └── Approval exception patterns
```

## Case Memory

Individual historical cases provide the underlying evidence.

Example:

```text
Case: EX-9821
Vendor: Northwind Freight
Variance: 4.8%
Outcome: APPROVED
Reason: Approval with authorization
```

## Pattern Memory

Patterns provide reusable institutional knowledge.

Example:

```text
Pattern:
amount_mismatch + fuel_surcharge

Condition:
annexure attached

Evidence:
5 cases

Approved:
5 / 5

Approvers:
Priya Nair ×4
Suresh Iyer ×1

Last observed:
2026-09-02
```

The distinction is intentional:

> **Cases are evidence. Patterns are reusable institutional knowledge.**

---

# Policy vs Practice

One of Echo's main differentiators is that it doesn't simply retrieve similar invoices.

It exposes the relationship between:

```text
WRITTEN POLICY
       │
       │
       ▼
What should happen?
       │
       │
       ▼
HISTORICAL PRACTICE
       │
       │
       ▼
What actually happened?
       │
       │
       ▼
CONDITION
       │
       ▼
Why did it happen?
```

For example:

```text
Policy
CFO approval required above ₹50,000

Historical practice
5 comparable cases approved

Condition
Supporting annexure attached
```

Echo does **not** automatically conclude that the policy is wrong.

It makes the observed difference visible so that the human can evaluate it.

---

# Evidence Contract

Echo follows an evidence-first contract.

The model must never invent:

* Historical case IDs
* Approval counts
* Rejection counts
* Conditions
* Approvers
* Historical outcomes
* Confidence levels
* Institutional precedent

The intended flow is:

```text
Hindsight Evidence
       +
Deterministic Validation
       ↓
     FACTS
       ↓
      LLM
       ↓
  EXPLANATION
```

If sufficient evidence does not exist, Echo should abstain:

> **No sufficient historical precedent was found.**

Written policy remains the available guidance.

This is preferable to generating a plausible but unsupported answer.

---

# Deterministic Confidence

Confidence is derived from evidence rather than generated by the LLM.

For example:

```text
Comparable cases: 5
Approved:          5
Rejected:          0

Observed outcome:  5 / 5 approved
```

The LLM may explain the evidence, but it does not decide that the evidence is “high confidence” simply because the generated response sounds convincing.

---

# Memory ON / OFF

Echo includes a deliberate memory toggle.

## Memory ON

```text
Hindsight retrieval
        +
Historical evidence
        +
Observed practice
        +
Conditions
```

## Memory OFF

```text
No Hindsight retrieval
        +
No historical claims
        +
Written policy only
```

This makes the value of institutional memory directly observable during a demonstration.

---

# Echo Replay

One of the key interaction concepts in Echo is **Replay**.

Replay asks:

> **“Does the historical practice still exist if the condition changes?”**

Consider:

```text
CURRENT

Annexure attached
       ↓
5 comparable cases
       ↓
5 / 5 approved
```

Now change the condition:

```text
REPLAY

Annexure missing
       ↓
Search same relevant memory
       ↓
0 comparable cases
```

Echo should not predict:

> “This invoice will be rejected.”

Instead:

> **No sufficient historical precedent was found.**

This demonstrates that the original historical practice was **conditional**, rather than a universal rule.

---

# Human-in-the-Loop

Echo is a decision-support system.

The final decision remains with the operator.

```text
Retrieve evidence
       ↓
Explain evidence
       ↓
Human review
       ↓
Approve / Reject / Escalate
       ↓
Remember resolution
```

The interface explicitly communicates:

> **Echo provides intelligence. Final decision remains with the operator.**

---

# Resolution → Memory Update

Institutional memory evolves through human decisions.

When the operator selects:

```text
Approve & Remember
```

or:

```text
Reject & Remember
```

Echo retains the resolved case and updates the relevant pattern.

For example:

### Before

```text
5 comparable cases
5 / 5 approved
```

### After another approval

```text
6 comparable cases
6 / 6 approved
```

The memory system therefore becomes a feedback loop:

```text
Historical memory
       ↓
Current decision
       ↓
Human resolution
       ↓
New case
       ↓
Updated pattern
       ↓
Future retrieval
```

---

# Hindsight Reflect

Echo can use Hindsight Reflect to synthesize a concise narrative from already-retrieved evidence.

Reflect is intentionally scoped.

It does **not** determine:

* Case identity
* Approval counts
* Confidence
* Policy truth
* Historical facts

Those remain grounded in the retrieved evidence and deterministic validation.

Reflect helps answer questions such as:

> “What pattern appears across these comparable cases?”

---

# Interface

Echo uses a three-panel investigation workspace.

```text
┌──────────────────┬──────────────────────────────┬──────────────────────┐
│                  │                              │                      │
│ Exception Queue  │   Investigation Workspace   │ Institutional Memory │
│                  │                              │                      │
│ INV-NW-1188      │   Northwind Freight         │ EX-9821              │
│ INV-NW-1195  ←   │   ₹1,58,000                 │ EX-9412              │
│ INV-CC-2360      │   vs ₹1,50,000               │ EX-9033              │
│ INV-ZP-0017      │                              │                      │
│                  │   Policy → Evidence         │ Comparable Cases     │
│                  │   → Human Decision           │                      │
└──────────────────┴──────────────────────────────┴──────────────────────┘
```

### Exception Queue

Displays active AP exceptions and their issue types.

### Investigation Workspace

Shows:

* Invoice
* Purchase order
* Variance
* Policy comparison
* Evidence
* Human decision

### Institutional Memory

Shows comparable historical decisions retrieved for the current exception.

---

# Example Investigation

Current example:

```text
Vendor:
Northwind Freight

Invoice:
INV-NW-1195

Purchase Order:
PO-7990

Invoice Amount:
₹1,58,000

PO Amount:
₹1,50,000

Variance:
+5.33%

Policy:
2% tolerance

Policy Result:
Outside
```

Echo can then surface comparable historical cases such as:

```text
EX-9821
Northwind Freight
4.8% variance
APPROVED

EX-9412
Similar vendor
6.1% variance
ESCALATED

EX-9033
Similar exception
5.0% variance
APPROVED
```

The user can inspect the evidence before making the final decision.

---

# Project Structure

The current frontend is organized around the Echo investigation experience.

Important areas include:

```text
echo-main/
│
├── app/
│   ├── ui.tsx
│   └── ...
│
├── EchoApp
├── route.ts
├── echoTypes
├── CaseList
├── Investigation
├── PolicyPractice
├── MemoryRail
├── DecisionBar
│
└── ...
```

The exact implementation may evolve as the memory and backend layers continue to develop.

---

# Running Echo Locally

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd echo-main
```

Install dependencies:

```bash
npm install
```

Create your local environment configuration.

Configure the required Hindsight and LLM credentials:

```text
HINDSIGHT_*
GROQ_API_KEY
```

Do **not** commit API keys or secrets to GitHub.

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# Demo Flow

The recommended demonstration follows this sequence:

```text
1. Open Echo
       ↓
2. Select INV-NW-1195
       ↓
3. Inspect policy violation
       ↓
4. View institutional memory
       ↓
5. Inspect comparable cases
       ↓
6. Compare policy vs historical practice
       ↓
7. Make human decision
       ↓
8. Approve & Remember
       ↓
9. Observe memory update
       ↓
10. Replay with changed condition
       ↓
11. Demonstrate abstention
```

The key interaction is:

```text
“What did we do before?”

        ↓

“Why did we do it?”

        ↓

“What if the condition changes?”

        ↓

“What did Echo learn from this decision?”
```

---

# Synthetic Dataset

The current demonstration uses **47 carefully designed synthetic AP exception cases**.

They cover scenarios including:

* Amount mismatch
* Missing PO
* GST mismatch
* Duplicate investigation
* Multiple vendors
* Multiple approvers
* Multiple exception patterns
* Approved outcomes
* Rejected outcomes
* Conditional decisions
* Policy/practice differences

The dataset is intentionally synthetic.

> **All data is synthetic. Real AP exception histories are confidential, so we created a realistic dataset designed to demonstrate policy-vs-practice gaps and condition-based learning.**

The dataset can be expanded after the Hindsight-backed runtime architecture is validated.

---

# Why Not Just Use RAG?

Traditional RAG might look like:

```text
Question
   ↓
Vector Search
   ↓
Top Documents
   ↓
LLM
   ↓
Answer
```

Echo adds additional structure:

```text
Exception
   ↓
Issue Family
   ↓
Relevant Memory
   ↓
Pattern
   ↓
Supporting Cases
   ↓
Deterministic Validation
   ↓
Evidence Bundle
   ↓
LLM Explanation
```

The distinction matters because institutional memory is not simply a collection of semantically similar documents.

It contains:

* Outcomes
* Conditions
* Patterns
* Exceptions
* Human resolutions
* Policy/practice differences

Echo is designed around those relationships.

---

# Design Principles

## 1. Evidence over plausibility

A convincing answer without evidence is not enough.

## 2. Memory over prompt stuffing

Persistent memory should be retrieved selectively rather than dumped into context.

## 3. Conditions matter

Historical practice is often conditional.

## 4. Human decisions remain authoritative

Echo supports the decision; it does not own the decision.

## 5. Abstention is a feature

No evidence should produce:

```text
No sufficient historical precedent was found.
```

not a fabricated answer.

## 6. Memory should evolve

Human resolutions should become future institutional knowledge.

---

# Roadmap

### Current

* [x] Hindsight Cloud as persistent memory
* [x] Case memory
* [x] Pattern memory architecture
* [x] Issue-family routing
* [x] Targeted retrieval
* [x] Policy vs Practice
* [x] Condition-aware evidence
* [x] Deterministic confidence architecture
* [x] Evidence-grounded responses
* [x] Memory ON/OFF
* [x] No-history / abstention path
* [x] Human-in-the-loop resolution
* [x] Resolution → memory update
* [x] Hindsight Reflect integration concept

### Next

* [ ] Echo Replay
* [ ] Expanded institutional memory dataset
* [ ] Stronger pattern extraction
* [ ] Policy proposal workflow
* [ ] Additional auditability features
* [ ] Production-grade authentication and authorization
* [ ] ERP/AP integration

---

# Security & Governance Philosophy

Echo is designed around a simple principle:

> **AI should assist enterprise decisions without becoming an unaccountable source of truth.**

Historical information is retrieved selectively.

The model does not receive unrestricted organizational memory.

Human operators remain responsible for the final decision.

The system distinguishes observed historical behavior from written policy.

And when evidence is insufficient, Echo is designed to say so.

---

# Technology

Core technologies include:

* **React / TypeScript**
* **Hindsight Cloud** — persistent institutional memory
* **LLM-based reasoning/explanation**
* **Deterministic validation**
* **Targeted retrieval**
* **Synthetic AP exception dataset**

---

# The Product in One Sentence

> **Echo uses Hindsight Cloud to retrieve only the relevant institutional memory behind an AP exception, separates written policy from observed practice, exposes the conditions and evidence behind that practice, gives an evidence-grounded confidence signal, and learns from human resolution without allowing the LLM to invent facts.**

---

# The Big Idea

Most enterprise AI systems ask:

> **“What does the model know?”**

Echo asks something different:

> **“What has this organization actually learned?”**

And then makes that institutional memory available—carefully, conditionally, and with evidence—when a human needs it.

---

## Demo

**Echo — AP Exception Intelligence**

```text
Policy
   +
Institutional Memory
   +
Evidence
   +
Conditions
   +
Human Decision
   ↓
Better-informed AP exception handling
```

**Built by [YOUR NAME]**
