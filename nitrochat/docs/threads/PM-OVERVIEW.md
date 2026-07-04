# NitroChat Thread Persistence — Project Manager Overview

> **Audience:** Non-technical stakeholders, product managers
> **Purpose:** Plain-English explanation of what was built, why, and how every user scenario is handled

---

## What Problem Does This Solve?

Before this feature, every time a user refreshed the page or reopened NitroChat, their entire conversation was gone. The chat had no memory between sessions.

This feature gives NitroChat **persistent conversation history**. Every message a user sends is saved to a database. When they come back — whether on a different browser, a different device, or after a week — their conversation is exactly where they left it.

---

## How Does It Work (in Plain English)?

Think of it like a notepad system:

1. When a user opens NitroChat, we quietly assign them an **identity card** (called an "actor"). This card is either tied to their user ID or automatically generated for anonymous visitors.
2. We then open a **conversation folder** (called a "thread") for that identity. If they had a previous conversation, we find the same folder. If it's their first visit, we create a new one.
3. As they chat, every message is **saved to the folder** in real time — both their questions and the AI's answers.
4. The next time they open NitroChat, we find their folder and **restore the conversation** before they can even type.

The user sees none of this. From their perspective, their conversation just always "remembers" where it left off.

---

## Who Does This Affect?

There are three types of users this feature supports. Each is handled differently:

---

### Scenario 1 — Anonymous Visitor (No Login, No User ID)

**Who:** A user who opens NitroChat directly with no account and no special URL parameters.

**What happens:**
- On first visit, a random anonymous ID is quietly created for them and saved in their browser's local storage (like a cookie, but for this app).
- A conversation folder is created and linked to that ID.
- Every message they send is saved.
- If they **refresh the page**, the ID is read from their browser and the conversation is restored instantly.
- If they open NitroChat in a **new tab on the same browser**, same result — restored.
- If they open NitroChat on a **different browser or device**, a new anonymous ID is created and they start a fresh conversation (since we have no way to recognise them across devices without a login).
- If they **clear their browser data**, the local ID is gone and a new conversation starts.

**In short:** Works seamlessly on the same browser/device. Cannot follow the user across devices.

---

### Scenario 2 — External User ID Passed by a Parent Application

**Who:** A business that has embedded NitroChat inside their own product and passes a user identifier through the URL (e.g. `?userId=customer_1234`).

**What happens:**
- NitroChat reads the `userId` from the URL.
- That value becomes the user's stable identity across all sessions.
- Their conversation folder is permanently tied to `customer_1234`.
- If they open NitroChat on **any device** using the same `?userId=customer_1234` URL, they get the **exact same conversation back**.
- Two different users (`?userId=alice` and `?userId=bob`) get **completely separate, isolated conversations**.

**In short:** Full cross-device continuity. Ideal for businesses integrating NitroChat into their own user-authenticated platform.

---

### Scenario 3 — Embed Mode (NitroChat Embedded in an iFrame)

**Who:** A website that embeds NitroChat as a chat widget (via `/embed`).

**What happens:**
- Works exactly like Scenario 2 if a `?externalUserId=` is passed.
- Falls back to Scenario 1 (anonymous, browser-local) if no user ID is provided.
- Two different `externalUserId` values always produce separate conversations.
- The embed is fully isolated — what happens inside the embed does not affect any other NitroChat session.

**In short:** The embed behaves correctly whether or not the host app provides a user identity.

---

### Scenario 4 — Authenticated Users (Future / ZITADEL)

**Who:** Users who log in with a real account (via ZITADEL authentication, which is planned for a future phase).

**What happens:**
- When a user is logged in, their JWT login token will be used as the identity automatically — no `userId` parameter needed.
- Their conversation will follow them across every device they log in from.
- This is **not yet active** but the system has been designed to support it with no structural changes.

**In short:** Architecture is ready. Just waiting for the authentication layer to be plugged in.

---

## Edge Cases & How They're Handled

| Situation | What the User Experiences |
|---|---|
| Page refresh | Conversation restores automatically. Brief loading indicator shown. |
| Browser tab reopened | Conversation restores automatically. |
| Internet goes offline mid-session | Chat continues showing past messages. A banner appears saying the connection was lost. |
| Internet comes back online | App automatically reconnects and restores where it left off. No manual refresh needed. |
| Server temporarily down | The app retries quietly up to 3 times with short waits in between. If it still fails, a friendly error message appears with a "Retry" button. |
| Request takes too long (>10 seconds) | The loading screen gives up gracefully, shows an error, and lets the user retry. Chat is never permanently stuck. |
| Two browser tabs open at the same time | Both tabs share the same conversation safely. No duplicate messages. |
| 5 users hit "start conversation" at the exact same millisecond with the same ID | Only one conversation folder is created. All 5 users land in the same folder. No duplicates. (This was a specific race condition we identified and fixed.) |
| Feature turned off | Setting `THREADS_ENABLED=false` disables the entire feature instantly. NitroChat behaves exactly as it did before this feature existed. Zero risk to existing users. |
| User clears browser local storage | A fresh anonymous session starts. Previous conversation cannot be recovered (by design — there was no account to link it to). |
| User has no internet at all on first load | A clear error message is shown. When connectivity is restored, bootstrap runs automatically. |

---

## What Was NOT Changed

This feature was built to be completely non-disruptive:

- **Regular chat works identically** when threads are turned off.
- **MCP tool integrations** are unaffected.
- **OAuth and login flows** are unaffected.
- **Voice mode** is unaffected.
- **Export/import chat** still works.
- **Existing MongoDB-based chat history** (if configured) is unaffected.
- No user data was deleted or migrated. The feature only adds new data storage.

---

## Where Is the Data Stored?

Conversations are saved in **ClickHouse**, a high-performance database designed for large-scale read/write operations. It was chosen because:

- It handles very high message volumes efficiently.
- It stores messages in chronological order and retrieves them quickly.
- It automatically handles duplicate writes (e.g. from retries) without creating duplicate messages.

The user's browser only stores three small pieces of information locally:
- Their anonymous ID (`actorId`)
- Their conversation folder ID (`threadId`)
- Their actor type (anonymous or external)

No message content is stored in the browser. All messages live in the database.

---

## Security

- The database API key is **never sent to the user's browser**. All requests go through a secure server-side proxy.
- External user IDs are sanitised before use — special characters and injection attempts are stripped.
- The feature flag (`THREADS_ENABLED`) means the entire system can be disabled in seconds if needed, with no code changes.

---

## Summary

| Capability | Supported |
|---|---|
| Conversation persists across page refresh | Yes |
| Conversation persists across browser tabs | Yes |
| Conversation persists across devices (anonymous) | No — by design |
| Conversation persists across devices (with userId param) | Yes |
| Conversation persists across devices (with login) | Planned (future) |
| Automatic recovery after network drop | Yes |
| Automatic retry on server errors | Yes |
| Works when feature is turned off | Yes — no impact |
| Isolated conversations per user | Yes |
| No duplicate messages even with retries | Yes |
