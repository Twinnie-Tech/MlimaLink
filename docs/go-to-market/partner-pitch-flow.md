# MlimaLink — How It Works & How Partners Fit In

> **MlimaLink** is a multi-vendor marketplace for the Mt Kenya region. It connects local shops, farmers and service providers with nearby shoppers, and local riders deliver the orders.
>
> This document shows how the platform works and where partners create and share value.

The diagrams use [Mermaid](https://mermaid.js.org/) and render on GitHub, GitLab, Notion and most Markdown viewers.

---

## 1. The ecosystem at a glance

```mermaid
flowchart LR
    subgraph Community["Mt Kenya community"]
        SH["Shoppers<br/>households, students, offices"]
        SE["Sellers<br/>shops, farmers, service providers"]
        RI["Riders<br/>boda boda, bicycle, car"]
    end

    ML(("MlimaLink<br/>marketplace + delivery"))

    subgraph Partners["Partners"]
        CO["County governments"]
        SF["Safaricom / M-Pesa"]
        SA["SACCOs & cooperatives"]
        BB["Boda boda SACCOs"]
        CU["Churches & universities"]
        ME["Vernacular media"]
    end

    SH -- "order & pay" --> ML
    ML -- "orders" --> SE
    ML -- "delivery jobs" --> RI
    RI -- "deliver" --> SH

    CO -. "endorsement & market access" .-> ML
    SF -. "payments rails" .-> ML
    SA -. "members & financing" .-> ML
    BB -. "riders" .-> ML
    CU -. "ambassadors & early users" .-> ML
    ME -. "reach & awareness" .-> ML
```

---

## 2. From order to doorstep

```mermaid
sequenceDiagram
    autonumber
    actor Shopper
    participant ML as MlimaLink
    actor Seller
    actor Rider

    Shopper->>ML: Browse local shops and check out
    ML->>Shopper: Order confirmed + private 4-digit delivery code
    ML->>Seller: New order alert
    Seller->>ML: Confirm order
    Seller->>ML: Request a rider (choose one, or post to all nearby)
    ML->>Rider: Job offer with pickup and drop-off towns
    Rider->>ML: Accept job (first to accept wins)
    ML->>Shopper: Rider assigned: name, phone, vehicle
    Rider->>Seller: Collect parcel
    Rider->>ML: Picked up (optional live location)
    ML->>Shopper: On the way + map link
    Rider->>Shopper: Hand over parcel
    Shopper->>Rider: Gives delivery code
    Rider->>ML: Enter code → delivery confirmed
    ML->>Seller: Delivered ✔
    ML->>Shopper: Delivered ✔
```

**Built-in trust**

- **Pay on delivery** option for shoppers.
- **Delivery code:** only the shopper has it, so the rider can't mark an order delivered without the shopper present. Repeated wrong codes lock the job.
- **Privacy:** riders see the shopper's full contact details only after accepting a job.
- **Tracking:** status timeline and the rider's last shared location.

---

## 3. How money flows

```mermaid
flowchart LR
    SH["Shopper pays<br/>goods + delivery fee"] -->|"M-Pesa STK Push (planned)"| ML{{"MlimaLink"}}
    ML -->|"goods value − commission"| SE["Seller<br/>Till / Pochi la Biashara"]
    ML -->|"delivery fee − small platform share"| RI["Rider<br/>M-Pesa"]
    ML -->|"commission + delivery share<br/>+ subscriptions + ads"| REV[("MlimaLink revenue")]
    REV -.->|"referral commissions"| AM["Ambassadors"]
    REV -.->|"referral fees"| FP["Financial partners"]
```

| Revenue stream              | Model                                         |
| --------------------------- | --------------------------------------------- |
| Order commission            | 3–8% by category                              |
| Delivery fee share          | 10–15% of the fee; the rest goes to the rider |
| Seller Pro subscription     | About KSh 500–1,500/month                     |
| Promoted listings & adverts | Category placements                           |
| Service leads               | Small fee per accepted request                |
| Partnerships                | Loans, bike financing, insurance referrals    |

---

## 4. Growth engine: how people join

```mermaid
flowchart TD
    subgraph Mobilizers
        CG["County launch events<br/>markets & Biashara Centres"]
        SC["SACCO & cooperative<br/>member days"]
        BS["Boda SACCO<br/>rider drives"]
        CH["Church & chama<br/>sessions"]
        UN["Campus<br/>ambassadors"]
        RD["Vernacular radio<br/>& TikTok"]
    end

    AMB(["MlimaLink Ambassadors<br/>paid per activated seller"])

    CG --> AMB
    SC --> AMB
    BS --> AMB
    CH --> AMB
    UN --> AMB

    AMB --> SEL["Sellers onboarded<br/>at their stall, under 10 min"]
    BS --> RID["Riders onboarded"]
    SEL --> ACT{"First real orders?"}
    ACT -- "Yes" --> PAY["Ambassador paid<br/>+ share of seller sales"]
    ACT -- "Not yet" --> SUP["Ambassador supports seller"] --> ACT

    RD --> SHP["Shoppers<br/>first-order codes"]
    SEL --> SHP
    RID --> DEL["Fast local delivery"]
    SHP --> DEL --> REP["Happy repeat buyers<br/>& referrals"]
    REP --> SHP
```

---

## 5. Town-by-town rollout

Each town must pass clear gates before we expand, so quality grows with coverage.

```mermaid
flowchart LR
    A["Pick anchor town"] --> B["Sign county + SACCO<br/>+ boda partners"]
    B --> C["Recruit ambassadors"]
    C --> D["Onboard 150–300 sellers<br/>+ 30–50 riders"]
    D --> E["Open to shoppers<br/>launch event + radio"]
    E --> F{"Town won?<br/>60%+ repeat buyers<br/>delivery under 2 hrs"}
    F -- "Yes" --> G["Expand to next town<br/>same playbook"]
    F -- "Not yet" --> H["Fix supply, riders<br/>or service"] --> E
    G --> A
```

```mermaid
gantt
    title Indicative rollout
    dateFormat YYYY-MM-DD
    axisFormat %b %Y

    section Prepare
    Payments, SMS, towns, referrals     :p0, 2026-11-01, 6w
    First partners & ambassadors        :p1, 2026-11-15, 5w

    section Anchor towns
    Nyeri & Karatina                    :a1, after p0, 12w
    Embu                                :a2, after p0, 12w
    Meru or Thika                       :a3, after p0, 12w

    section Expand
    Next Mt Kenya towns                 :e1, after a1, 20w

    section Region leader
    All Mt Kenya counties               :r1, after e1, 32w
```

**Target counties:** Nyeri · Kirinyaga · Murang'a · Kiambu · Nyandarua · Laikipia · Meru · Tharaka-Nithi · Embu

---

## 6. What each partner gives and gets

```mermaid
flowchart LR
    subgraph Give["Partner contributes"]
        G1["County: endorsement,<br/>market access, outreach"]
        G2["Safaricom: M-Pesa rails,<br/>Mini App distribution"]
        G3["SACCOs / co-ops:<br/>members, financing"]
        G4["Boda SACCOs: riders"]
        G5["Media: reach"]
    end

    ML(("MlimaLink"))

    subgraph Get["Partner receives"]
        R1["County: more local trade,<br/>youth jobs, economic insight"]
        R2["Safaricom: more M-Pesa<br/>transactions from SMEs"]
        R3["SACCOs: members earn more,<br/>loan book backed by sales data"]
        R4["Boda SACCOs: steady<br/>paid delivery work"]
        R5["Media: sponsored content,<br/>real success stories"]
    end

    G1 --> ML --> R1
    G2 --> ML --> R2
    G3 --> ML --> R3
    G4 --> ML --> R4
    G5 --> ML --> R5
```

| Partner                     | What we ask                                                       | What they gain                                      |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| **County government**       | Endorsement, market-day access, outreach to permit holders        | Local trade growth, youth employment, economic data |
| **Safaricom**               | Daraja integration support, M-Pesa Mini App listing, co-marketing | More SME and consumer M-Pesa transactions           |
| **SACCOs & cooperatives**   | Member onboarding days, co-branded offers                         | Higher member income; sales-backed lending          |
| **Boda boda SACCOs**        | Rider recruitment                                                 | Reliable, paid delivery jobs for members            |
| **Churches & universities** | Hosting sessions, campus ambassadors                              | Economic empowerment for members and students       |
| **Media**                   | Airtime, creator partnerships                                     | Sponsored content, community success stories        |

---

## 7. Why MlimaLink

- **Local first:** built for Mt Kenya towns, local sellers and local riders.
- **Asset-light:** no warehouses and no inventory. We connect existing businesses and independent riders, so we scale cheaply.
- **Trust built in:** pay on delivery, private delivery codes, rider tracking, reviews.
- **More than products:** service providers (fundis, salons, tutors, mechanics) list alongside shops.
- **Jobs:** every town we open creates paid work for riders and ambassadors.

---

## 8. Let's talk

We're looking for partners to launch in our first anchor towns.

**Contact:** _name · phone · email_
