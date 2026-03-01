# Ticket Process (from In Progress)

Mermaid diagram of the process described in the Untitled document, starting at **In Progress**.

```mermaid
flowchart LR
    subgraph "Start"
        A[In Progress]
    end

    subgraph "Development"
        B[Completed PR]
    end

    subgraph "Build Pipeline"
        C[Ready For Build]
        D[Delivered Build]
        E[Needs Testing]
        F[Ready For Release]
    end

    subgraph "End States"
        G[Done]
        H[Released]
    end

    I[Needs Review]

    A -->|"ready for code review<br/>(DoD met, PR link, time tracking)"| B
    A -.->|"need info / can't reproduce / no fix"| I
    I -.->|"resolved"| A

    B -->|"all PRs merged"| C
    C -->|"assigned Fix Version<br/>cherry-picked into build"| D
    D -->|"deployed to Testing Environment"| E
    E -->|"tested, resolution confirmed"| F
    F -->|"build released/deployed"| G
    G -->|"fix version officially released"| H
```

## Alternative: Vertical layout with scenario branches

```mermaid
flowchart TB
    Start([In Progress])

    Start -->|work complete, ready for review| CompletedPR[Completed PR]
    Start -.->|need additional information| NeedsReview[Needs Review]
    Start -.->|can't reproduce| NeedsReview
    Start -.->|no fix / not an issue| NeedsReview
    NeedsReview -.->|resolved| Start

    CompletedPR -->|all PRs merged| ReadyForBuild[Ready For Build]
    ReadyForBuild -->|Fix Version assigned<br/>merged into build| DeliveredBuild[Delivered Build]
    DeliveredBuild -->|deployed to Testing Environment| NeedsTesting[Needs Testing]
    NeedsTesting -->|tested & confirmed| ReadyForRelease[Ready For Release]
    ReadyForRelease -->|released/deployed| Done[Done]
    Done --> Released[Released]

    style Start fill:#e1f5fe
    style Done fill:#c8e6c9
    style Released fill:#c8e6c9
    style NeedsReview fill:#fff3e0
```

## Status summary (from document)

| Status | Description |
|--------|-------------|
| **In Progress** | Ticket actively being worked on. Comment if blocked. |
| **Completed PR** | PR made; PR Link and Time Tracking required. |
| **Ready For Build** | PRs merged, ready for Fix Version. |
| **Delivered Build** | PRs merged/cherry-picked into a build. |
| **Needs Testing** | In a build, deployed to Testing Environment. |
| **Ready For Release** | Tested and confirmed, not yet in production. |
| **Done** | Tested and build released/deployed. |
| **Released** | Fix version officially released for customers. |
| **Needs Review** | Needs additional input (from In Progress or during QA). |
