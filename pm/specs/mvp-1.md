# MVP-1 Spec

> **Status:** WIP
> **Last updated:** 2026-03-04
> **Release:** Alpha (MVP-1) — Core product: establish the core loop
> **Platform:** Mobile-first web app
---

## Introduction

The purpose of this MVP is to solve the most basic and essential needs of our users while creating a solution that prioritizes ease of use and ease of adoption while laying out the groundwork for more sophisticated features down the road.

When shared amongst friends, this MVP feels like a quick online utility that your friend found that seems quite useful, so much that it makes you wonder why nobody thought of it before. This MVP does not feel like "THE NEW, FANCY WAY OF ORGANIZING EVENTS WITH YOUR FRIENDS AND IT WILL REPLACE EVERYTHING ELSE YOU USE".

One of the key concepts of this app is the Event or Calendar Invite object. In our world, this is not meant to be an end-user facing object. It's also an overloaded term that implies exclusivity. This is why we consider those "Plans". Creating an Event adds complexity and mental overhead due to its management. I want the user to view a place and decide to go and set a time to go. Therefore, creating a Plan. And only then can the user share their plan with a friend, or many. The plan contains a place and a time. People can see the plan and decide to join if they'd like to in an opt-in way. The other issue with events is that declining them feels rough so an opt-in plan seems like the way to go here. With plans, friends can also only see them before they're happening, conveniently so. 

## The product

In this stage, the product is a simple map application that allows users to select a point-of-interest in the map, optionally attach a time on it and share it with their friends. When friends receive it, they can choose to join now, or later. They don't have to decide right away. 

The map pinning is a platform - as a user, you'll generate a history of places that you were at some point interested in, some of them you visited. You can clearly distinguish between the ones you were interested at some point, the ones you visited in the past, the ones you want to visit in the future, anywhere in the world. 

The points-of-interest are relevant, visit-able places from the Google Maps API. No places in this database exist if they can't be visited by a user and their friends. 

This app is also a social network in itself. There's a users platform and the ability to make connections. Users can follow their friends. Following is immediate — no approval required. If a user follows you, they can view your profile: a curated snapshot of your taste and intent via two place lists. If you follow them back, you become mutual friends, which unlocks the full experience: saved places and plans become visible to each other. 

When users open this application, they will be able to see the places around them that they had previously saved, as a list. For example, if I travel to Paris, I want to see the crepes place I really wanted to visit. 

Users will also have their own profile page. What visitors see depends on their relationship: one-way followers see a curated view — Favorite Places and Want to Go — a snapshot of taste and intent without revealing full activity. Mutual friends see the full saved places list and upcoming plans. Users can choose to make their page private, which hides it from non-followers entirely. 

Another beauty of the Plan object, instead of event, is that it will survive its organizer. Imagine I create a cool plan: going to see the sunset at Alki beach, but then I decide I cancel my plan - the rest of the people should still be encouraged to go. They should know that I cancelled, but the plan lives on despite my absence. 

## Principles

- **Decisions about everything don't need to be made in a rush**. As opposed to traditional event planning platforms, you don't need to do all the thought work before creating a plan.
- **Smart, human, reasonable defaults**. The user can only visit a place during its opening hours for API-sourced places, the user can only schedule things for the future. Reminders are set automatically based on the type of plan. 
- **Flexibility is the key differentiator**: Users change their mind, a lot. This app is designed around that. 
- **Everyone is welcome, by default** At this moment, the plans on the platform should be understood as an open invite. If you can see your friends plans (Place + Date/Time), then you are invited and you can join. 
- **Add a little pizzazz**: Users can save custom messages with their places, something to help them remember why they saved it. 
- **There's always context**: Whenever users open their application, there's always something we can learn about them - their location, the time of day, the day of the week, etc. Let's use this to create wonderful experiences.

## Objective

- To create an extremely simple and easy to adopt map interface that allows users to create and share places. 
- To introduce the fundamental objects that will remain true in later versions of the app: e.g. Users, Places, Plans; including some of their fundamental properties.
- To introduce the back-end database that will power all the places that users can choose based on the Google Places API. 
- To introduce the front-end interface: A simple map to find things near you.
- To introduce the fundamental user actions: Find a place. Save a place with a custom message to view later. Find your friends. Share places with friends.
- To start the data collection process of user activity related to all the objects and actions. This will power both our internal telemetry and future user's needs like history. 
- To introduce the social media connections actions, including following users and viewing their places, and their plans. 


---

## In Scope

- Fully functional user management system: Authentication with Google/Apple and profile management. Users create a handle when they onboard and that's what they use to connect. 
- Fully functional social network: I can follow someone and they can follow me back. I can look up people by their handles and add them. They could also find my profile and see the places I have saved relative to my location. 
- A database of visitable places from the Google Maps API. 
- Simple map view that contains pins for places relevant to the user. Users can simply scroll to see what's around them and then select them to save them or to decide they're going to that place. 
- Search functionality: The map view also contains a search bar that allows users to find a certain type of place by name.
- Ability to save a place with a personal note. This will help the search functionality eventually. 
- Ability to see one's saved places as a list, but plans at the top of the list. 
- Ability to cancel your plans. This will not delete the plan object for everyone who joined the plan. 
- Ability to visit another user's personal page. Access is tiered by follow relationship: one-way followers (you follow them; they haven't followed back) see the profile page only — display name, photo, bio — plus two curated place lists: **Favorite Places** (top 5 places aggregated from their completed plans, place info only) and **Want to Go** (places they have a timeless plan for, place info only — no dates or context). Mutual friends see the full experience: the user's saved places appear on your map and their plans appear in your Panel. 
- Ability to see your friend's saved places on your map. 
- Ability to see everyone who is joining your plan. You can visit their personal pages from there.
- Ability to see the other users that are joining your friend's plans. You can visit their personal pages from there. 
- Ability to create your profile and list your socials there: Instagram. X/Twitter. Facebook. This is part of your profile setting form and it's always optional. 
- Ability to view the metadata of any given place: its address (which is a hyperlink to a google maps instance, opened in a separate tab). 
- Ability to see proactively shown places based on their current context: time of the day, day of the week, location and weather. If, for example, is lunchtime (11:30am-1pm), they will see 5 lunch places near them that are currently open. If it is sunny outside and it's not a meal time, they will see nearby parks. If it's raining and it's a weekend day, they will see museums or libraries. No coffee after 5pm. 
- Unauthenticated landing page experience where new users view a taste of functionality before singing up. 
- Simple in-app notification system. For V0, this will rely on the browser alert messages but will evolve in the future to email and text notifications. 


---

## Out of Scope

[Equally important — what is explicitly excluded. This prevents scope creep and deferred decisions from sneaking in.]

- Personalized search recommendations for the users. 
- Personalized proactive recommendations displayed on the map.
- Recurrent event/plan invites. 
- Email invites or any sort of "add friends" to your invite. Friends can only opt-in to joining but they can't be automatically added. 
- Email or text notifications. This will be critical in the future just not now. 
- User generated places (AKA Home addresses).

---


## Key UI Surfaces

### The Panel

The Panel is the primary list interface of the app, displayed alongside the map. It is a unified, scrollable list of cards that consolidates everything actionable and relevant to the user in one place — notifications, upcoming plans, and saved places nearby. Every card can be tapped to open its full view. The Panel can be filtered using pills at the top.

**Card types and sort order (top to bottom):**

| Priority | Card type | Content | Primary actions |
|---|---|---|---|
| 1 | Notification card | Follow alerts, plan reminders, friend plan alerts | Follow back · Dismiss |
| 2 | Plan card (yours) | Your upcoming plans, timeless plan prompts | Open plan · Add time · Cancel |
| 2 | Plan card (friend's) | Friends' plans visible because you're mutual followers | Interested · Join |
| 3 | Place card | Saved places, friends' saved places, contextual suggestions | Open place · Create plan |

**Friend plan alerts** are opt-in via an **"Interested"** button on the friend's Plan card (see Flow 8.2). Tapping "Interested" is not a commitment to attend — it's a lightweight signal of intent: *I want to follow this and know when it develops.* The organizer sees an interest count on their plan, giving them social confirmation that friends want it to happen. Anyone who tapped "Interested" receives a Notification card when the organizer adds or updates the time. The initial appearance of the Plan card in The Panel is passive and requires no action.

**Sort logic within each type:**
- Notification cards: most recent first
- Plan cards: soonest date/time first; timeless plans appear below timed ones with an "Add time" prompt
- Place cards: proximity to current location, ascending

**Filter pills:** All · Plans · Places · Hide notifications

### Profile Page

The profile page is the window through which users see each other. What's visible is determined by the viewer's follow relationship with the profile owner.

**Visibility tiers:**

| Viewer relationship | What they see |
|---|---|
| No relationship (not following) | Display name, photo, bio. Follow button. |
| One-way follower (viewer follows owner; no follow-back) | Display name, photo, bio. Two curated place lists (below). No map, no plans, no plan history. |
| Mutual friend (both following each other) | Full profile: display name, photo, bio, full saved places list, upcoming plans. |

**Two curated place lists (visible to one-way followers):**

- **Favorite Places** — Up to 5 places derived from the user's attendance history, aggregated at the place level only. Communicates where they've actually been. No plan details, no dates, no attendee info — place name and info only.
- **Want to Go** — Places the user has a timeless plan for. Communicates intent without revealing any scheduling or personal activity context. Place name and info only.

These lists are intentionally curated and timeless — they convey taste and intent without exposing the user's personal activity or plan history to someone who hasn't followed back.

---

## Key Flows

[High-level description of the core user journeys this MVP enables. No wireframes needed — just the sequence of actions and decisions a user goes through.]

### Flow 0: Landing page
1. Unauthenticated user lands on the website. They can browse places but are prompted to create an account to save and share places and plans.

### Flow 1: Onboarding & account creation
1. User clicks on create account either on the top bar or by clicking on any of the in-flow prompts in the app.
1. User gets redirected into the account creation experience. The user is presented with the option to log in with Google or Apple.
1. User creates a handle that is enforced to be unique. User saves to continue.
1. User lands in their personal page. They can edit it by adding their socials. These will be additional ways to interact with people they meet on this platform.
1. User saves their details and is taken to the main view: the map with The Panel open alongside it.

### Flow 2: Finding a place on the map
1. User lands on the web app. The map is displayed with The Panel open alongside it.
1. User can choose between exploring one of the Place cards in The Panel (contextual suggestions) or use the search bar.
1. If user uses the search bar, they can type keywords to find places in a list, sorted by proximity. The search results replace The Panel temporarily while still showing the map.
1. Matching places also show as pins on the map.
1. Once the user selects a place (from The Panel, search results, or a map pin), it opens in a detail view showing extra information: a clickable address link, a picture from Google Maps Places, a quick description, a bookmark icon, and a call to action to create a plan.
1. User can also see a collapsed section that when opened reveals a text box for a custom note.
1. User can close the detail view at any time to return to the map with The Panel.

### Flow 3.1: Saving a place with a note
1. When the user views a place detail, they can select the bookmark icon. This will save the place, confirmed by a short disappearing toast message.
1. Clicking the bookmark simultaneously opens the collapsed note section, prompting the user to write something. The place is already saved; adding text and clicking save attaches the note.
1. The user can decide to ignore the note.
1. A Place card for the saved place now appears in The Panel and as a pin on the map.

### Flow 3.2: Saving a place by using a note
1. When the user views a place detail, they can open the collapsed section to reveal the text box.
1. The user adds text and clicks the save button. This saves the place (bookmark shows as checked) and attaches the note in one action.
1. A Place card for the saved place now appears in The Panel and as a pin on the map.

### Flow 4.1: Creating a plan for a place
1. The user can create a plan from any place detail view — whether they arrived there from a Place card in The Panel, a map pin, or a search result.
1. The user clicks the call to action to create a plan.
1. They are presented with date options as pills: Today · Tomorrow · This weekend (or Next weekend if it already is the weekend) · Select date. A date is required.
1. After selecting a date, they can optionally specify a time, unless they selected "Today" (time is required then). Time must be within the place's opening hours. The user scrolls through 30-minute blocks, or switches to 15-minute blocks for more precision. For future dates, time can be skipped via "Skip for now" — an info icon explains that a Notification card will prompt them to add the time closer to the date.
1. Once saved, a Plan card appears at the top of The Panel (above all Place cards) with the date and time. The user can also copy a shareable link from the Plan card.
1. Creating a plan automatically saves the place. A Plan card also appears at the top of The Panel for every mutual friend (they are not notified, but will see it when they open the app).

### Flow 4.2: Adding a time to a plan that didn't have it
1. Every timeless plan appears in The Panel as a Plan card with a visible "Add time" prompt.
1. The app also issues Notification cards in this order: one the day before the plan date, then one the morning of. If both are ignored, the plan marks the organizer as "unconfirmed" — a label visible to friends on the plan page.
1. Tapping either the Plan card prompt or a Notification card opens the plan page with the same time-selection controls from Flow 4.1.
1. Saving updates the Plan card in The Panel to show the confirmed time. The "unconfirmed" label is removed.

### Flow 5: Cancelling a plan
1. Every Plan card in The Panel (yours) has a cancel option, also accessible from the plan detail page.
1. Tapping cancel opens a confirmation prompt. The user must confirm to proceed.
1. On confirmation, the Plan card is removed from the organizer's Panel. The place remains saved as a Place card.
1. For friends who joined, the plan remains visible in their Panel but is marked as cancelled by the organizer. The plan lives on for them.

### Flow 6: Finding and following a user
1. You can search for users by their handle, or open their profile via a shared link. Before following, their profile shows display name, photo, and bio only.
1. Tapping Follow is immediate — no approval required. Their profile now shows two curated place lists: **Favorite Places** (up to 5 places from their completed plans, place info only) and **Want to Go** (places they have a timeless plan for, place info only — no dates or context).
1. The followed user receives a Notification card in their Panel: "[handle] followed you." Tapping it opens the follower's profile.
1. If the followed user wants to follow back, the Notification card shows a "Follow back (add as friend)" action. Taking this action establishes a mutual follow, making them friends — their Plan cards now appear in each other's Panel.

### Flow 7: Viewing a mutual friend's profile
1. You can view a mutual friend's profile by searching for their handle, browsing your friends list, or tapping their name in a plan's attendee list.
1. As mutual friends, you see their full profile: upcoming plans and their complete list of saved places.

### Flow 8: Joining a friend's plan
1. A friend's Plan cards appear at the top of your Panel automatically once you are mutual friends. You can also find their plans by visiting their profile.
1. Tapping a Plan card opens the plan detail page, showing the place, date/time, and who else is joining.
1. The user taps "Join" to opt in. The plan now also appears as a Plan card in their own Panel, sorted by date.

### Flow 8.2: Expressing interest in a friend's plan
1. A friend's Plan card appears in your Panel. The plan may have no time yet — just a place and a loose idea (e.g. "watch hockey at the German bar").
1. The card shows an **"Interested"** button. Tapping it is not a commitment to attend — it signals that you want to follow the plan and be notified when it develops.
1. The organizer sees the interest count update on their plan. This is a social signal: friends want this to happen.
1. When the organizer adds or updates a time, everyone who tapped "Interested" receives a Notification card in their Panel.
1. From the Notification card (or the plan detail page), the user can then tap "Join" to formally opt in.

### Flow 9: Viewing your saved places list
1. The Panel, filtered to "Places," shows all your saved Place cards sorted by proximity to your current location. Friends' saved places are mixed in with a distinct visual treatment.
1. You can also browse the map — your saved places appear as pins, with friends' places using a different pin style.

### Flow 10: Viewing friends' saved places on the map
1. Friends' Place cards appear mixed into The Panel alongside your own, sorted by proximity. They are visually distinct (different card style or label).
1. On the map, friends' saved places use a different pin style from your own, so the two are always distinguishable at a glance.

### Flow 11: Editing your profile
1.  Navigating to your profile allows you to click on a button to edit your socials. You can edit them by adding your instagram handle, X/twitter handle or Facebook link, for now.
1. You can also choose to make your profile private. This will disallow non-followers or friends from seeing your places. If a user visits your page, it will only show that your profile is private, no places will be shown and the follow action will be disabled. 

### Flow 12: Default places on the map
1. User lands on the homepage. The Panel is open alongside the map.
1. A contextual tagline above the search bar summarizes the current moment (weather, time of day, day of week) as a short, fun prompt.
1. The Panel shows a set of contextual Place cards — automatically suggested based on time, day, weather, and location. These are also pinned on the map.
1. The user can tap any Place card to open the detail view and take action (save or create a plan).

### Flow 13: Following someone back
1. User opens the app and sees a Notification card at the top of The Panel: "[handle] followed you."
1. Tapping the card opens the follower's profile page, showing their display name, photo, and bio.
1. If the user wants to follow back, they tap "Follow back (add as friend)" on the profile or directly on the Notification card action.
1. The Notification card is dismissed. Both users are now mutual friends — their Plan cards appear in each other's Panel going forward.

---

## Success Metrics

**Definition of "active user":** logged in + took at least one action (plan created, place saved, Interested, or Joined) in the last 7 days.

### Acquisition

| Metric | Target |
|---|---|
| Invite link conversion rate | ≥40% of shared links result in an active user (account created + at least 1 plan, Interested, or Joined action within 7 days) |
| Time to first plan | ≥60% of new users create their first plan within 3 days of joining |

### Engagement — core loop

| Metric | Target |
|---|---|
| Plans per active user per week | ≥3 |
| Materialization rate | ≥30% of timeless plans receive at least one Interested within 7 days of creation |
| Interested → Joined conversion | ≥20% — primary validation signal that the loop closes |

### Social graph

| Metric | Target |
|---|---|
| Mutual connection within 7 days | ≥70% of users form at least 1 mutual connection within 7 days of joining |
| Avg mutual connections (30 days) | ≥3 per active user within 30 days |

---

## Telemetry Requirements

Telemetry must be instrumented from day one — not retrofitted after launch. An analytics pipeline is a prerequisite for launch validation, not a post-launch concern. Flag this as M1 setup work alongside auth and database schema.

| Event | Trigger | Powers |
|---|---|---|
| `invite_link_shared` | User generates or copies a shareable invite link | Invite conversion funnel (numerator) |
| `invite_link_converted` | New user completes signup via an invite link | Invite link conversion rate |
| `user_active_session` | User logs in and takes at least one qualifying action (plan created, place saved, Interested, Joined) | Active user definition; all engagement metrics |
| `plan_created` | Any plan is created (with or without a time) | Plans per active user per week; time to first plan |
| `place_saved` | User saves a place | Active user definition; engagement baseline |
| `plan_interested` | User taps Interested on a friend's plan | Materialization rate; Interested → Joined funnel (denominator) |
| `plan_joined` | User taps Join on a plan | Interested → Joined conversion (numerator) |
| `plan_materialized` | A timeless plan has a time added by the organizer | Materialization rate (numerator) |
| `mutual_connection_formed` | A follow-back creates a mutual connection | Social graph metrics |

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React.js (SPA) | Single Page Application — no full page reloads |
| Frontend hosting | AWS Amplify | Static hosting + CDN + GitHub CI/CD |
| Backend | Python Flask (API-only) | REST API only, no template rendering |
| Backend hosting | AWS Lambda + API Gateway (via Mangum) | Serverless, scales to zero, pay-per-request |
| Database | Supabase (hosted Postgres) | Same AWS region as Lambda for low latency |
| Auth | Supabase Auth — Google OAuth (MVP) | Apple + Facebook OAuth in V2 (Supabase supports natively, config-only addition) |
| Realtime | Supabase Realtime | Plan updates, notifications, Panel live updates |
| Maps | Mapbox GL JS | Chosen over Google Maps for flexibility and UI quality |
| Analytics | PostHog | Self-hosted option available; powers all 9 telemetry events |

**Deployment note:** Flask (via Mangum on Lambda) and the Supabase instance must be in the same AWS region — `us-east-1` recommended — to minimize database round-trip latency.

**Auth note:** Supabase Auth handles Google OAuth for MVP-1 and is pre-wired to support Apple and Facebook OAuth in V2 with no backend changes — provider addition is config-only in the Supabase dashboard.

---

## Constraints & Assumptions


---

## Open Questions

[Decisions that must be resolved before or during the build. Assign an owner and target date where possible.]

---

## Dependencies

[What needs to exist before this MVP can ship?]

- [e.g. Places data source / API selected]
- [e.g. Push notification infrastructure]
