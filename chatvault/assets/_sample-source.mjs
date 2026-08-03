/* Authoring source for assets/sample-vault.json.
   Run:  node assets/_sample-source.mjs > assets/sample-vault.json
   This file is not loaded by the site. It exists so the sample export stays
   readable and editable instead of being a wall of generated JSON. */

const C = (s) => s.replace(/\n\s*\|/g, "\n").trim();

export const CONVERSATIONS = [
  {
    title: "Exponential backoff for a rate-limited API",
    t: "2025-02-11T09:42:00Z",
    msgs: [
      ["h", C(`We keep getting 429s from a partner API. Right now we retry three times with a flat
        |1 second wait. It still falls over during their peak hours. What should the retry policy
        |actually look like?`)],
      ["a", C(`A flat wait is the problem. Every client that got rate limited waits the same 1 second
        |and then hits the API again at the same instant, so you rebuild the exact spike that caused
        |the 429. You want three things: exponential growth, a cap, and jitter.

        |\`\`\`js
        |async function withBackoff(fn, { tries = 6, base = 250, cap = 20_000 } = {}) {
        |  let attempt = 0;
        |  for (;;) {
        |    try {
        |      return await fn();
        |    } catch (err) {
        |      if (!isRetryable(err) || attempt >= tries - 1) throw err;
        |      const ceiling = Math.min(cap, base * 2 ** attempt);
        |      const wait = Math.random() * ceiling; // full jitter
        |      await new Promise((r) => setTimeout(r, wait));
        |      attempt++;
        |    }
        |  }
        |}
        |\`\`\`

        |That is "full jitter": the wait is uniform between 0 and the ceiling rather than the ceiling
        |itself. It costs you a little latency on the happy path and buys a large reduction in
        |collision rate once you have more than a handful of clients.`)],
      ["h", "Does the server tell us how long to wait? I see a Retry-After header sometimes."],
      ["a", C(`If \`Retry-After\` is present, obey it. It is authoritative and your backoff is a guess.
        |The usual shape is: use the header when it exists, fall back to jittered exponential when it
        |does not, and never let the header push you past your own cap without logging it.

        |\`\`\`js
        |function waitFor(res, attempt, base, cap) {
        |  const header = res.headers.get("retry-after");
        |  if (header) {
        |    const seconds = Number(header);
        |    const ms = Number.isFinite(seconds)
        |      ? seconds * 1000
        |      : Date.parse(header) - Date.now();
        |    if (ms > 0) return Math.min(ms, cap);
        |  }
        |  return Math.random() * Math.min(cap, base * 2 ** attempt);
        |}
        |\`\`\`

        |One more thing worth doing: only retry 429, 502, 503, 504 and network errors. Retrying a 400
        |just burns your quota on a request that will never succeed.`)],
      ["h", "What about the total time budget? Six tries at 20 seconds is a two minute request."],
      ["a", C(`Put a deadline on the whole operation rather than counting tries. Tries are a proxy for
        |time and a bad one. Pass an \`AbortSignal\` with a deadline, check it before each sleep, and
        |shorten the last sleep so you fail at the deadline instead of past it. If the caller is a
        |user-facing request, a 3 to 5 second budget is usually right and you should fail fast into a
        |cached or degraded response. If the caller is a background job, a 5 minute budget with a
        |much higher cap is fine.`)],
    ],
    branches: [
      {
        at: 3,
        alt: [
          ["a", C(`Before you touch the retry policy, check whether you should be retrying at all.
            |Most 429 storms are a concurrency problem wearing a retry costume. If you have 40 workers
            |all pulling from the same queue against an API that allows 10 requests per second, no
            |backoff policy will save you. It will just move the failure around.

            |The fix is a client-side limiter that shapes traffic before it leaves your process:

            |\`\`\`js
            |class TokenBucket {
            |  constructor(rate, burst) {
            |    this.rate = rate; this.burst = burst;
            |    this.tokens = burst; this.last = Date.now();
            |  }
            |  async take() {
            |    for (;;) {
            |      const now = Date.now();
            |      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
            |      this.last = now;
            |      if (this.tokens >= 1) { this.tokens -= 1; return; }
            |      await new Promise((r) => setTimeout(r, ((1 - this.tokens) / this.rate) * 1000));
            |    }
            |  }
            |}
            |\`\`\`

            |With a bucket in front, backoff becomes the exception path it was meant to be.`)],
          ["h", "That is a good point. How do I pick the rate if their docs are vague?"],
          ["a", C(`Measure it. Set the bucket low enough that you never see a 429 for a day, then raise
            |the rate by 20 percent at a time until you see the first one, then drop back one step. Log
            |the 429 count as a metric so the number is visible rather than folklore. If the partner
            |publishes limits per key and you have several keys, the limiter belongs per key, not per
            |process, otherwise you will underuse the quota you paid for.`)],
        ],
      },
    ],
  },

  {
    title: "Why does Postgres ignore my index?",
    t: "2025-01-23T14:05:00Z",
    msgs: [
      ["h", C(`I have an index on \`events(created_at)\` and this query still does a sequential scan:
        |\`SELECT * FROM events WHERE created_at > now() - interval '7 days'\`. The table has 40 million
        |rows. Why?`)],
      ["a", C(`Most likely because seven days is a large fraction of the table and the planner has
        |decided the index is not worth it. An index scan on a wide table costs a random page fetch per
        |row; a sequential scan reads pages in order. Once the selectivity gets past roughly 5 to 10
        |percent, the sequential scan genuinely wins.

        |Check what the planner thinks first:

        |\`\`\`sql
        |EXPLAIN (ANALYZE, BUFFERS)
        |SELECT * FROM events WHERE created_at > now() - interval '7 days';
        |\`\`\`

        |Compare the estimated rows with the actual rows on the top node. If the estimate is way off,
        |the statistics are stale and \`ANALYZE events;\` is your fix. If the estimate is accurate and
        |it still picks a sequential scan, the planner is probably right.`)],
      ["h", "The estimate is close. But I only need three columns, not the whole row."],
      ["a", C(`Then say so, and give the index those columns so it can answer the query on its own:

        |\`\`\`sql
        |CREATE INDEX CONCURRENTLY events_created_at_covering
        |  ON events (created_at) INCLUDE (event_type, user_id);
        |\`\`\`

        |Now \`SELECT created_at, event_type, user_id FROM events WHERE created_at > ...\` can be an
        |index-only scan, which reads far fewer pages than the heap. Two caveats. The visibility map
        |has to be reasonably fresh or Postgres still visits the heap to check tuple visibility, so
        |make sure autovacuum is keeping up on a table with that much churn. And \`INCLUDE\` columns
        |are not usable for filtering or ordering, only for returning.`)],
      ["h", "Anything else that commonly breaks index use?"],
      ["a", C(`Four that come up constantly:

        |A function or cast on the indexed column. \`WHERE date(created_at) = '2025-01-01'\` cannot use
        |an index on \`created_at\`. Rewrite as a range, or build an expression index on \`date(created_at)\`.

        |A type mismatch between the column and the parameter, most often \`text\` versus \`varchar\`
        |through an ORM, or \`bigint\` versus \`numeric\`.

        |A \`LIKE '%foo%'\` leading wildcard. B-tree cannot help. That is what a trigram index is for.

        |And \`random_page_cost\` still sitting at the default of 4.0 on SSD storage. On modern disks
        |1.1 is much closer to reality and it changes plan choice on exactly this kind of query.`)],
    ],
  },

  {
    title: "IndexedDB transaction keeps auto-closing",
    t: "2025-03-04T21:18:00Z",
    msgs: [
      ["h", C(`I get "TransactionInactiveError: Failed to execute 'put' on 'IDBObjectStore'" about
        |halfway through a bulk import of 50,000 records. The first few thousand go in fine.`)],
      ["a", C(`An IndexedDB transaction stays alive only while it has outstanding requests. The moment
        |the microtask queue drains with no pending request on that transaction, the browser commits
        |it. So any \`await\` on something that is not an IndexedDB request kills the transaction:

        |\`\`\`js
        |// broken: the fetch lets the transaction commit before the loop resumes
        |const tx = db.transaction("records", "readwrite");
        |for (const r of records) {
        |  const extra = await fetch(r.url);   // transaction dies here
        |  tx.objectStore("records").put({ ...r, extra });
        |}
        |\`\`\`

        |Do all the async work first, then open the transaction and write synchronously.`)],
      ["h", "There is no fetch in my loop, but I am awaiting each put."],
      ["a", C(`Awaiting each put is usually fine, because a promise wrapping \`request.onsuccess\`
        |resolves inside the same transaction lifetime. But if your wrapper adds an extra microtask
        |hop, or if you \`await Promise.all\` on something unrelated, or you use a \`for await\` over an
        |async generator that yields, you get the same failure.

        |The shape that is reliable is fire-and-collect: issue every put without awaiting, then await
        |the transaction itself.

        |\`\`\`js
        |function writeChunk(db, rows) {
        |  return new Promise((resolve, reject) => {
        |    const tx = db.transaction("records", "readwrite");
        |    const store = tx.objectStore("records");
        |    for (const row of rows) store.put(row);
        |    tx.oncomplete = () => resolve(rows.length);
        |    tx.onabort = tx.onerror = () => reject(tx.error);
        |  });
        |}
        |\`\`\`

        |Chunk at 200 to 1000 rows. One transaction for 50,000 rows works but holds a lot of memory and
        |gives you nothing to report progress with, and if it aborts you lose all of it.`)],
      ["h", "Is there a cost to opening a transaction per chunk?"],
      ["a", C(`A small fixed cost, mostly the commit fsync. In practice chunks of 500 land close to the
        |throughput of one giant transaction while giving you a progress signal and a rollback unit
        |you can reason about. Measure with \`performance.now()\` around \`writeChunk\` and try 100, 500
        |and 2000 on your own data. The curve is flat enough after a few hundred that the exact number
        |rarely matters.`)],
    ],
  },

  {
    title: "Grid or flexbox for a three column workspace",
    t: "2024-11-30T10:12:00Z",
    msgs: [
      ["h", C(`I am building a three column layout: a fixed 244px filter panel, a fixed 372px list, and
        |a fluid reading pane. Flexbox or grid?`)],
      ["a", C(`Grid, and it is not close. Your columns are a property of the container, not of the
        |children. With grid you write the whole layout in one place:

        |\`\`\`css
        |.workspace {
        |  display: grid;
        |  grid-template-columns: 244px 372px minmax(0, 1fr);
        |  min-height: 100dvh;
        |}
        |\`\`\`

        |With flexbox you would be distributing \`flex: 0 0 244px\` across three separate child rules,
        |and the reading pane would need \`min-width: 0\` anyway to stop long words from blowing the
        |layout out. Grid gets you the same fix with \`minmax(0, 1fr)\` and keeps the intent in the
        |container where a reader will look for it.`)],
      ["h", "What breaks at narrow widths?"],
      ["a", C(`Redeclare the template rather than letting it collapse on its own. Something like:

        |\`\`\`css
        |@media (max-width: 1119px) {
        |  .workspace { grid-template-columns: 300px minmax(0, 1fr); }
        |  .workspace > .filters { position: fixed; inset: 0 auto 0 0; width: 300px; }
        |}
        |@media (max-width: 767px) {
        |  .workspace { grid-template-columns: minmax(0, 1fr); }
        |}
        |\`\`\`

        |The rule I follow is that every multi column layout declares its own sub-768px behaviour in
        |the same block. "It will collapse naturally" is how you end up with a 372px list squeezed into
        |a 375px phone with 3px of reading pane next to it.`)],
    ],
  },

  {
    title: "Debouncing a search box without dropping the last keystroke",
    t: "2025-04-18T16:44:00Z",
    msgs: [
      ["h", C(`My search debounce swallows the final character sometimes. User types "postgres", the
        |request goes out for "postgre". I am using a 150ms trailing debounce.`)],
      ["a", C(`That is not the debounce dropping a character, that is a stale response winning the race.
        |Two requests are in flight, the earlier one resolves later, and it overwrites the newer
        |result. Debounce reduces how often it happens, it does not prevent it.

        |Tag each query and ignore anything that is not the latest:

        |\`\`\`js
        |let seq = 0;
        |async function run(query) {
        |  const mine = ++seq;
        |  const results = await search(query);
        |  if (mine !== seq) return;  // a newer query started, drop this
        |  render(results, query);
        |}
        |\`\`\`

        |If the search is remote, add an \`AbortController\` per query and abort the previous one so you
        |are not paying for work you will discard.`)],
      ["h", "Should the debounce be leading or trailing?"],
      ["a", C(`Trailing, but with an immediate local pass. The pattern that feels fastest is: on every
        |keystroke, synchronously update the parts of the UI that are cheap (the query echo, the clear
        |button, the syntax highlighting of the query itself), and debounce only the expensive ranking.
        |90 to 120ms is the sweet spot for a local index. Below about 80ms you are re-ranking on
        |every keystroke for no perceptible gain; above 200ms it starts to feel laggy.

        |One more thing: flush the debounce on Enter and on blur. A user who types and immediately
        |presses Enter should not wait out the timer.`)],
    ],
  },

  {
    title: "Borrow checker error inside a loop",
    t: "2024-12-09T11:30:00Z",
    msgs: [
      ["h", C(`Rust is rejecting this and I do not understand why:

        |\`\`\`rust
        |let mut cache: HashMap<String, Vec<u32>> = HashMap::new();
        |for key in keys {
        |    let entry = cache.entry(key.clone()).or_default();
        |    entry.push(compute(&cache));
        |}
        |\`\`\`
        |"cannot borrow \`cache\` as immutable because it is also borrowed as mutable".`)],
      ["a", C(`The error is exactly right and it is protecting you from a real bug. \`entry\` holds a
        |mutable borrow of \`cache\` for as long as it is alive. \`compute(&cache)\` wants an immutable
        |borrow at the same time. If that were allowed, \`compute\` could observe the map in a state
        |where \`or_default()\` has just inserted an empty vector that is about to be mutated.

        |Compute first, then borrow:

        |\`\`\`rust
        |for key in keys {
        |    let value = compute(&cache);
        |    cache.entry(key).or_default().push(value);
        |}
        |\`\`\`

        |Note I also dropped the \`clone()\`, since \`entry\` takes the key by value and \`keys\` is
        |already being consumed by the loop.`)],
      ["h", "What if compute genuinely needs to see the entry it is about to write to?"],
      ["a", C(`Then you have a read-modify-write and you should say so explicitly. Take the old value
        |out, compute, put it back:

        |\`\`\`rust
        |for key in keys {
        |    let current = cache.remove(&key).unwrap_or_default();
        |    let next = compute(&current, &cache);
        |    cache.insert(key, next);
        |}
        |\`\`\`

        |This costs one hash lookup extra and makes the data flow obvious. If profiling says the extra
        |lookup matters, \`get_mut\` plus \`std::mem::take\` avoids the removal, but reach for that only
        |once you have a measurement.`)],
    ],
  },

  {
    title: "Cutting a 1.2 GB Docker image down",
    t: "2025-05-06T08:55:00Z",
    msgs: [
      ["h", C(`Our Node service image is 1.2 GB. Deploys take four minutes just pulling it. Where do I
        |start?`)],
      ["a", C(`Start by looking rather than guessing. \`docker history --no-trunc <image>\` shows the size
        |of every layer, and the top three usually account for 90 percent of the total. In a Node image
        |the usual suspects are the base image, \`node_modules\` including dev dependencies, and build
        |artifacts that were never removed.

        |A multi-stage build fixes most of it:

        |\`\`\`dockerfile
        |FROM node:22-bookworm AS build
        |WORKDIR /app
        |COPY package*.json ./
        |RUN npm ci
        |COPY . .
        |RUN npm run build && npm prune --omit=dev

        |FROM node:22-bookworm-slim
        |WORKDIR /app
        |COPY --from=build /app/node_modules ./node_modules
        |COPY --from=build /app/dist ./dist
        |USER node
        |CMD ["node", "dist/server.js"]
        |\`\`\`

        |The slim base alone is usually 700 MB of the difference.`)],
      ["h", "Is alpine worth it over slim?"],
      ["a", C(`Sometimes, and it has a real cost. Alpine uses musl instead of glibc. Native modules that
        |ship prebuilt binaries for glibc will either fall back to compiling from source, which makes
        |your build slow and your image bigger, or fail outright. There have also been long-standing
        |DNS resolution differences under musl that bite services doing a lot of outbound lookups.

        |My rule: start with \`-slim\`. Move to alpine only if you have measured the pull time and it
        |actually matters, and only after you have confirmed every native dependency has a musl build.
        |Going from 1.2 GB to 220 MB is worth chasing. Going from 220 MB to 150 MB rarely is.`)],
    ],
    branches: [
      {
        at: 1,
        alt: [
          ["a", C(`Before optimising the image, check whether the image size is actually what is slow.
            |Four minutes for a 1.2 GB pull is about 40 Mbit/s, which suggests you are pulling over the
            |public internet with no layer cache. Two questions worth answering first:

            |Are your nodes reusing layers between deploys? If the only thing that changes each deploy
            |is your application code and that code sits in the last layer, the pull should be a few
            |megabytes, not 1.2 GB. If every deploy pulls everything, your \`COPY . .\` is probably above
            |\`npm ci\`, invalidating the dependency layer on every commit.

            |Is there a registry in the same region or a pull-through cache? Moving the registry next to
            |the cluster often beats any Dockerfile change you can make.`)],
          ["h", "You are right, we copy the whole repo before installing. Fix the order?"],
          ["a", C(`Yes, and add a \`.dockerignore\` while you are there. The ordering rule is: copy the
            |files that change least often first.

            |\`\`\`dockerfile
            |COPY package*.json ./
            |RUN npm ci            # cached unless the lockfile changes
            |COPY . .              # invalidated on every commit, but it is a small layer
            |RUN npm run build
            |\`\`\`

            |And \`.dockerignore\` should at minimum contain \`node_modules\`, \`.git\`, \`dist\`, and any
            |test fixtures. Copying a local \`node_modules\` into the build context is a classic way to
            |both slow the build and silently ship the wrong architecture's binaries.`)],
        ],
      },
    ],
  },

  {
    title: "Explaining BM25 to the team",
    t: "2025-06-02T13:20:00Z",
    msgs: [
      ["h", C(`I need to explain to non-search people why we are moving off "count the matching words"
        |to BM25. What is the shortest honest explanation?`)],
      ["a", C(`Three ideas, in order.

        |Rare words matter more. If someone searches "postgres vacuum", almost every document contains
        |"postgres" and very few contain "vacuum". A hit on "vacuum" tells you much more. That is the
        |IDF term: the weight of a word goes up as the number of documents containing it goes down.

        |Repetition has diminishing returns. A document that says "vacuum" 40 times is not 40 times more
        |relevant than one that says it twice. BM25 saturates: the contribution of term frequency
        |flattens out, controlled by a parameter usually called k1.

        |Long documents get a handicap. A 10,000 word page will contain your term by accident. BM25
        |divides by document length relative to the average, controlled by b.

        |Put together, the score for one term in one document is:

        |\`\`\`
        |idf(t) * ( tf * (k1 + 1) ) / ( tf + k1 * (1 - b + b * len/avglen) )
        |\`\`\`

        |and the document score is the sum over query terms.`)],
      ["h", "What do we set k1 and b to?"],
      ["a", C(`Start at k1 = 1.2 and b = 0.75. Those are the values from the original TREC work and they
        |are a reasonable default for prose.

        |Raise k1 toward 2.0 if your documents are long and repetition really does signal relevance.
        |Lower b toward 0.3 if your documents vary enormously in length for reasons unrelated to
        |relevance, which is common when a "document" is a chat message: a two word message and a
        |two thousand word message can be equally on topic.

        |Do not tune both at once, and do not tune at all until you have a set of queries with known
        |good answers to tune against. Without that you are just moving numbers around.`)],
    ],
  },

  {
    title: "Parsing 200 MB of JSON without freezing the tab",
    t: "2025-07-14T19:02:00Z",
    msgs: [
      ["h", C(`A user drops a 200 MB JSON file into my web app and the tab locks up for 30 seconds.
        |JSON.parse is synchronous. What are my options?`)],
      ["a", C(`Move it off the main thread and stop parsing it as one document.

        |A Web Worker fixes the frozen UI but not the memory spike: \`JSON.parse\` on 200 MB still
        |allocates the whole object graph. If the file is an array of records, which most exports are,
        |you can split it at the top level and parse each element separately.

        |\`\`\`js
        |// inside the worker
        |async function* topLevelArrayItems(stream) {
        |  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
        |  let buf = "", depth = 0, start = -1, inStr = false, esc = false;
        |  for (;;) {
        |    const { value, done } = await reader.read();
        |    if (done) break;
        |    buf += value;
        |    for (let i = 0; i < buf.length; i++) {
        |      const ch = buf[i];
        |      if (inStr) {
        |        if (esc) esc = false;
        |        else if (ch === "\\\\") esc = true;
        |        else if (ch === '"') inStr = false;
        |        continue;
        |      }
        |      if (ch === '"') { inStr = true; continue; }
        |      if (ch === "{" || ch === "[") { if (depth === 1 && start < 0) start = i; depth++; }
        |      else if (ch === "}" || ch === "]") {
        |        depth--;
        |        if (depth === 1 && start >= 0) { yield JSON.parse(buf.slice(start, i + 1)); start = -1; }
        |      }
        |    }
        |    // keep only the unconsumed tail
        |    buf = start >= 0 ? buf.slice(start) : "";
        |    if (start >= 0) start = 0;
        |  }
        |}
        |\`\`\`

        |Now peak memory is one record, not the whole file, and you can post progress after every
        |chunk.`)],
      ["h", "How do I report progress in bytes when I only have the decoded string?"],
      ["a", C(`Count before decoding. Put the byte counter on the raw stream, upstream of the text
        |decoder:

        |\`\`\`js
        |let seen = 0;
        |const counted = file.stream().pipeThrough(new TransformStream({
        |  transform(chunk, controller) {
        |    seen += chunk.byteLength;
        |    if (seen % (1 << 20) < chunk.byteLength) postMessage({ type: "progress", seen, total: file.size });
        |    controller.enqueue(chunk);
        |  },
        |}));
        |\`\`\`

        |That gives you a real byte percentage rather than a made-up animation, which matters: users
        |can tell the difference between a progress bar that reflects work and one that does not.`)],
    ],
  },

  {
    title: "Recovering commits after a bad rebase",
    t: "2024-10-21T17:26:00Z",
    msgs: [
      ["h", "I rebased onto the wrong branch and force pushed. Three days of commits are gone. Are they?"],
      ["a", C(`Almost certainly not. Git does not delete anything for at least 30 days by default.

        |\`\`\`sh
        |git reflog --date=iso
        |\`\`\`

        |Scroll to the entry just before the rebase started. It will look like
        |\`abc1234 HEAD@{18}: rebase (start): checkout origin/main\`. The commit immediately before that
        |is your branch as it was.

        |\`\`\`sh
        |git branch rescue abc1234
        |git log --oneline rescue
        |\`\`\`

        |Verify it looks right before you touch anything else, then reset your branch to it.`)],
      ["h", "The reflog on my machine only goes back to this morning. I cloned fresh yesterday."],
      ["a", C(`Then check the remote. A force push does not immediately delete the old objects on the
        |server either. If it is GitHub, the events API still lists the previous head SHA:

        |\`\`\`sh
        |gh api repos/:owner/:repo/events --jq '.[] | select(.type=="PushEvent") | [.created_at, .payload.before, .payload.head] | @tsv'
        |\`\`\`

        |Take the \`before\` SHA from the push that overwrote your work and fetch it directly:

        |\`\`\`sh
        |git fetch origin abc1234
        |git branch rescue FETCH_HEAD
        |\`\`\`

        |If a colleague still has the branch checked out, their reflog is another copy. Ask before you
        |start doing anything clever, because the cheapest recovery is usually someone else's laptop.`)],
      ["h", "How do I make this less scary next time?"],
      ["a", C(`Use \`--force-with-lease\` instead of \`--force\`. It refuses the push if the remote moved
        |since you last fetched, which is exactly the case where you are about to destroy someone
        |else's work or your own. Configure it as the default:

        |\`\`\`sh
        |git config --global alias.pushf 'push --force-with-lease'
        |\`\`\`

        |And on the server side, enable branch protection on anything shared. \`--force-with-lease\`
        |protects against a stale local view; branch protection protects against a confident one.`)],
    ],
  },

  {
    title: "Terraform module layout for three environments",
    t: "2025-01-08T09:15:00Z",
    msgs: [
      ["h", C(`We have dev, staging and prod. Right now it is three copied directories that have drifted.
        |What is the layout that does not drift?`)],
      ["a", C(`One module, three thin roots that only supply variables. The rule is that no resource is
        |ever declared in an environment directory.

        |\`\`\`
        |modules/
        |  service/          main.tf variables.tf outputs.tf
        |  network/
        |envs/
        |  dev/              main.tf (module calls only) terraform.tfvars backend.tf
        |  staging/
        |  prod/
        |\`\`\`

        |Each \`envs/*/main.tf\` is a handful of module blocks. If you find yourself writing an
        |\`aws_instance\` in \`envs/prod\`, that is the drift starting. Move it into a module and pass a
        |variable.`)],
      ["h", "What about differences that only exist in prod, like a read replica?"],
      ["a", C(`Make it a variable with a default of zero, not a separate module.

        |\`\`\`hcl
        |variable "replica_count" {
        |  type    = number
        |  default = 0
        |}

        |resource "aws_db_instance" "replica" {
        |  count               = var.replica_count
        |  replicate_source_db = aws_db_instance.primary.identifier
        |  instance_class      = var.replica_instance_class
        |}
        |\`\`\`

        |Now dev and prod run the same code path and the difference is one number in a tfvars file. The
        |failure mode you are avoiding is a resource that only exists in prod and therefore is only
        |ever tested in prod.`)],
      ["h", "Should the environments share a state file?"],
      ["a", C(`No. Separate state per environment, separate backend configuration, and ideally separate
        |credentials. Shared state means a \`terraform apply\` aimed at dev can lock or damage prod, and
        |a corrupt state file takes out all three at once. The small amount of duplication in three
        |\`backend.tf\` files is the cheapest insurance in the whole setup.`)],
    ],
  },

  {
    title: "SQLite WAL mode and concurrent readers",
    t: "2024-09-17T15:40:00Z",
    msgs: [
      ["h", C(`We are getting SQLITE_BUSY under load. Someone said turn on WAL. What does that actually
        |change?`)],
      ["a", C(`In the default rollback journal mode, a writer takes an exclusive lock on the database
        |file, so readers block while a write is in progress and a writer waits for readers to finish.
        |With write-ahead logging, writes go to a separate \`-wal\` file and readers keep reading the
        |main database at the snapshot they started with. One writer and many readers can proceed at
        |the same time.

        |\`\`\`sql
        |PRAGMA journal_mode = WAL;
        |PRAGMA synchronous = NORMAL;
        |PRAGMA busy_timeout = 5000;
        |\`\`\`

        |\`journal_mode\` is persistent, you set it once per database. The other two are per connection
        |and need to be set on every connection you open.`)],
      ["h", "What does it not fix?"],
      ["a", C(`Writer against writer. WAL still allows exactly one writer at a time, so if your BUSY
        |errors come from two processes writing concurrently, WAL will not help and \`busy_timeout\`
        |just converts an immediate error into a slow one.

        |It also does not work over most network filesystems, because WAL uses shared memory for the
        |index. And the \`-wal\` file grows until a checkpoint runs. Under continuous read traffic a
        |checkpoint can be starved and the file can grow without bound, which surprises people. Watch
        |the file size, and if it grows, run \`PRAGMA wal_checkpoint(TRUNCATE)\` on a schedule during a
        |quiet moment.`)],
    ],
  },

  {
    title: "Intermittent 502s from the ingress",
    t: "2025-02-27T11:47:00Z",
    msgs: [
      ["h", C(`About one request in 500 gets a 502 from our nginx ingress. The pods look healthy, no
        |restarts, no OOM. Application logs show nothing for those requests.`)],
      ["a", C(`No application log for the failed request is the clue: nginx never got a usable response,
        |which usually means the upstream connection was closed underneath it. The classic cause is a
        |keepalive timeout mismatch.

        |nginx holds an idle connection to your pod. Your application's server closes that connection
        |at its own idle timeout. If the application's timeout is shorter than nginx's, there is a
        |window where nginx sends a request down a connection the application has just closed, and you
        |get a 502.

        |Node's default \`server.keepAliveTimeout\` is 5 seconds. nginx upstream keepalive defaults are
        |typically 60. Raise the application above the proxy:

        |\`\`\`js
        |const server = app.listen(8080);
        |server.keepAliveTimeout = 75_000;
        |server.headersTimeout = 80_000;  // must exceed keepAliveTimeout
        |\`\`\``)],
      ["h", "That helped a lot but it is not zero. What else?"],
      ["a", C(`Pod termination. When Kubernetes deletes a pod it sends SIGTERM and removes the pod from
        |the endpoints list at the same time, but those two things propagate independently. The ingress
        |controller may still be routing to a pod that has already started shutting down.

        |The fix is a \`preStop\` sleep that outlives endpoint propagation:

        |\`\`\`yaml
        |lifecycle:
        |  preStop:
        |    exec:
        |      command: ["sh", "-c", "sleep 10"]
        |terminationGracePeriodSeconds: 40
        |\`\`\`

        |The container keeps serving during that sleep. It only starts its own graceful shutdown after,
        |by which time no new traffic is being sent to it. Combined with the keepalive fix, that
        |usually takes intermittent 502s to actual zero during rollouts.`)],
    ],
  },

  {
    title: "Writing a changelog people actually read",
    t: "2024-08-29T14:33:00Z",
    msgs: [
      ["h", C(`Our changelog is auto-generated from commit messages and nobody reads it. Should I write
        |it by hand instead?`)],
      ["a", C(`Write it by hand, but keep the generated list as your source material rather than your
        |output. The two documents have different jobs. The generated list answers "what commits landed";
        |a changelog answers "what changed for me".

        |The shape that works:

        |Group by what the reader can now do, not by commit type. "Search now understands quoted
        |phrases" is a heading. "feat(search): add phrase parser" is not.

        |Lead with the breaking changes and put the migration inline. A reader who has to click through
        |to a migration guide will do the upgrade blind and file a bug.

        |Say what a fix means for someone who hit it. "Fixed a crash when importing files over 2 GB"
        |beats "fix: off-by-one in chunk offset".

        |Skip anything the reader cannot observe. Internal refactors, dependency bumps with no behaviour
        |change, and CI changes belong in the commit log, not the changelog.`)],
      ["h", "How long should an entry be?"],
      ["a", C(`One line per change for most things, one short paragraph for anything that changes a
        |default or removes a capability. If an entry needs more than a paragraph it is a blog post and
        |the changelog should link to it.

        |A useful test: read the whole release entry out loud. If you run out of breath before you run
        |out of entries, either the release was too big or the entries are too wordy.`)],
    ],
  },

  {
    title: "TypeScript generic keeps widening to string",
    t: "2025-03-19T10:08:00Z",
    msgs: [
      ["h", C(`I want the return type to be narrowed to the literal keys, but it always comes back as
        |\`string\`:

        |\`\`\`ts
        |function keysOf<T>(obj: T): (keyof T)[] {
        |  return Object.keys(obj) as (keyof T)[];
        |}
        |const k = keysOf({ a: 1, b: 2 });  // want "a" | "b"
        |\`\`\``)],
      ["a", C(`That one actually works. \`keysOf({a: 1, b: 2})\` gives \`("a" | "b")[]\`. If you are seeing
        |\`string[]\`, the object is coming from somewhere that already widened it, most often a
        |variable declared with \`let\` or an explicit \`Record<string, number>\` annotation.

        |\`\`\`ts
        |const wide: Record<string, number> = { a: 1, b: 2 };
        |keysOf(wide);              // string[], correctly

        |const narrow = { a: 1, b: 2 } as const;
        |keysOf(narrow);            // ("a" | "b")[]
        |\`\`\`

        |The generic is doing its job. The information was lost before it got there.`)],
      ["h", "It comes from a function parameter. How do I keep the literal types across a call boundary?"],
      ["a", C(`Constrain the parameter so inference has a reason to stay narrow. A bare \`T\` infers the
        |widened type; \`T extends Record<string, unknown>\` still widens; what you want is to make the
        |key type its own inference site.

        |\`\`\`ts
        |function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
        |  const out = {} as Pick<T, K>;
        |  for (const k of keys) out[k] = obj[k];
        |  return out;
        |}

        |pick({ a: 1, b: "x", c: true }, ["a", "c"]);  // { a: number; c: boolean }
        |\`\`\`

        |\`readonly K[]\` matters: with a mutable \`K[]\` TypeScript will happily infer \`K\` as
        |\`"a" | "c"\` too, but array literals passed to a mutable array parameter widen more eagerly in
        |some positions. The readonly form is the reliable one.`)],
    ],
    branches: [
      {
        at: 1,
        alt: [
          ["a", C(`Before reaching for generics, check whether you want \`Object.keys\` at all. Its
            |signature returning \`string[]\` is deliberate and correct, not a TypeScript bug.

            |TypeScript's object types are open: a value of type \`{a: number}\` may legitimately have
            |extra properties at runtime, because of structural typing. So \`Object.keys\` genuinely can
            |return keys that are not in \`keyof T\`:

            |\`\`\`ts
            |interface Point { x: number; y: number }
            |const p3 = { x: 1, y: 2, z: 3 };
            |const p: Point = p3;
            |Object.keys(p);  // ["x","y","z"] at runtime
            |\`\`\`

            |If you cast to \`(keyof T)[]\` you are asserting something the type system cannot check. That
            |is often fine for objects you constructed yourself, and a real bug for objects that crossed
            |an API boundary. Decide which case you are in before adding the cast.`)],
          ["h", "It is a config object I define in the same file. So the cast is safe?"],
          ["a", C(`Yes, and you can make it safe by construction rather than by assertion. Define the
            |keys once as the source of truth and derive the object type from them:

            |\`\`\`ts
            |const FIELDS = ["title", "createdAt", "source"] as const;
            |type Field = (typeof FIELDS)[number];      // "title" | "createdAt" | "source"
            |type Config = { [K in Field]: string };

            |const config: Config = { title: "t", createdAt: "c", source: "s" };
            |for (const f of FIELDS) console.log(config[f]);   // f is Field, no cast
            |\`\`\`

            |Now adding a field to \`FIELDS\` is a compile error everywhere it needs to be handled, which
            |is the property you actually wanted.`)],
        ],
      },
    ],
  },

  {
    title: "Measuring p99 latency without lying to ourselves",
    t: "2025-04-02T13:55:00Z",
    msgs: [
      ["h", C(`Our dashboard averages the p99 from each of 12 instances into one number. Someone said
        |that is wrong. Why?`)],
      ["a", C(`Because percentiles do not average. The mean of twelve p99 values is not the p99 of the
        |combined population, and it is usually much lower, which is the dangerous direction to be
        |wrong in.

        |A simple case: eleven instances are idle with a p99 of 5ms, one instance is stuck with a p99 of
        |4000ms. The average of the twelve p99s is about 338ms. The true p99 across all requests depends
        |on how many requests each instance served, and if the stuck instance is stuck because it is
        |receiving all the slow requests, the true p99 could be far worse than 338.

        |What you want is to aggregate the underlying histograms, not the summarised percentiles.
        |Prometheus histograms do this correctly:

        |\`\`\`
        |histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
        |\`\`\`

        |Note the \`sum by (le)\` inside the quantile, not outside.`)],
      ["h", "Our client library exports a summary, not a histogram. Is that fixable?"],
      ["a", C(`It is, and you should fix it. Summaries compute quantiles on each instance and export the
        |result, which is exactly the un-aggregatable thing. Histograms export bucket counts, which add.
        |The cost is that you have to pick bucket boundaries up front and your quantile is an
        |interpolation within a bucket rather than an exact value.

        |Pick buckets that bracket your SLO. If your target is 300ms, having buckets at 250, 300 and 400
        |tells you something useful; the default buckets in most libraries top out around 10 seconds
        |with nothing between 1 and 2.5, which makes p99 estimates in that range close to fiction.`)],
      ["h", "How many requests do we need before p99 means anything?"],
      ["a", C(`At least a few hundred in the window, and preferably a few thousand. p99 over 50 requests
        |is the maximum of the slowest one or two, which is noise. A useful discipline is to display the
        |request count next to the percentile on the dashboard. When the count drops, everyone can see
        |that the percentile got noisier rather than the service getting faster.`)],
    ],
  },

  {
    title: "Replacing moment.js with the platform",
    t: "2024-11-12T16:20:00Z",
    msgs: [
      ["h", C(`We ship 290 KB of moment plus locale data for what amounts to formatting dates and adding
        |days. What do we replace it with?`)],
      ["a", C(`For formatting, nothing: \`Intl.DateTimeFormat\` is built in and better at it than moment
        |ever was, because it uses the platform's locale data rather than shipping its own.

        |\`\`\`js
        |const fmt = new Intl.DateTimeFormat("en-GB", {
        |  day: "numeric", month: "short", year: "numeric",
        |});
        |fmt.format(new Date());   // "12 Nov 2024"
        |\`\`\`

        |Construct the formatter once and reuse it. Creating one per call is measurably slow in a list.

        |For relative times, \`Intl.RelativeTimeFormat\` covers "3 days ago" without a library.`)],
      ["h", "What about arithmetic and time zones? That is the part I am worried about."],
      ["a", C(`That is the part where the platform genuinely was missing something until recently.
        |\`Temporal\` is the answer and it is now available in current browsers, though you should check
        |your support matrix before relying on it.

        |\`\`\`js
        |const start = Temporal.PlainDate.from("2024-11-12");
        |const end = start.add({ days: 45 });
        |end.toString();  // "2024-12-27"

        |const meeting = Temporal.ZonedDateTime.from({
        |  timeZone: "Europe/Lisbon", year: 2024, month: 11, day: 12, hour: 9,
        |});
        |meeting.withTimeZone("Asia/Taipei").toString();
        |\`\`\`

        |The important difference from \`Date\` is that \`PlainDate\` has no time zone at all, which is
        |what you want for a birthday or a due date. Half of all date bugs come from storing a calendar
        |date as an instant and then rendering it in a different zone.`)],
      ["h", "Migration strategy? We have moment in about 200 files."],
      ["a", C(`Do not do it in one pass. Write a thin \`dates.js\` module that exports the six or seven
        |operations you actually use, implement it with moment, and migrate call sites to it. That is a
        |mechanical change you can review quickly.

        |Then swap the implementation inside \`dates.js\` once. Your test suite covers seven functions
        |rather than 200 call sites, and if something is wrong you revert one file. The intermediate
        |state is shippable at every point, which is the property that makes large migrations finish.`)],
    ],
  },

  {
    title: "Full text search that runs entirely in the browser",
    t: "2025-05-21T20:11:00Z",
    msgs: [
      ["h", C(`I want search over about 30,000 documents with no server. Is an inverted index in
        |JavaScript realistic or should I just use substring matching?`)],
      ["a", C(`Entirely realistic, and substring matching will disappoint you fast: no ranking, no
        |stemming, no phrase handling, and \`indexOf\` across 30,000 documents on every keystroke is
        |slower than a proper index lookup.

        |The core structure is a map from term to a posting list:

        |\`\`\`js
        |// term -> { docs: Int32Array, tfs: Uint16Array, pos: Int32Array, off: Int32Array }
        |\`\`\`

        |Build it with plain arrays while ingesting, then seal into typed arrays once. Typed arrays cut
        |memory by roughly a factor of four against arrays of numbers and, more importantly, keep the
        |data in one contiguous allocation instead of 30,000 small ones, which is what actually makes
        |the GC pauses go away.`)],
      ["h", "Do I need positions? They look expensive."],
      ["a", C(`Only if you want phrase search, and you probably do. Positions roughly double index size.
        |Two things make that affordable:

        |Delta encode. Positions within a document are ascending, so store the gaps. Most gaps are small
        |and compress well even in a fixed-width array because the values are small.

        |Cap them. Store positions only for the first few hundred occurrences in a document. Phrase
        |matches beyond that point almost never change the ranking and you keep a worst-case bound on
        |memory.

        |What you must not do is fake phrase search by requiring all terms to be present. That silently
        |returns wrong results and users cannot tell, which is worse than not having the feature.`)],
      ["h", "How long should indexing 30,000 documents take?"],
      ["a", C(`On a laptop, a few seconds in a worker if your tokeniser is a single regex pass and you
        |avoid allocating a string per token where you can. The thing that will dominate is not the
        |index, it is whatever you do per document before tokenising. Normalising with a chain of
        |\`.replace()\` calls, for instance, allocates several copies of every document. One pass with
        |a well-written regex and a lowercase call is usually enough.`)],
    ],
  },

  {
    title: "What breaks when you rotate refresh tokens",
    t: "2025-06-19T09:37:00Z",
    msgs: [
      ["h", C(`We are turning on refresh token rotation. What should I expect to break?`)],
      ["a", C(`Concurrency, almost immediately. With rotation, using a refresh token invalidates it and
        |returns a new one. If two requests in the same client both notice an expired access token at
        |the same moment, both will try to refresh. One wins, the other presents a token that has just
        |been invalidated, and if you have reuse detection enabled that second attempt looks like a
        |stolen token and you revoke the whole family. The user gets logged out for no reason.

        |The fix is a single-flight refresh in the client:

        |\`\`\`js
        |let inFlight = null;
        |function refresh() {
        |  if (!inFlight) {
        |    inFlight = doRefresh().finally(() => { inFlight = null; });
        |  }
        |  return inFlight;
        |}
        |\`\`\`

        |Every caller awaits the same promise, so only one network refresh happens.`)],
      ["h", "What about two browser tabs? They have separate JavaScript contexts."],
      ["a", C(`That is the second thing that breaks, and the in-memory guard does not help. Options, in
        |order of how much work they are:

        |Store the tokens where all tabs share them and coordinate with a lock. \`navigator.locks\` is
        |built for exactly this:

        |\`\`\`js
        |await navigator.locks.request("token-refresh", async () => {
        |  const current = await readTokens();
        |  if (!isExpired(current.access)) return;   // another tab already refreshed
        |  await doRefresh(current.refresh);
        |});
        |\`\`\`

        |Or move the refresh into a shared worker or service worker so there is one refresher by
        |construction.

        |Or keep the refresh token in an HttpOnly cookie and let the server handle rotation, accepting
        |the previous token for a short grace window. A 10 to 30 second grace period removes almost all
        |of the false positives while keeping reuse detection meaningful.`)],
    ],
  },


  {
    title: "Cutting cold starts on a serverless API",
    t: "2024-12-18T18:49:00Z",
    msgs: [
      ["h", C(`Our p99 is fine but p99.9 is 4 seconds, and it is all cold starts. Provisioned concurrency
        |costs more than the whole function does. Other options?`)],
      ["a", C(`Attack the two halves separately: the platform's time to give you a container, and your
        |code's time to become ready. You only control the second, and in most Node and Python functions
        |it is the larger half.

        |Measure it first. Log a timestamp at module load and another in the handler on the first
        |invocation. If module load is 1.8 seconds, that is where the work is.

        |The usual causes, in order of how often I see them: importing an entire SDK when you use one
        |client from it, initialising a database connection pool at module scope for a function that
        |often does not touch the database, and loading a config file synchronously from disk or, worse,
        |from a remote secrets store.

        |\`\`\`js
        |// eager: paid on every cold start
        |import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
        |const db = new DynamoDBClient({});

        |// lazy: paid only when actually used
        |let db;
        |const getDb = async () => (db ??= new (await import("@aws-sdk/client-dynamodb")).DynamoDBClient({}));
        |\`\`\``)],
      ["h", "Does bundling help or is that a myth?"],
      ["a", C(`It helps, and it is measurable. A single bundled file avoids thousands of filesystem stats
        |and module resolutions. Going from a \`node_modules\` tree to one esbuild output routinely takes
        |several hundred milliseconds off module load. Tree shaking on top of that reduces what gets
        |parsed at all.

        |What is closer to a myth is that shrinking the deployment package from 40 MB to 10 MB helps
        |much on its own. Download is usually not the bottleneck; parsing and executing your top-level
        |code is.`)],
    ],
  },

  {
    title: "Designing a URL shortener in an interview",
    t: "2024-10-02T19:15:00Z",
    msgs: [
      ["h", C(`I got asked to design a URL shortener and I jumped straight to hashing. The feedback was
        |that I did not ask enough questions. What should I have asked?`)],
      ["a", C(`Four questions change the design materially, and each has a wrong answer that invalidates
        |a hashing approach:

        |Are short codes allowed to be guessable? If someone can enumerate them, sequential IDs are out
        |and you need randomness with enough entropy to make scanning impractical.

        |Can the same long URL map to two different short codes? If yes, you do not need deduplication
        |and the design gets much simpler. If no, you need a lookup by long URL, which is a second index
        |on a very high cardinality column.

        |Do links expire, and can they be edited or deleted? Expiry turns a write-once store into
        |something that needs a cleanup path and changes your cache invalidation story completely.

        |What is the read to write ratio? At 1000:1 the entire design is a cache design and the database
        |is almost an implementation detail.`)],
      ["h", "Assume unguessable, no dedup, no expiry, 1000:1 reads. What is the shape?"],
      ["a", C(`Generate 64 random bits, base62 encode to 11 characters, insert with a uniqueness
        |constraint and retry on the rare collision. No coordination, no counter, no ID service. At 64
        |bits you can store a trillion links before collision probability becomes interesting, and the
        |retry loop handles it anyway.

        |Reads are a key-value lookup, so put a cache in front and serve a 301 or 302 from it. Choose
        |deliberately: 301 is cached by the browser forever, which makes your click analytics wrong and
        |makes a deleted link keep working; 302 keeps every click coming to you. Most shorteners use 302
        |for exactly that reason, and being able to say why is most of what the question is testing.`)],
    ],
  },

  {
    title: "Making a CLI feel fast",
    t: "2025-07-01T08:24:00Z",
    msgs: [
      ["h", C(`People say our CLI feels sluggish but the actual command takes 300ms. That should feel
        |instant. What are we doing wrong?`)],
      ["a", C(`Probably spending most of that before the command starts. Time these separately:

        |\`\`\`sh
        |time mycli --version        # startup only
        |time mycli do-the-thing     # startup plus work
        |\`\`\`

        |If \`--version\` takes 250ms, you have a startup problem, not a work problem. In Node, that is
        |almost always top-level imports: a full argument parser, a colour library, an update checker
        |that hits the network, and the SDK for every subcommand loaded whether or not it is used.

        |Load subcommand modules lazily, and never do a network call before you have printed something.`)],
      ["h", "We do have an update check on startup. It is async though."],
      ["a", C(`Async does not save you if you await it, and it does not save you if the process cannot
        |exit until it settles. An update check should run in a detached background process that writes
        |a file, and the next invocation reads that file. That way the check costs one file read on the
        |fast path.

        |The other half of "feels fast" is not speed at all, it is feedback. Print the first line of
        |output within about 100ms even if it is just the operation name. A CLI that prints nothing for
        |300ms and then dumps everything feels slower than one that prints a heading at 30ms and fills
        |in the rest. Flush as you go rather than buffering the whole result.`)],
      ["h", "Does colour and spinner output cost anything measurable?"],
      ["a", C(`Spinners do, if you redraw them at 60 frames a second over an SSH connection: you are
        |sending escape sequences down a high latency link and it can genuinely slow the command. 10
        |frames a second is plenty. And check \`isTTY\` before drawing anything; a spinner written into
        |a log file or a CI pipeline is thousands of lines of garbage that someone will eventually have
        |to grep through.`)],
    ],
  },

  {
    title: "WebSocket reconnect loop is hammering the server",
    t: "2025-08-08T22:05:00Z",
    msgs: [
      ["h", C(`When our WebSocket server restarts, every client reconnects immediately and it falls over
        |again. We reconnect after 1 second. How do I stop the stampede?`)],
      ["a", C(`Same collision problem as HTTP retries, worse because every client noticed the disconnect
        |at the same instant. You need exponential backoff with jitter, and you need to reset the
        |backoff only after the connection has been stable for a while.

        |\`\`\`js
        |let attempt = 0, stableTimer = null;

        |function connect() {
        |  const ws = new WebSocket(url);

        |  ws.addEventListener("open", () => {
        |    stableTimer = setTimeout(() => { attempt = 0; }, 10_000);
        |  });

        |  ws.addEventListener("close", () => {
        |    clearTimeout(stableTimer);
        |    const ceiling = Math.min(30_000, 500 * 2 ** attempt);
        |    attempt++;
        |    setTimeout(connect, ceiling / 2 + Math.random() * (ceiling / 2));
        |  });
        |}
        |\`\`\`

        |The 10 second stability timer is the part people leave out. Without it, a server that accepts
        |the connection and drops it a moment later resets your backoff to zero on every cycle and you
        |are back to a tight loop.`)],
      ["h", "Should I stop reconnecting when the tab is hidden?"],
      ["a", C(`Pause, yes; give up, no. Listen for \`visibilitychange\`: when the document is hidden,
        |stop scheduling reconnects, and when it becomes visible, attempt one immediately. Browsers
        |already throttle timers in background tabs, which turns your carefully tuned backoff into
        |something unpredictable, so it is better to take explicit control.

        |Also handle \`navigator.onLine\`. There is no point burning backoff attempts while the machine
        |has no network at all. Reset the attempt counter on the \`online\` event and connect right
        |away, because in that case the disconnect was never the server's fault.`)],
    ],
  },


  {
    title: "Why my virtualised list jumps when scrolling up",
    t: "2025-08-14T10:41:00Z",
    msgs: [
      ["h", C(`My virtual list is smooth scrolling down and jumps around scrolling up. Rows have variable
        |height and I estimate them until they are measured.`)],
      ["a", C(`Classic. When you scroll up into unmeasured rows, you replace an estimate with a real
        |height, the total content above the viewport changes, and the browser keeps \`scrollTop\` fixed,
        |so the content appears to jump.

        |The fix is scroll anchoring done by hand: after applying new measurements, compute how much the
        |offset of your anchor row changed and add that to \`scrollTop\` in the same frame.

        |\`\`\`js
        |const anchorIndex = firstVisibleIndex;
        |const before = offsetOf(anchorIndex);
        |applyMeasurements(newHeights);
        |const after = offsetOf(anchorIndex);
        |container.scrollTop += after - before;
        |\`\`\`

        |Do it synchronously, before paint. If you do it in a \`setTimeout\` the user sees the jump and
        |then sees the correction, which is worse than the jump alone.`)],
      ["h", "Should I measure with ResizeObserver or getBoundingClientRect?"],
      ["a", C(`\`ResizeObserver\` for ongoing changes, \`getBoundingClientRect\` for the initial measure
        |right after you render a row. Reading \`getBoundingClientRect\` in a loop over freshly inserted
        |rows is a single layout flush if you read all of them before writing anything, and a layout
        |thrash if you interleave reads and writes. Batch the reads, then batch the writes.

        |Also cache measurements by a stable row key rather than by index. If the list re-sorts, an
        |index-keyed cache gives every row the wrong height at once, which is the same jump but
        |everywhere.`)],
      ["h", "Any way to avoid variable heights entirely?"],
      ["a", C(`Sometimes, and it is worth considering. If the variability comes from text wrapping, you
        |can often clamp to a fixed number of lines and get a fixed row height, which makes the whole
        |problem disappear. A list of 30,000 items where every row is exactly 92px needs no measurement,
        |no observer, and no anchoring: the offset of row n is n times 92.

        |Reach for variable heights when the content genuinely varies in kind, like chat messages. For a
        |list of titles with metadata, fixed height is not a compromise, it is the better design.`)],
    ],
  },
];
