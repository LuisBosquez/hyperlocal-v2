# Hyperlocal (v2)

> Create community anywhere, anytime.

---

## Introduction

We believe that community can be created daily and going to places together is the best way to do so. From long mountain hikes to short coffee chats, everything and anything that enriches life can also create connection, and connection creates community. 

Opportunities to create connection are endless. On a daily basis, people do things they love, things they are curious about and things they need to do. But hidden within those, there are the things that they'd like to do if someone else was willing to join them. The challenge are the barriers in the discovery and communication of these opportunities. 

For example, I have been meaning to go to the Frye Museum of Art in Seattle. I don't really have a plan to go because I haven't thought of it, but if I knew someone who was also interested in going it would be top of mind for me to go. However, the communication barriers still exist - should I reach out to all of my friends to see who likes this museum and would also be interested in going eventually? And if anyone replies, I would then have to go ahead and plan around every single interested person's calendar because I brought up the idea, increasing the friction to materializing my idea. 

The reality is that not everyone is good at orchestrating, planning and organizing. Our society relies heavily and thanklessly on: the organizers. 

Every friend group has one. And every one of them has limited energy, and limited bandwidth, often balancing their own responsibilities to keep the group active and going out. 

Now imagine a world where everyone's ideas were automatically organized, communicated in an organic way and discovered just when it needs to be discovered - at the moment where it can lead to action.

## Vision

Today, turning a passing thought — "I'd love to check out that new museum" — into a real plan requires a small logistical miracle. You need to remember the idea, identify who might share the interest, reach out without feeling like you're imposing, coordinate availability across multiple people, pick a place, and somehow keep everyone aligned when anything changes. Most of the time, it doesn't happen.

With Hyperlocal fully realized, that same idea becomes a signal. You note that you want to visit the Frye Museum and the platform quietly connects it to friends who've expressed interest in art, surfaces a window when your schedules overlap, and — when the time is right — nudges the right people. No mass texts, no awkward cold asks, no one carrying the weight of organizing alone. Plans emerge the way the best ones do: organically, at the right moment, with the right people.

Hyperlocal is the layer between wanting to do something and actually doing it with people you care about.

### Future Horizons (Exploratory)

These capability areas are not part of the current scope but represent natural extensions of the platform as it matures.

- **Intelligent discovery:** The platform learns your preferences, context, and social patterns to surface the right activity at the right moment — before you think to search for it.

- **Local business ecosystem:** Venues and local organizers can reach people at the exact moment they're making plans, creating a natural, non-intrusive channel between places and the communities around them.

- **Social graph intelligence:** Over time, the platform understands the dynamics of your social circle — who you hang with, for what kinds of activities — and uses that to make every coordination decision smarter.

- **Community at scale:** Beyond friend groups, Hyperlocal could become the connective tissue for neighborhoods, interest communities, and cities — helping people with shared interests find each other through the activities they already do.

- **Explicit-invite plans:** A privacy layer on top of the ambient visibility model — where a user creates a plan visible only to specific friends they choose, rather than all mutuals. A natural extension once the ambient model is established and users want more control over who sees certain plans.

- **Collaborative plan shaping:** Today's distinction between *Interested* and *Joined* is one-directional — a signal back to the organizer. A natural next step is making Joined an active role: participants can propose a time or a place, turning the plan into a lightweight negotiation between the organizer and the people who've committed. Plans stop being broadcasts and start being collaborations.

- **Organizer controls for Joiners:** As plans grow in size and the social graph scales, organizers will want more structure over what participants can change. A future layer could let organizers decide whether Joiners can propose times, places, or both — preserving ownership of the plan while enabling the collaboration that makes it better. The natural arc: *Interested* as passive desire, *Joined* as active investment, and organizer permissions as the structure that makes collaboration work at scale.

- **Expanded follower visibility:** In MVP-1, anyone can see a user's public **Lists** and the places in them on the profile map — a user-curated snapshot of taste. In V2/V3, users could opt into making certain plans public or open, extending limited plan visibility to followers without requiring a mutual follow. A natural progression from ambient taste-sharing to broader community discovery.

- **Place network as social infrastructure:** The accumulated place data across users — saves, notes, Lists, plans, attendance history — becomes a foundation for richer V2/V3 surfaces. MVP-1 already introduces the curation primitive (**Lists**) and treats personal **notes** as searchable, differentiated data (searching "cortado" finds the place a friend noted that about — something a generic map can't do). The later surfaces build on top: collaborative/shared Lists, place endorsements ("3 friends have been here"), and discovery feeds built on where people you trust have been or want to go. The place, not the plan, becomes the long-term connective tissue of the network.

---

## Problem Statement
Social plans between friends and acquaintances fail to materialize not because people lack the desire to connect, but because the coordination overhead is too high. Locking down who, when, and where at the same time — the moment an idea surfaces — creates a context-switching burden that kills momentum. Today's tools (maps, calendars, event apps) assume plans are fully formed at creation, forcing organizers to carry the entire weight of logistics. The result: "we should hang out" stays an intention forever, and the few people willing to organize burn out doing it for everyone else.

---

## Release Strategy

| Release | Name | Focus |
|---|---|---|
| Alpha (MVP-1) | Core product | Establish the core loop: social graph, place saving, plan creation, ambient visibility, **collaborative materialization** (anyone proposes a time; coarse "afternoon"-style times) |
| Beta (MVP-2) | Functionality enhancement | Deepen engagement: re-engagement system + the calendar layer (time-first plans, availability). *(Time proposals moved into Alpha.)* |
| V3 | Market expansion | Apple Calendar / CalDAV, Outlook / Microsoft 365, broader platform reach |

---

## Target Users (WIP)

[Who are the primary users of this app? Include any relevant segments or personas.]

- **Primary:** [e.g. Small business owners looking to connect with local customers]
- **Secondary:** [e.g. Local shoppers discovering nearby businesses]

---

## Goals & Objectives (WIP)

[High-level goals the product must achieve. These should be measurable or at least directional.]

1. [Goal 1]
2. [Goal 2]
3. [Goal 3]
4. **Automate the optimal timing of plan communication.** When to surface a plan to friends is not arbitrary — it's a function of plan type, magnitude, and audience. A casual coffee invite sent three weeks out gets forgotten; a weekend camping trip invite sent the morning of creates conflicts. The platform should treat timing as a first-class input: surfacing low-stakes plans close to the date, high-commitment plans far enough in advance, and adjusting for who is being notified. Getting this right is what separates Hyperlocal from a shared calendar — it removes the last judgment call the organizer has to make.

---

## Key Principles

- **Flexibility first:** Plans rarely start fully formed. The platform must embrace known unknowns and allow the who, when, and where to be filled in progressively — even at the last minute. Requiring all details upfront kills plans before they start.

- **Lower the activation energy:** The biggest barrier to plans materializing is the cognitive overhead of organizing. Every step of coordination — figuring out availability, choosing a place, broadcasting an invite — should require as little effort as possible from the user.

- **Proactive, not reactive:** Don't wait for users to reach out manually. Surface opportunities to connect at the exact moment they can lead to action — when a friend is nearby, when the weather clears up, when a last-minute slot opens.

- **Context is currency:** Location, time of day, weather, personal preferences, and past activity are data that can replace manual input. The platform should use this context to fill in gaps and make intelligent suggestions rather than asking the user to do that work.

- **Plans are ranges, not points:** Times are approximate, guest lists are tentative, and places are often TBD. Treat all event parameters as flexible ranges or options — not fixed data — and make it easy to narrow them down as the date approaches.

- **Distribute the organizer's burden:** Organizing is a thankless, energy-draining role that falls on too few people. The platform should make coordination effortless and automatic so that anyone can initiate a hangout — not just the usual organizer.

- **Graceful change:** Cancellations, reschedules, and rejections are a normal part of social life. Make it easy and socially comfortable to change or pass on plans without friction, awkwardness, or dead-end conversations.

- **Interest is the catalyst:** There are always far more ideas than materialized plans. The gap between a loose idea and a real plan is rarely closed by the organizer working harder — it's closed by social signal. When friends express interest, the organizer sees it, and the idea gains the momentum it needs to become real. The platform's core engagement loop is: ambient plan visibility → interest signal → organizer motivation → plan materialization → friend notification → attendance.

---

## Files index

| File | Description |
|------|-------------|
| [User stories bank](./user-stories.md) | Unsolved user story bank where this product would create value. |
| [Product FAQ](./product-faq.md) | Frequently asked questions document to add more insight into the product. |
| [The triple constraint of hangin' out](./wh3_whitepaper.pdf) | A thought analysis of the different variables to plan an activity. |
| [MVP-1 Spec](./specs/mvp-1.md) | Scope, flows, and success metrics for Alpha. |
| [MVP-1 User Journeys](./4-user-journeys-mvp1.md) | Every Alpha flow as a full journey: happy path, sad paths, and standard resolutions. |
| [Materialization Workflow Worksheet](./specs/materialization-workflow.md) | Open decision register for the plan-materialization loop (Flows 4.2/8.2) — blocks its tech doc. |
| [Beta-1 Spec](./specs/beta-1.md) | Scope, flows, and success metrics for Beta. |

---

## Open Questions (WIP)

[Unresolved questions about the product direction, users, or constraints. Remove entries as they are answered.]

- [ ] [Question 1]
- [ ] [Question 2]

---

## Appendix

### Principles — Source Traceability

| Principle | Source |
|---|---|
| **Flexibility first** | Whitepaper — the triple constraint framework; humans need to postpone decisions |
| **Lower the activation energy** | Whitepaper — the farmer's market scenario; FAQ — organizers juggle Maps, Calendar, messaging |
| **Proactive, not reactive** | README intro — opportunities should surface at the moment they can lead to action; user stories (weather, last-minute tickets) |
| **Context is currency** | Whitepaper — GPS, preferences, history can fill missing variables; FAQ — intelligent recommendations |
| **Plans are ranges, not points** | User stories — "How do millennials hang out?", time limits, trip hangs with evolving details |
| **Distribute the organizer's burden** | README intro — society relies thanklessly on organizers with limited energy |
| **Graceful change** | User stories — subtle rejection, weather strikes, recurrent plans that need rescheduling |
| **Interest is the catalyst** | Product decision — "Interested" button as opt-in gesture; the engagement loop that converts ambient ideas into real plans |