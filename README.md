# Marketplace Bot

A Discord bot that turns forum posts into marketplace listings and tracks transactions and reputation between members.

## How it works

1. **Post a listing.** Create a post in the marketplace forum titled `[Region] [H] Item [W] Offer` (`[H]` = have, `[W]` = want). The bot parses the title, creates a pending listing and asks the author to **Confirm**, mark it as a **Trade**, or **Deny** (edit the title and get re-prompted).
2. **Record a transaction.** Inside the post, either party runs `/confirm user:<other party> type:<purchase|trade|money+trade>`. The other party gets a DM to confirm or cancel.
3. **Rate each other.** Once confirmed, both parties are prompted by DM to leave a positive/negative rating and an optional anonymous review.
4. **Close the listing.** The author runs `/close reason:<sold|withdrawn>`; the post is renamed (`[SOLD]`, `[FOUND]`, `[TRADED]` or `[WITHDRAWN]`) and tagged `closed`.

`/history [user]` shows a member's listings, transactions and reputation.

## Setup

Requires Node.js 18+.

```sh
npm install
```

Create a `.env` file:

```sh
BOT_TOKEN=your-bot-token
# Optional: only treat posts in this forum channel as listings (otherwise any forum counts)
MARKETPLACE_FORUM_ID=123456789012345678
```

The forum should have the tags `pending`, `for sale`, `want to buy`, `want to trade` and `closed`. The bot needs permission to view the forum, send messages in threads, manage threads (rename/tag) and send DMs.

```sh
node index.js
```

Data is stored in `db.sqlite`. On startup the bot creates any missing tables and indexes; it never alters existing columns.

## Development

```sh
npm test              # node:test suite
npm run format        # apply Prettier
npm run format:check  # what CI runs
```
