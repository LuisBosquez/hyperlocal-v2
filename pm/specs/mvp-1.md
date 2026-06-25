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

This app is also a social network in itself. There's a users platform and the ability to make connections. Users can follow their friends. Following is immediate — no approval required. If a user follows you, they can view your profile: your public **Lists** — named collections of places you've curated (like playlists, but for spots) — plus a map of those places. If you follow them back, you become mutual friends, which unlocks the full experience: saved places and plans become visible to each other. 

When users open this application, they will be able to see the places around them that they had previously saved, as a list. For example, if I travel to Paris, I want to see the crepes place I really wanted to visit. 

Users will also have their own profile page, which opens on a **map view** of their places alongside their Lists. What visitors see depends on their relationship: anyone (even non-followers) can see the user's **public Lists** and the places in them on the map — a snapshot of taste and intent the user has chosen to share. Mutual friends additionally see the full saved places list and upcoming plans. Private Lists are visible only to the owner. Users can choose to make their page private, which hides it from non-followers entirely. Lists are user-curated — they replace the older auto-generated "Favorite Places / Want to Go" sections; "Want to Go" lives on as a default, editable List. 

Another beauty of the Plan object, instead of event, is that it will survive its organizer. Imagine I create a cool plan: going to see the sunset at Alki beach, but then I decide I cancel my plan - the rest of the people should still be encouraged to go. They should know that I cancelled, but the plan lives on despite my absence. 

## Principles

- **Decisions about everything don't need to be made in a rush**. As opposed to traditional event planning platforms, you don't need to do all the thought work before creating a plan.
- **Smart, human, reasonable defaults**. The user can only visit a place during its opening hours for API-sourced places, the user can only schedule things for the future. Reminders are set automatically based on the type of plan. 
- **Flexibility is the key differentiator**: Users change their mind, a lot. This app is designed around that. 
- **Everyone is welcome, by default** At this moment, the plans on the platform should be understood as an open invite. If you can see your friends plans (Place + Date/Time), then you are invited and you can join. 
- **Add a little pizzazz**: Users can save custom messages with their places, something to help them remember why they saved it. 
- **There's always context**: Whenever users open their application, there's always something we can learn about them - their location, the time of day, the day of the week, etc. Let's use this to create wonderful experiences.
- **Show what's nearby, not everything**: Discovery is bounded and local by default. The map and The Panel surface a small, relevant set scoped to the area the user is looking at — not the user's entire global save history. Quiet beats complete; a short list the user can act on beats a long one they have to wade through.
- **User-enriched data is the moat**: The personal notes people attach to places ("cortado", "great for a rainy afternoon") are something no generic map has. We treat that text as first-class, searchable data — it's a core differentiator versus Google Maps, where search only knows names and categories.

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
- Search functionality: The map view also contains a search bar that allows users to find a place by name or category. Search is **notes-enriched** — it also matches the personal notes attached to places, so searching "cortado" surfaces a coffee shop someone noted that about even when the name doesn't match. Note matches are prioritized, and the search spans both your own notes and your mutual friends' notes (mutual only). See Flow 16.
- Ability to save a place with a personal note. The note is what powers notes-enriched search (above) and helps the user remember why they saved a place. 
- Ability to see one's saved places as a list, but plans at the top of the list. The list is **scoped to the current area** on the map and **capped** (up to ~9 place cards) so it stays scannable rather than dumping the user's entire global save history. See Flow 9. 
- Ability to organize saved places into **Lists** — named, user-created collections of places (like playlists for spots). A place can live in many Lists. Each List is **public or private**; public Lists appear on the owner's profile and are viewable by anyone, even non-friends. "Want to Go" is a default, editable List seeded for every user. See Flows 17–19. 
- Ability to cancel your plans. This will not delete the plan object for everyone who joined the plan. 
- Ability to visit another user's personal page, which opens on a **map view** of their places. Access is tiered by follow relationship: anyone who isn't blocked by privacy sees display name, photo, bio, and the user's **public Lists** (and the places in them, pinned on the profile map). Mutual friends additionally see the full experience: the user's full saved places appear on your map and their plans appear in your Panel. Private Lists are owner-only. See Flow 7 / Flow 20. 
- Ability to see your friend's saved places on your map, **scoped to the area you're viewing** (you see a friend's nearby saves, not every place they've ever saved everywhere). See Flow 10. 
- Ability to **scope discovery to an area**: as the user pans the map, a "Search this area" affordance re-scopes the recommendations, Panel list, and pins to wherever they're now looking; the current area is labeled (reverse-geocoded neighborhood name). A **"locate me"** control recenters the map on the user's current location and drops a "you are here" marker (especially useful on mobile). See Flows 14–15. 
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
- **Clickable neighborhood polygons** — rendering named, tappable neighborhood regions as overlays on the map. MVP-1 ships the lighter "current area" model (pan + "Search this area" + a reverse-geocoded label); polygon selection is a deferred enhancement.
- **Searching non-mutual users' notes.** Notes-enriched search only reaches your own notes and your mutual friends' notes. A stranger's private notes are never searchable, and search never exposes a friend's full note text — only that a match occurred and whose note it was.
- **Collaborative / shared Lists.** Lists in MVP-1 have a single owner. Co-editing, contributor permissions, and following a List for updates are out of scope.

---


## Key UI Surfaces

### Map view & responsive layout

The map is the foundational surface and is **always visible**. On desktop it fills the left of the screen with The Panel docked as a fixed sidebar on the right.

**Mobile (requirement):** the map fills the screen and The Panel becomes an **expandable bottom sheet** — it must never take over the screen and hide the map. By default the sheet is collapsed to a peek (a grab handle + a "Plans & places nearby" label) so the map stays the primary surface; tapping or dragging the handle expands it to ~full height to reveal the list (notifications, plans, places, filters), and tapping the dimmed map collapses it again. Opening a card (place/plan detail) presents a full-screen overlay on top; dismissing it returns to the map. The map and panel stay mounted throughout — navigating into a detail never blanks or disables the map.

**Map pins** are large, easily tappable teardrop markers (not small dots), with the tip anchored on the location and color-coded by source: your saved places, friends' places, and contextual suggestions.

**Zoom controls:** the +/− zoom buttons are shown on desktop only. On mobile they are hidden (they would collide with the floating overlay); users pinch to zoom.

**Locate me & current location:** a **"locate me" control** (a recenter button, prominent on mobile where it matters most) recenters the map on the user's current location and drops a distinct **"you are here" marker** that is visually different from place pins. It builds on the existing geolocation behavior (which currently centers the map once on load) by making recentering an explicit, repeatable action. If location permission is denied or unavailable, the button explains and the app falls back to the last/default viewport (see Flow 15).

**Area scoping ("Search this area"):** the map center defines the **current discovery area**. The area is labeled with a reverse-geocoded neighborhood/area name shown in the floating overlay near the tagline (e.g. "Capitol Hill"). When the user pans away from the scoped area, a **"Search this area"** button appears over the map; tapping it re-scopes the recommendations strip, the Panel's place list, and the map pins to the new area, and updates the label. With no panning, the area defaults to the user's location. This is the lightweight model; clickable neighborhood polygons are a deferred enhancement (see Out of Scope). See Flow 14.

**Floating search & recommendations overlay:** the search bar and the contextual recommendations strip are **not** docked inside The Panel — they float together in a card that is horizontally centered over the top of the map, above all map content, on both desktop and mobile. The overlay is otherwise click-through so the user can still pan the map around it. This keeps the two "discovery" affordances (find a specific place / see what's recommended right now) anchored to the map itself rather than buried in the side/bottom list.

- **Search bar** — searches places (by name, category, **and personal notes** — yours and mutual friends'), or `@handle` for people; results appear in a dropdown beneath the field. A result matched on a note shows **why** it matched ("matched your note" or "matched @handle's note") so the connection is legible. See Flow 16.
- **Recommendations strip** — a contextual tagline (the current "moment") and the **current-area label** (reverse-geocoded neighborhood name), with a **refresh** button beside them, above a **horizontally scrollable** row of suggested-place chips. The strip is **scoped to the current area** and **capped** at a small set (≤9). Each chip shows the place name plus a distance + closing-time subtext (see Flow 12). The refresh button re-runs the recommendation engine and reloads the map pins on demand (independent of the automatic refresh when the map is panned or the area is re-scoped).

### The Panel

The Panel is the primary list interface of the app, displayed alongside the map. It is a unified, scrollable list of cards that consolidates everything actionable and relevant to the user in one place — notifications, upcoming plans, and saved places nearby. Every card can be tapped to open its full view. The Panel can be filtered using pills at the top. (Search and contextual recommendations live in the floating map overlay, not in The Panel — see "Floating search & recommendations overlay" above.)

**Card types and sort order (top to bottom):**

| Priority | Card type | Content | Primary actions |
|---|---|---|---|
| 1 | Notification card | Follow alerts, plan reminders, friend plan alerts, time proposals | Follow back · Dismiss |
| 2 | Plan card (yours) | Your upcoming plans, timeless plan prompts | Open plan · Add time · **Review proposals** · Cancel |
| 2 | Plan card (friend's) | Friends' plans visible because you're mutual followers | Interested · Join · **Propose a time** |
| 3 | Place card | Saved places, friends' saved places, contextual suggestions | Open place · Create plan |

**Friend plan alerts** are opt-in via an **"Interested"** button on the friend's Plan card (see Flow 8.2). Tapping "Interested" is not a commitment to attend — it's a lightweight signal of intent: *I want to follow this and know when it develops.* The organizer sees an interest count on their plan, giving them social confirmation that friends want it to happen. Anyone who tapped "Interested" receives a Notification card when the organizer adds or updates the time. The initial appearance of the Plan card in The Panel is passive and requires no action.

**Sort logic within each type:**
- Notification cards: most recent first
- Plan cards: soonest date/time first; timeless plans appear below timed ones with an "Add time" prompt
- Place cards: proximity to the **current area**, ascending

**Scoping & caps (noise control):** The Panel is deliberately bounded so it stays scannable rather than turning into an endless feed.
- **Place cards are scoped to the current area** (the map viewport / "Search this area" selection), not the user's entire global save set, and are **capped at up to ~9** — the nearest N for that area. Friends' saved places follow the same rule: a friend's saves appear only when they're near the current area, never all at once.
- **Plans stay pinned at the top**, but the plan section is also bounded (soonest / most-relevant first) so a user with many plans doesn't flood the rest of The Panel. The "current area" scoping does not hide a user's own upcoming plans — plans are time-relevant, not just place-relevant — but the visible count is bounded.
- When the area is re-scoped (Flow 14), the place cards and pins refresh to the new area; the cap re-applies.

**Filter pills:** All · Plans · Places · Hide notifications

### Profile Page

The profile page is the window through which users see each other. It opens on a **map view** of the owner's places (the pins visible to the viewer's tier), with the owner's **Lists** below it. What's visible is determined by the viewer's follow relationship with the profile owner.

**Visibility tiers:**

| Viewer relationship | What they see |
|---|---|
| No relationship (not following) | Display name, photo, bio. The owner's **public Lists** and a profile **map** of the places in them. Follow button. |
| One-way follower (viewer follows owner; no follow-back) | Same as above — public Lists + their places on the profile map. No private Lists, no plans, no plan history. |
| Mutual friend (both following each other) | Full profile: display name, photo, bio, **all** the owner's Lists (public and any shared with friends), the full saved places list on the profile map, and upcoming plans. |
| Private profile | Name + "this profile is private". No Lists, no map, follow disabled (see Flow 11). |

**Lists (replaces the old auto-derived sections):** A profile shows the owner's Lists as the primary expression of taste and intent. Lists are **user-curated** — the older auto-generated "Favorite Places" and "Want to Go" sections are gone. **"Want to Go" survives as a default, editable List** seeded for every user (it's where a plain save lands by default), so the intent it used to convey is preserved but now under the user's control. Each List is **public or private**; only public Lists are shown to non-mutual viewers.

**Profile map:** the places across the viewer-visible Lists are pinned on the profile map. Tapping a pin opens the standard **Place detail** view, where the viewer can **Save**, **Add to a List**, or **Create a plan** — turning someone else's taste into the viewer's own next move. See Flow 20.

### Lists

A **List** is a named, user-created collection of places — the curation primitive of the product (think Spotify playlists, but for places). Lists are how a user expresses taste publicly and organizes saves privately.

- **Membership is many-to-many.** A place can belong to multiple Lists at once (e.g. the same wine bar in both "Date night" and "Capitol Hill favorites"). Removing a place from one List leaves it in any others, and leaves the underlying save intact.
- **Visibility is per-List:** **public** (shown on the owner's profile to anyone) or **private** (owner-only). Toggling a public List to private removes it from profiles immediately; any shared link to it stops resolving.
- **Default "Want to Go" List.** Every user has a "Want to Go" List by default. A plain save (bookmark) lands here unless the user picks other Lists. It is editable and can be made private.
- **List Page.** Opening a List shows its title, optional description, visibility toggle (owner only), and its place cards. The owner can add/remove places and reorder. Anyone viewing a public List can open its places into Place detail to save / add to their own List / create a plan.
- **Sharing.** A public List can be shared via the existing floating share-dialog / invite-link pattern (see *Sharing & invite links*).
- Adding a place to Lists happens from **Place detail** — the save action lets the user pick one or more Lists (multi-select), defaulting to "Want to Go". See Flows 17–19.

### Sharing & invite links

Plans and profiles are shared via invite links. Tapping **Share** (on a plan detail) or **Share profile** (on your own profile) opens a **floating share dialog** — a small modal that displays the generated link in a read-only field with a one-tap **Copy** button, plus the native share sheet where the device supports it.

Requirements:
- The link is created on demand; the dialog shows a loading state while it's minted and a **Try again** affordance if creation fails (rather than a dead-end error toast).
- The link is **always shown** so the user can read and copy it manually. We do not rely on a silent clipboard write — this is what made sharing fail on mobile and non-HTTPS origins, where the Clipboard API is unavailable.
- Opening an invite link follows the inviter on signup (see Flow 6 / Flow 13).

---

## Key Flows

[High-level description of the core user journeys this MVP enables. No wireframes needed — just the sequence of actions and decisions a user goes through.]

> The flows below are happy-path only. Full journeys — including every sad path and its standard resolution — live in [pm/4-user-journeys-mvp1.md](../4-user-journeys-mvp1.md). The Flow 4.2/8.2 materialization details are resolved and specified in the [Materialization Workflow Worksheet](materialization-workflow.md) (decision record) and [tech/09-materialization-workflow.md](../../tech/09-materialization-workflow.md).

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
1. If user uses the search bar, they can type keywords to find places in a list, sorted by proximity. Matches come from a place's name and category **and** from personal notes — their own and their mutual friends' (see Flow 16) — so a note can surface a place the name wouldn't. The search results replace The Panel temporarily while still showing the map.
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
1. After selecting a date, the time picker goes **generic → specific**, mirroring the date pills: **Morning · Afternoon · Evening · Set a time**. Picking a coarse band (morning/afternoon/evening) is enough — the plan becomes real with an *approximate* time, and the user is reminded the day-of to lock in an exact time (but never forced to). Choosing **Set a time** reveals 30-minute blocks (or 15-minute for precision); the chosen time must be within the place's opening hours. For "Today" a time-of-day is required (band or exact). For future dates the user can still **Skip for now** to leave it tentative — an info icon explains a Notification card will prompt them later.
1. Once saved, a Plan card appears at the top of The Panel (above all Place cards) with the date and time. The user can share the plan from its detail view — **Share** opens a floating dialog to view and copy the invite link (see *Sharing & invite links*).
1. Creating a plan automatically saves the place. A Plan card also appears at the top of The Panel for every mutual friend (they are not notified, but will see it when they open the app).

### Flow 4.2: Adding a time to a plan that didn't have it
1. Every timeless plan appears in The Panel as a Plan card with a visible "Add time" prompt.
1. The app also issues Notification cards in this order: one the day before the plan date, then one the morning of. If both are ignored, the plan marks the organizer as "unconfirmed" — a label visible to friends on the plan page.
1. Tapping either the Plan card prompt or a Notification card opens the plan page with the same time-selection controls from Flow 4.1 (including the morning/afternoon/evening tier).
1. Saving updates the Plan card in The Panel to show the confirmed time. The "unconfirmed" label is removed.

### Flow 4.3: Proposing a time on a friend's plan (collaborative materialization)
*The organizer is no longer the only one who can move a plan forward.* Any mutual friend who can see a timeless or tentative plan — they don't have to have joined — can suggest when it should happen.
1. On a friend's un-timed plan, a **"Propose a time"** action appears below the plan details (alongside Join / Interested).
1. It opens a sheet where the proposer adds **one or more time options** — each built with the same date + morning/afternoon/evening/Set-a-time picker from Flow 4.1 — and picks how long the options stay open (**default 2 days**, proposer-adjustable).
1. On send, the organizer gets a Notification card ("[handle] proposed N times for [place]") and a **"Proposed times"** review section on the plan page. The proposer's plan page shows "You proposed N times · waiting on [organizer]" with a **Retract** option. Only one open proposal exists per plan at a time — until it resolves, others see "[handle] proposed times — waiting on [organizer]."

### Flow 4.4: The organizer picks (or passes)
1. On the plan page, the organizer sees each proposed option with an **Accept** button, plus **"None of these work."**
1. **Accept** materializes the plan to that option (exact time *or* band) exactly as if the organizer had set it themselves — everyone Joined or Interested is notified, and the proposer gets a "your time was picked" card.
1. **None of these work** declines the whole proposal; the plan returns to its un-timed state and the proposer is told. If the options simply expire (or the organizer sets a time directly), the proposal is cleared the same way and the proposer is notified.

### Flow 5: Cancelling a plan
1. Every Plan card in The Panel (yours) has a cancel option, also accessible from the plan detail page.
1. Tapping cancel opens a confirmation prompt. The user must confirm to proceed.
1. On confirmation, the Plan card is removed from the organizer's Panel. The place remains saved as a Place card.
1. For friends who joined, the plan remains visible in their Panel but is marked as cancelled by the organizer. The plan lives on for them.

### Flow 6: Finding and following a user
1. You can search for users by their handle, or open their profile via a shared link. Before following, their profile already shows display name, photo, bio, and their **public Lists** on the profile map (public Lists are visible to anyone).
1. Tapping Follow is immediate — no approval required. Following doesn't unlock more profile content on its own (public Lists were already visible); it's the precursor to a follow-back, which makes you mutual friends and unlocks their full saved places and plans.
1. The followed user receives a Notification card in their Panel: "[handle] followed you." Tapping it opens the follower's profile.
1. If the followed user wants to follow back, the Notification card shows a "Follow back (add as friend)" action. Taking this action establishes a mutual follow, making them friends — their Plan cards now appear in each other's Panel.

### Flow 7: Viewing a mutual friend's profile
1. You can view a mutual friend's profile by searching for their handle, browsing your friends list, or tapping their name in a plan's attendee list.
1. As mutual friends, you see their full profile: the profile map with their complete saved places, all their Lists, and their upcoming plans. Tapping any pin opens Place detail where you can save it, add it to one of your Lists, or create a plan (see Flow 20).

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
1. Interested (or Joined) friends don't have to wait passively: they can **propose a time** for the organizer to accept (see Flow 4.3).

### Flow 9: Viewing your saved places list
1. The Panel, filtered to "Places," shows your saved Place cards **for the current area**, sorted by proximity and **capped** (up to ~9) so the list stays scannable. Friends' saved places near the area are mixed in with a distinct visual treatment.
1. To see saves elsewhere, the user pans the map and taps "Search this area" (Flow 14) — the list re-scopes to that area. The full personal collection is also browsable List-by-List on the user's own profile.
1. You can also browse the map — your saved places appear as pins, with friends' places using a different pin style.

### Flow 10: Viewing friends' saved places on the map
1. A friend's Place cards appear mixed into The Panel alongside your own **when they're near the current area**, sorted by proximity — never the friend's entire global save set at once. They are visually distinct (different card style or label).
1. On the map, friends' saved places use a different pin style from your own, so the two are always distinguishable at a glance. Panning + "Search this area" reveals their saves in other areas.

### Flow 11: Editing your profile
1.  Navigating to your profile allows you to click on a button to edit your socials. You can edit them by adding your instagram handle, X/twitter handle or Facebook link, for now.
1. You can also choose to make your profile private. This will disallow non-followers or friends from seeing your places. If a user visits your page, it will only show that your profile is private, no places will be shown and the follow action will be disabled. 

### Flow 12: Default places on the map
1. User lands on the homepage. The floating search & recommendations overlay sits centered over the top of the map.
1. A contextual tagline summarizes the current moment (weather, time of day, day of week) as a short, fun prompt.
1. Beside the tagline is a **refresh** button. Tapping it re-runs the recommendation engine and reloads the map pins on demand.
1. Beside the tagline, the current **area label** (reverse-geocoded neighborhood name) tells the user which area the suggestions are for. Re-scoping the area (Flow 14) re-runs the suggestions for the new area.
1. Below the tagline, a **horizontally scrollable** strip shows contextual suggested places for the **current area** — automatically chosen based on time, day, weather, and location, and **capped** at a small set (≤9). These are also pinned on the map.
1. Each contextual chip shows a subtext hint with distance and closing time: e.g. "1.2km away · closes in 3hr". If the place closes in under 1 hour, show "closes in less than 1hr". Truncate to the nearest full hour. If opening hours are unknown, omit the closing part; if distance is unavailable, omit that part.
1. The user can tap any chip to open the detail view and take action (save or create a plan).

### Flow 13: Following someone back
1. User opens the app and sees a Notification card at the top of The Panel: "[handle] followed you."
1. Tapping the card opens the follower's profile page, showing their display name, photo, and bio.
1. If the user wants to follow back, they tap "Follow back (add as friend)" on the profile or directly on the Notification card action.
1. The Notification card is dismissed. Both users are now mutual friends — their Plan cards appear in each other's Panel going forward.

### Flow 14: Scoping discovery to an area
1. By default, discovery (recommendations strip, Panel place cards, map pins) is scoped to the area around the user's current location, labeled with a reverse-geocoded neighborhood name.
1. The user pans the map to look at a different area. Once the view has moved away from the scoped area, a **"Search this area"** button appears over the map.
1. Tapping it re-scopes the recommendations, the Panel's place list (own + friends' saves nearby, capped), and the pins to the new area, and updates the area label.
1. If the user pans back into the existing scoped area, the button hides again — no redundant re-scope.
1. This is the lightweight "current area" model. Clickable named-neighborhood polygons are a deferred enhancement (Out of Scope).

### Flow 15: Recentering on my location ("Locate me")
1. The map shows a **"locate me"** control (prominent on mobile).
1. Tapping it requests location permission if not already granted, recenters the map on the user's current location, drops a distinct **"you are here" marker**, and re-scopes discovery to that area (as in Flow 14).
1. If permission is denied or location is unavailable, the control surfaces a brief hint and the map falls back to the last/default viewport — the core experience is unaffected (degraded proximity → recency, consistent with the location-off behavior elsewhere).

### Flow 16: Notes-enriched search
1. The user types a term in the search bar (e.g. "cortado").
1. Results include places whose **name or category** match, **and** places whose **personal note** matches — drawn from the user's own notes and their mutual friends' notes. A note match can surface a place whose name has nothing to do with the query (e.g. "Victrola Coffee Roasters" surfaced by a note that says "cortado").
1. Each result that matched on a note shows its **provenance** — "matched your note" or "matched @handle's note" — and the note-matched results are **prioritized** (your own notes rank above friends').
1. Search never exposes a friend's full note text — only the fact of a match and whose note it was. Notes of users who are not mutual friends are never searched.
1. Tapping a result opens Place detail as usual.

### Flow 17: Creating and curating a List
1. From their profile (or a "+ New List" affordance), the user creates a List: a name and an optional description.
1. The user sets the List's visibility: **public** (appears on their profile to anyone) or **private** (owner-only). New Lists default to private.
1. The user adds places to the List (from the List page, or via "Add to List" on any Place detail) and can remove or reorder them. Removing a place from a List does not unsave it or remove it from other Lists.
1. The List page shows the title, description, visibility toggle, and the ordered place cards. A public List can be shared via the floating share dialog (see *Sharing & invite links*).

### Flow 18: Adding a place to one or more Lists
1. On any Place detail, the save action lets the user pick one or more **Lists** to add the place to (multi-select), defaulting to the **"Want to Go"** List.
1. A plain bookmark with no List chosen lands the place in "Want to Go".
1. The same place can be added to additional Lists later; membership is many-to-many.
1. Saving confirms with a toast and the place appears as a Place card / pin as usual, and on each chosen List's page.

### Flow 19: List visibility & viewing another user's public List
1. The owner can toggle any List between public and private at any time from the List page. Making a List private removes it from their profile for non-owners immediately and stops any shared link to it from resolving.
1. A viewer (including a non-friend) opens a **public** List from the owner's profile, or via a shared link. They see the List's title, description, and place cards.
1. The viewer can open any place into Place detail and **Save**, **Add to a List**, or **Create a plan** from it.
1. A public List of a user with an otherwise-private profile is still not reachable through the profile (the profile is private), but a direct shared link to the public List resolves to the List view only — no other profile content leaks.

### Flow 20: Viewing a profile's map
1. The user opens another user's profile (or their own). The profile opens on a **map view** of that user's places, scoped to what the viewer's tier allows: non-mutual viewers see the places in the owner's **public Lists**; mutual friends see the owner's full saved places.
1. The map pins use the standard place-pin styling. Tapping a pin opens the standard **Place detail**.
1. From Place detail the viewer can **Save** the place, **Add it to one of their own Lists**, or **Create a plan** — converting the owner's taste into the viewer's next action.
1. If the viewer's tier yields no visible places (e.g. a user with no public Lists), the map shows a friendly empty state rather than a blank canvas.

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

### Discovery & curation

| Metric | Target |
|---|---|
| List adoption | ≥50% of active users have at least one List beyond the default "Want to Go" within 30 days |
| Public List rate | ≥30% of users with a List make at least one List public (validates Lists as a sharing surface) |
| Notes-search usage | ≥15% of searches in a session match on a note (validates notes as a differentiated search input) |
| Area re-scope usage | ≥25% of sessions use "Search this area" or "locate me" at least once (validates spatial control) |
| Profile-map engagement | ≥20% of profile views result in a pin tap into Place detail |

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
| `plan_materialized` | A plan receives its first "when" — an exact time **or** a coarse band (carries `time_granularity`) | Materialization rate (numerator) |
| `mutual_connection_formed` | A follow-back creates a mutual connection | Social graph metrics |
| `search_note_matched` | A search returns at least one result matched on a personal note | Notes-search usage |
| `time_proposed` | A friend proposes time options on a plan (Flow 4.3) | Collaborative materialization funnel (denominator) |
| `time_proposal_accepted` | Organizer accepts a proposed option (Flow 4.4) | Proposal acceptance rate; materialization-via-proposal |
| `time_proposal_declined` | Organizer declines a proposal ("none work") | Proposal friction signal |
| `time_proposal_retracted` | Proposer retracts their own proposal | Engagement-quality signal |
| `area_rescoped` | User taps "Search this area" to re-scope discovery | Area re-scope usage |
| `locate_me_tapped` | User taps the "locate me" control | Area re-scope usage |
| `list_created` | A user creates a List | List adoption |
| `place_added_to_list` | A place is added to a List | List adoption depth (places per list) |
| `place_removed_from_list` | A place is removed from a List | Curation behavior |
| `list_visibility_changed` | A List is toggled public/private | Public List rate |
| `list_shared` | A public List's invite link is generated/copied | List as a sharing surface |
| `list_viewed` | A List page is opened (own or another user's) | List reach |
| `profile_map_pin_tapped` | A pin on a profile map is tapped into Place detail | Profile-map engagement |

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

- **Notes-search privacy shift.** Notes-enriched search (Flow 16) makes a mutual friend's notes *searchable* to you — a change from the prior stance that notes are fully private (today, friends' notes aren't even shown on map pins). Confirm this is acceptable, and confirm the exposure boundary: search returns a **provenance label only** ("matched @handle's note"), never the note text or a snippet. Default in this spec: label-only, mutual-only. Open: should there be a per-note or per-user opt-out of being searchable?
- **Fate of auto-derived "Favorite Places."** Lists replace the old auto-derived profile sections. "Want to Go" cleanly becomes a default editable List. The old "Favorite Places" was *derived from plan/attendance history* and has no obvious owner-curated equivalent. Decide: (a) drop it entirely, (b) seed a default editable "Been & loved" List from attendance history that the user can keep or delete. Default recommendation: (b).
- **"Want to Go" now means two things — reconcile.** Historically (Flow 4.2 and the [Materialization Workflow Worksheet](materialization-workflow.md): M-J2, M-D2, M-D6) "Want to Go" denotes *places the user has a **timeless plan** for* — intent expressed as a plan. The Lists model reuses the name for a *default **List** where plain saves land* — a lighter signal. These are not the same thing (a save is weaker than a timeless plan). Decide whether: (a) the default List subsumes timeless-plan places (one unified "Want to Go" surface, save = weakest tier, timeless plan = stronger), or (b) rename one of them to avoid the collision (e.g. the save bucket becomes "Saved" and "Want to Go" stays plan-derived). This must be settled before implementation since it changes what the default List contains and how the materialization loop reads it.
- **Cap value.** The Panel place-card and recommendations cap is specced as "up to ~9". Confirm the exact number (6–9) and whether it differs between the recommendations strip and the Panel place list.

---

## Dependencies

[What needs to exist before this MVP can ship?]

- [e.g. Places data source / API selected]
- [e.g. Push notification infrastructure]
