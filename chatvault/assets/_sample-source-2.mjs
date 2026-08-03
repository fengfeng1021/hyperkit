/* Second half of the authoring source for assets/sample-vault.json.
   Split only so that each file stays readable. Not loaded by the site. */

const C = (s) => s.replace(/\n\s*\|/g, "\n").trim();

export const CONVERSATIONS_2 = [
  {
    title: "Connection pool exhausted under normal traffic",
    t: "2025-03-27T11:02:00Z",
    msgs: [
      ["h", C(`Our Postgres connection pool is set to 20 and we run out of connections at maybe 60
        |requests per second. Each query takes about 8 milliseconds. That maths does not work out.`)],
      ["a", C(`It does not, which means the connections are not being held for 8 milliseconds. Something
        |is checking out a connection and holding it across work that is not a query.

        |The usual culprit is a transaction wrapped around an HTTP call, or an ORM that opens a
        |transaction at the start of a request and commits at the end whether or not the request touches
        |the database. Little's Law gives you the check: at 60 requests per second with 20 connections,
        |your average hold time must be under 333 milliseconds. Log it and see.

        |\`\`\`sql
        |SELECT state, count(*), max(now() - state_change) AS longest
        |FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;
        |\`\`\`

        |If you see a pile in "idle in transaction", that is your answer.`)],
      ["h", "There are 14 in idle in transaction. Where do I look in the application?"],
      ["a", C(`Anywhere that opens a transaction and then awaits something that is not a query. Look for
        |a request middleware that begins a transaction, for a retry loop inside a transaction, and for a
        |cache lookup that falls through to a network call while a transaction is open.

        |Two defences worth adding regardless of what you find. Set
        |\`idle_in_transaction_session_timeout\` on the database so a leaked transaction cannot hold a
        |connection forever. And set a pool checkout timeout in the application so the failure mode is a
        |fast error with a stack trace rather than a slow queue that eventually times out at the load
        |balancer with no useful information.`)],
    ],
  },

  {
    title: "Cache invalidation for a read-heavy API",
    t: "2025-04-09T14:26:00Z",
    msgs: [
      ["h", C(`We cache API responses in Redis with a 5 minute expiry. When the entry expires on a
        |popular key we get a burst of identical database queries. Is there a standard fix?`)],
      ["a", C(`Yes, two of them, and they solve different halves.

        |For the burst itself, single-flight the recomputation. The first request to find the key missing
        |takes a short lock, recomputes, and writes; everyone else waits for that one result instead of
        |each running the same query.

        |\`\`\`js
        |async function cached(key, ttl, compute) {
        |  const hit = await redis.get(key);
        |  if (hit) return JSON.parse(hit);
        |  const lock = await redis.set(\`lock:\${key}\`, "1", "NX", "PX", 5000);
        |  if (!lock) { await sleep(40); return cached(key, ttl, compute); }
        |  try {
        |    const value = await compute();
        |    await redis.set(key, JSON.stringify(value), "PX", ttl);
        |    return value;
        |  } finally { await redis.del(\`lock:\${key}\`); }
        |}
        |\`\`\`

        |For the synchronised expiry across many keys, add jitter to the expiry so a thousand keys
        |written in the same second do not expire in the same second.`)],
      ["h", "What about serving the stale value while the new one is computed?"],
      ["a", C(`That is the better answer when your data tolerates it. Store the value with a longer real
        |expiry and a separate "fresh until" timestamp inside the payload. On a read past that timestamp,
        |return the stale value immediately and start a background refresh.

        |Latency stops depending on your database at all, and a slow query no longer becomes a slow
        |request. The cost is that you must be able to say how stale is acceptable for each key, which is
        |a product decision and not an infrastructure one. If nobody can answer that question, keep the
        |single-flight lock and leave it there.`)],
    ],
  },

  {
    title: "React re-renders the whole list on every keystroke",
    t: "2025-02-04T10:18:00Z",
    msgs: [
      ["h", C(`I have a search input above a list of 2,000 rows. Typing is laggy. I already memoised the
        |row component and it did not help.`)],
      ["a", C(`Memoising the row does not help if the parent passes a new prop identity on every render.
        |A memoised child re-renders when any prop changes by reference, and an inline arrow function or
        |a freshly built object counts as changed every time.

        |\`\`\`jsx
        |// every render creates a new function, so Row re-renders even though it is memoised
        |{rows.map((r) => <Row key={r.id} row={r} onPick={() => pick(r.id)} />)}

        |// stable: one callback for the whole list, the id comes from the row
        |const onPick = useCallback((id) => pick(id), [pick]);
        |{rows.map((r) => <Row key={r.id} row={r} onPick={onPick} />)}
        |\`\`\`

        |Check with the profiler before and after. If Row still re-renders, the culprit is another prop.`)],
      ["h", "It is better but still slow at 2,000 rows. Is virtual scrolling the next step?"],
      ["a", C(`Yes, and at 2,000 rows it is the real answer rather than an optimisation. No amount of
        |memoisation makes 2,000 DOM subtrees cheap to keep in the document; the browser still pays for
        |layout and paint over all of them.

        |Render only what fits the viewport plus a small overscan. If every row is the same height the
        |maths is trivial: the row at index n sits at n times the row height, and you keep perhaps 25
        |nodes alive whether the list holds 2,000 or 200,000.

        |One thing to keep: the input's own state should not live in the same component as the list, or
        |every keystroke re-renders the list container even when the rows are cheap. Lift the query into
        |a store, or split the input into its own component that publishes the debounced value.`)],
    ],
  },

  {
    title: "useEffect fires twice in development",
    t: "2024-11-05T09:44:00Z",
    msgs: [
      ["h", "My data fetch in useEffect runs twice on mount, but only in development. Is this a bug?"],
      ["a", C(`It is deliberate. React's StrictMode mounts, unmounts and remounts every component in
        |development specifically to surface effects that are not safe to run twice. In production the
        |effect runs once.

        |The right response is not to switch StrictMode off. It is to make the effect idempotent and to
        |clean up after itself:

        |\`\`\`jsx
        |useEffect(() => {
        |  const controller = new AbortController();
        |  fetch(url, { signal: controller.signal })
        |    .then((r) => r.json())
        |    .then(setData)
        |    .catch((e) => { if (e.name !== "AbortError") setError(e); });
        |  return () => controller.abort();
        |}, [url]);
        |\`\`\`

        |With the abort in place, the double invocation is harmless and you have also fixed the real bug
        |it was warning you about: a response arriving after the component has moved on.`)],
      ["h", "Should I be fetching in an effect at all?"],
      ["a", C(`Often not. Effects are for synchronising with something outside React, and a data fetch on
        |mount is usually better handled by the router's loader or by a query library that owns caching,
        |deduplication and revalidation. Hand-rolled fetch-in-effect ends up reimplementing all three,
        |badly, in every component that needs data.

        |Keep the effect when you are wiring up a subscription, a resize observer, or an imperative
        |third-party widget. Those are what it is for.`)],
    ],
  },

  {
    title: "Grid template areas versus explicit line numbers",
    t: "2025-01-30T16:12:00Z",
    msgs: [
      ["h", "Is grid-template-areas worth using, or is it a toy compared to line numbers?"],
      ["a", C(`It is worth using precisely where a layout is a named arrangement rather than a
        |calculation. Areas let a media query restate the whole arrangement in one place:

        |\`\`\`css
        |.page {
        |  display: grid;
        |  grid-template-columns: 244px 372px minmax(0, 1fr);
        |  grid-template-areas: "filters index reader";
        |}
        |@media (max-width: 1119px) {
        |  .page {
        |    grid-template-columns: 300px minmax(0, 1fr);
        |    grid-template-areas: "index reader";
        |  }
        |}
        |\`\`\`

        |Line numbers win when the placement is computed, when items are auto-placed, or when you span a
        |variable number of tracks. Do not mix the two systems in one grid: pick whichever describes the
        |intent and stay with it.`)],
      ["h", "Any gotcha with named areas?"],
      ["a", C(`Two. Every row of the template string must have the same number of columns, and an empty
        |cell is a dot, not a blank. Miss that and the whole declaration is invalid and silently ignored,
        |which is a confusing failure because nothing appears in the console.

        |The other is that a named area implicitly creates line names, so \`grid-column: index\` works.
        |That is useful, and it also means an area name that collides with something else in the grid
        |will do something surprising.`)],
    ],
  },

  {
    title: "Flex item will not shrink below its content",
    t: "2024-10-14T13:07:00Z",
    msgs: [
      ["h", C(`I have a flex row with a long filename in it. Instead of truncating with an ellipsis, the
        |whole row grows and pushes everything else off screen. \`text-overflow: ellipsis\` does nothing.`)],
      ["a", C(`Flex items have \`min-width: auto\` by default, which means they refuse to shrink below
        |their content's intrinsic minimum size. Your ellipsis rule never gets a chance because the box
        |is never narrower than the text.

        |\`\`\`css
        |.row { display: flex; gap: 12px; }
        |.row__name {
        |  min-width: 0;          /* the fix */
        |  overflow: hidden;
        |  text-overflow: ellipsis;
        |  white-space: nowrap;
        |}
        |\`\`\`

        |The same applies to grid, where the equivalent is \`minmax(0, 1fr)\` instead of \`1fr\`.`)],
      ["h", "Why is auto the default if it causes this?"],
      ["a", C(`Because the alternative default breaks the common case. Before that rule existed, flex
        |items would happily shrink a button until its label was clipped, or squash an image to nothing.
        |\`min-width: auto\` says that by default a box is at least as wide as the smallest thing it can
        |sensibly contain, which is right most of the time. Overflow with a deliberate truncation is the
        |exception, and it is the exception you opt into.`)],
    ],
  },

  {
    title: "UUID or bigint for primary keys",
    t: "2025-05-13T09:31:00Z",
    msgs: [
      ["h", C(`New service, Postgres. The team is split between bigint identity columns and UUIDs. What
        |actually matters here?`)],
      ["a", C(`Three things matter, and none of them is taste.

        |Index locality. A random UUID as a primary key means every insert lands in a random page of the
        |B-tree, so the write path touches pages that are not in cache and the index does not compact. A
        |sequential bigint appends. On a write-heavy table that is a measurable difference, not a
        |theoretical one.

        |Enumerability. If ids appear in URLs, a sequential id tells anyone who looks how many customers
        |you have and lets them walk your data when authorisation is weak. That is an argument against
        |bigint in public surfaces, not against bigint as a primary key.

        |Size. 16 bytes against 8, repeated in every foreign key and every index that includes the key.
        |At small scale nobody notices. At a billion rows it is real.`)],
      ["h", "Is there a way to get both?"],
      ["a", C(`Two. Use UUID version 7, which puts a millisecond timestamp in the high bits so values are
        |time-ordered and insert locality comes back while ids stay unguessable enough for URLs.

        |Or keep a bigint primary key for internal joins and add a separate random public id with a
        |unique index, exposed in URLs and APIs. That costs one extra index and gives you both, at the
        |price of remembering which id you are holding at any moment.`)],
    ],
  },

  {
    title: "Renaming a column without downtime",
    t: "2025-06-11T10:55:00Z",
    msgs: [
      ["h", C(`I need to rename \`user_email\` to \`email\` on a table with 30 million rows, in a service
        |that cannot go down. A plain ALTER takes a lock. What is the sequence?`)],
      ["a", C(`Rename itself is cheap in Postgres, it is a catalogue change. The problem is not the lock
        |duration, it is that old and new application code cannot both be right at the same time. So do
        |it as expand and contract, over three deploys.

        |Deploy 1: add the new column, write to both, read from the old one. The write path is now
        |double, the read path is unchanged, and rolling back is free.

        |Backfill in batches with a pause between them, so autovacuum keeps up and replication lag stays
        |flat.

        |\`\`\`sql
        |UPDATE users SET email = user_email
        |WHERE email IS NULL AND id BETWEEN $1 AND $2;
        |\`\`\`

        |Deploy 2: read from the new column, keep writing both. Deploy 3: stop writing the old one, and
        |drop it in a later release once no replica or reporting job still reads it.`)],
      ["h", "What about the lock when adding the column?"],
      ["a", C(`Adding a nullable column with no default is instant in modern Postgres, it only touches
        |the catalogue. Adding one with a constant default is also instant since version 11.

        |What still rewrites the table, and still takes a strong lock, is changing a column type and
        |adding a not-null constraint. For the constraint, add it as \`NOT VALID\` first and then
        |\`VALIDATE CONSTRAINT\` in a separate transaction, which takes a much weaker lock.

        |And set \`lock_timeout\` before any DDL. Without it, one long-running read query can make your
        |ALTER wait, and everything behind the ALTER queues behind that, which is how a catalogue change
        |turns into an outage.`)],
    ],
  },

  {
    title: "Structured logging that is actually greppable",
    t: "2024-09-25T15:48:00Z",
    msgs: [
      ["h", C(`We are moving from printf logging to JSON logs. What should be in every line, and what
        |should never be?`)],
      ["a", C(`Every line: a timestamp in ISO 8601 with a timezone, a level, a stable event name, a
        |request or trace id, and the service name and version. The stable event name is the one people
        |forget, and it is the one that makes a log searchable. \`payment.capture.failed\` can be counted
        |over time; "Failed to capture payment for order 8812" cannot.

        |\`\`\`json
        |{"ts":"2024-09-25T15:48:02.114Z","level":"error","event":"payment.capture.failed",
        | "trace_id":"6f2a91c4","service":"billing","version":"1.42.0",
        | "order_id":8812,"provider":"stripe","attempt":3}
        |\`\`\`

        |Never: anything you would not want in a subpoena. No card numbers, no tokens, no full request
        |bodies, no email addresses unless you decided that deliberately and can defend it.`)],
      ["h", "How much should we log? Disk is cheap but our bill is not."],
      ["a", C(`Log an event at the boundaries and at every decision that would be hard to reconstruct. Do
        |not log inside loops, and do not log both the attempt and the success of a fast operation that
        |succeeds almost always; log the failure and count the successes as a metric.

        |A useful rule: if you would not want to read the line during an incident at three in the
        |morning, it is not a log line, it is a metric or a trace span. Logs are for the narrative,
        |metrics are for the shape, traces are for the path. Sending all three into the log pipeline is
        |how the bill gets away from you.`)],
    ],
  },

  {
    title: "Feature flags without a permanent mess",
    t: "2025-07-22T11:33:00Z",
    msgs: [
      ["h", C(`We have 140 feature flags and nobody knows which are dead. How do we stop this from
        |happening again?`)],
      ["a", C(`Give flags a type, and give each type a lifetime.

        |Release flags exist to decouple deploy from launch. They are temporary by definition and should
        |carry an expiry date at creation. A flag past its date fails the build.

        |Operational flags, such as a kill switch on an expensive feature, are permanent and that is
        |fine. Name them as such and exclude them from the expiry rule.

        |Permission flags are not flags at all, they are authorisation, and they belong in the
        |entitlement system where they can be audited.

        |Most of your 140 are release flags nobody deleted, which is a process problem rather than a
        |tooling one.`)],
      ["h", "How do we find out which of the 140 are still read?"],
      ["a", C(`Instrument the read. Have the flag client record the key on every evaluation and ship that
        |as a low cardinality metric. After two weeks, anything with zero evaluations is dead code and
        |can be deleted without discussion.

        |For the ones that are read but always return the same value, the check is different: they are
        |live but decided. Remove the branch that never runs, then remove the flag, in two separate
        |commits so the revert is small if you were wrong about which branch was dead.`)],
    ],
  },

  {
    title: "Rust binary exits silently in a distroless image",
    t: "2025-03-06T18:20:00Z",
    msgs: [
      ["h", C(`My Rust service works in a debian container but immediately exits in distroless with no
        |error message at all.`)],
      ["a", C(`Almost certainly dynamic linking against glibc. Distroless static has no loader to report
        |the failure, which is why you get silence instead of a message.

        |Check what the binary needs:

        |\`\`\`sh
        |ldd target/release/myservice
        |\`\`\`

        |If it lists libc, either use the distroless image that ships the C runtime, or build fully
        |static against musl:

        |\`\`\`sh
        |rustup target add x86_64-unknown-linux-musl
        |cargo build --release --target x86_64-unknown-linux-musl
        |\`\`\`

        |With musl the binary has no dynamic dependencies and the static base image works.`)],
      ["h", "Any downside to the musl build?"],
      ["a", C(`One that surprises people: musl's default allocator is much slower than glibc's under
        |multi-threaded allocation-heavy workloads. If your service allocates a lot across many threads
        |you can see a large regression that has nothing to do with your code. Linking jemalloc or
        |mimalloc removes it.

        |The second is TLS certificate roots. A static binary with no base image has no
        |\`/etc/ssl/certs\`, so outbound HTTPS fails. Either copy the certificate bundle into the image or
        |use a TLS stack that embeds the roots.`)],
    ],
  },

  {
    title: "Async methods in Rust traits",
    t: "2025-02-19T12:41:00Z",
    msgs: [
      ["h", "Can I write async fn in a trait now, or do I still need the macro?"],
      ["a", C(`You can write it directly for traits used inside your own crate. The remaining limitation
        |is that a trait with an async method is not automatically object safe, so \`dyn Trait\` does not
        |work without help.

        |\`\`\`rust
        |trait Store {
        |    async fn get(&self, key: &str) -> Option<Vec<u8>>;
        |}
        |\`\`\`

        |That compiles and is fine for generic code such as \`fn use_store<S: Store>(s: &S)\`. If you need
        |a trait object you still reach for the macro that boxes the returned future, because a boxed
        |future has a known size and the raw form does not.`)],
      ["h", "Is the boxing cost worth worrying about?"],
      ["a", C(`One heap allocation per call. That matters in a hot loop and is invisible anywhere else.
        |Write the plain version first and box only when you actually need dynamic dispatch, which in
        |most services is at a single boundary rather than throughout.

        |The other thing to know is that a plain async method in a public trait leaks auto trait bounds:
        |callers cannot assume the returned future is \`Send\` unless you say so. For a library used
        |inside a multi-threaded runtime, that is the difference between a trait that works and a trait
        |that produces a wall of errors at the call site.`)],
    ],
  },

  {
    title: "Why is my Kubernetes pod pending",
    t: "2024-12-02T14:15:00Z",
    msgs: [
      ["h", "A deployment rolled out and one pod has been Pending for ten minutes. Nodes look healthy."],
      ["a", C(`Pending means the scheduler has not placed it. The reason is always in the events:

        |\`\`\`sh
        |kubectl describe pod my-pod | sed -n '/Events/,$p'
        |\`\`\`

        |Four you will actually see. Insufficient cpu or memory, meaning no node has room for the
        |requests you asked for, which is about requests and not about actual usage. No nodes matching
        |the node selector or affinity. A taint with no matching toleration. And an unbound persistent
        |volume claim, often because the volume is in a different availability zone from every node that
        |could take the pod.`)],
      ["h", "It says insufficient memory but the nodes are at 40 percent usage."],
      ["a", C(`Then your requests are far above your real usage. The scheduler packs by requests, not by
        |current consumption, so a cluster at 40 percent actual memory can be fully requested and unable
        |to place anything.

        |Look at the gap:

        |\`\`\`sh
        |kubectl describe node my-node | grep -A5 "Allocated resources"
        |\`\`\`

        |If requested memory is near allocatable while usage is at 40 percent, lower the requests to
        |something near the real working set and leave the limits where they are. That is also the
        |cheapest cost saving most clusters have available, because over-requesting silently buys nodes
        |that do nothing.`)],
    ],
  },

  {
    title: "Rolling update still drops a few requests",
    t: "2025-01-18T16:37:00Z",
    msgs: [
      ["h", C(`We use a rolling update with maxUnavailable set to zero, and we still see a handful of
        |502s on every deploy.`)],
      ["a", C(`Zero unavailable guarantees that a replacement pod is ready before an old one goes away.
        |It does not guarantee that the load balancer has stopped sending traffic to the old one when it
        |starts shutting down, because endpoint removal and the SIGTERM signal race each other.

        |Two things fix almost all of it. A preStop sleep long enough for endpoint propagation, and a
        |readiness probe that starts failing at the beginning of shutdown so removal begins before the
        |server stops accepting.

        |\`\`\`yaml
        |lifecycle:
        |  preStop:
        |    exec: { command: ["sh", "-c", "sleep 10"] }
        |terminationGracePeriodSeconds: 45
        |\`\`\``)],
      ["h", "And the application side?"],
      ["a", C(`Stop accepting new connections, let in-flight requests finish, then close. Most frameworks
        |have this as one call, and most services never wire it to SIGTERM.

        |Also check that graceful shutdown actually finishes within the grace period. If a request can
        |take 60 seconds and the grace period is 30, the container is killed and you drop it. Either
        |raise the grace period above your slowest request or make the slow path cancellable.`)],
    ],
  },

  {
    title: "Property-based testing for a query parser",
    t: "2025-04-25T13:52:00Z",
    msgs: [
      ["h", C(`I wrote a query parser and my unit tests all pass, but users keep finding inputs that
        |break it. How do I test the space rather than the examples?`)],
      ["a", C(`Property tests. Instead of asserting on specific inputs you state a property that should
        |hold for all inputs, let the library generate thousands of them, and let it shrink any failure
        |to the smallest case.

        |For a parser the two properties that catch the most are round-tripping and totality:

        |\`\`\`js
        |// round trip: printing a parsed query and parsing it again gives the same tree
        |fc.assert(fc.property(arbitraryQuery(), (q) => {
        |  expect(parse(print(parse(q)))).toEqual(parse(q));
        |}));

        |// totality: the parser never throws, on any string at all
        |fc.assert(fc.property(fc.string(), (s) => { parse(s); }));
        |\`\`\`

        |The second is unglamorous and finds more bugs than anything else you will write.`)],
      ["h", "Writing the generator looks like as much work as the parser."],
      ["a", C(`For the round trip property, yes, and that is the honest cost. Start with totality, which
        |needs no generator beyond random strings, and add the structured generator only if the parser is
        |central enough to earn it.

        |One more cheap property while you are there: for any input, the reported error position must lie
        |within the input. That single assertion catches a surprising number of off-by-one bugs in error
        |reporting, which is exactly the code unit tests never cover because nobody writes a test for a
        |message.`)],
    ],
  },

  {
    title: "Flaky tests: quarantine or fix",
    t: "2024-08-14T10:24:00Z",
    msgs: [
      ["h", C(`Our CI fails about one run in six for reasons unrelated to the change. People just hit
        |retry now. How do we get out of this?`)],
      ["a", C(`The retry habit is the real damage: once a red build means nothing, a genuine failure gets
        |retried too. So the first move is to make the signal meaningful again, even at the cost of
        |coverage.

        |Track flakiness per test rather than per run. Any test that has failed and then passed on the
        |same commit within the last 30 days is flaky. Quarantine those: still run them, still record the
        |result, but do not let them fail the build. The build is trustworthy again.

        |Then fix the quarantine list on a budget, say two tests a week, and delete anything that has sat
        |there for three months. A test nobody will fix is not protecting anything.`)],
      ["h", "What causes most of it, in your experience?"],
      ["a", C(`Time and order, in that order.

        |Time: a sleep standing in for a condition, a timeout tuned to a fast laptop, an assertion on
        |"now" that crosses a second boundary. Replace sleeps with waits on the actual condition and
        |inject the clock.

        |Order: tests sharing a database row, a temporary directory, a global registry, or a
        |module-level cache. These pass alone and fail when the suite is sharded differently. Running the
        |suite in a randomised order in CI surfaces them immediately, and it is one configuration line.`)],
    ],
  },

  {
    title: "Reducing a four second Largest Contentful Paint",
    t: "2025-05-02T09:12:00Z",
    msgs: [
      ["h", C(`Field data says our LCP is 4.1 seconds at the 75th percentile. Lab tests say 1.2. Where do
        |I even start?`)],
      ["a", C(`The gap between lab and field is the finding, not a problem with the measurement. Lab runs
        |on a fast connection with a warm cache and no third-party scripts. Field is real phones on real
        |networks.

        |Start by finding which element is the LCP element in the field, because it is often not the one
        |you optimised:

        |\`\`\`js
        |new PerformanceObserver((list) => {
        |  const e = list.getEntries().at(-1);
        |  console.log(e.element, e.url, e.startTime);
        |}).observe({ type: "largest-contentful-paint", buffered: true });
        |\`\`\`

        |Then split the time into time to first byte, resource load delay, resource load time and element
        |render delay. Each has a different fix and optimising the wrong one does nothing.`)],
      ["h", "Load delay is the biggest chunk. What causes that?"],
      ["a", C(`The browser did not know it needed the resource until late. Usually the image is
        |discovered by a script, or it is a CSS background, or it sits behind a client-rendered
        |component.

        |Fixes, in order of effect: put the hero image in the HTML as an \`img\` with a high fetch
        |priority so the preload scanner finds it in the first bytes; remove lazy loading from anything
        |above the fold, which is a common self-inflicted wound; and make sure no render-blocking
        |stylesheet or font sits in front of it in the request chain.`)],
    ],
  },

  {
    title: "Font loading without a flash of invisible text",
    t: "2024-10-08T11:41:00Z",
    msgs: [
      ["h", C(`Our headings are invisible for about a second on first load. We use a Google Fonts link
        |tag. What is the minimum fix?`)],
      ["a", C(`Add \`display=swap\` to the font URL. Without it the browser blocks text rendering for up
        |to three seconds waiting for the file, which is the invisible second you are seeing.

        |\`\`\`html
        |<link rel="preconnect" href="https://fonts.googleapis.com">
        |<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        |<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:wght@400..700&display=swap">
        |\`\`\`

        |The two preconnects matter more than they look: the stylesheet is on one host and the font files
        |are on another, so without them you pay two full connection setups in series.`)],
      ["h", "Now the text reflows when the real font arrives. Is that unavoidable?"],
      ["a", C(`Largely avoidable. The reflow is a metrics mismatch between the fallback and the real
        |face. You can tune the fallback so the two occupy nearly the same space:

        |\`\`\`css
        |@font-face {
        |  font-family: "Literata Fallback";
        |  src: local("Georgia");
        |  size-adjust: 103%;
        |  ascent-override: 92%;
        |  descent-override: 24%;
        |}
        |\`\`\`

        |Also request only the weights and axes you actually use. A variable font with a full weight
        |range is one file, which is good, but shipping italics you never set is bytes on the critical
        |path for nothing.`)],
    ],
  },

  {
    title: "Finding a memory leak in a long-running tab",
    t: "2025-06-27T20:08:00Z",
    msgs: [
      ["h", C(`Our dashboard grows to 1.5 GB after a day open. I take heap snapshots but cannot tell what
        |is holding what.`)],
      ["a", C(`Use three snapshots, not one. Snapshot, do the repeated action ten times, snapshot, do it
        |ten more times, snapshot. Then compare the third against the second with the objects-allocated-
        |between-snapshots filter. Anything still alive that was allocated in that window is your leak,
        |and the retainers panel shows the chain holding it.

        |In a browser dashboard the usual four are: an event listener on \`window\` or \`document\` added
        |by a component that never removes it, an interval that outlives its owner, a detached DOM
        |subtree still referenced from an array, and an ever-growing cache with no bound.`)],
      ["h", "How do I find detached nodes specifically?"],
      ["a", C(`Filter the snapshot by "Detached" in the class filter. Every entry there is a DOM node no
        |longer in the document but still reachable from JavaScript, which means something in your code
        |holds the reference.

        |The pattern that produces them most often is caching an element lookup in a module-level map and
        |never deleting on teardown. A \`WeakMap\` keyed by the element fixes it by construction: when the
        |node goes, the entry goes.

        |For the interval case, adopt a rule that every interval and every listener in a component
        |returns its own cleanup, and that the cleanup is registered at the same moment the subscription
        |is made. Cleanup written later is cleanup that gets forgotten.`)],
    ],
  },

  {
    title: "Choosing a queue: SQS, Kafka or Postgres",
    t: "2025-07-08T15:19:00Z",
    msgs: [
      ["h", C(`We need background jobs. About 200 a minute, occasionally bursting to 3,000. Kafka feels
        |like overkill but people keep suggesting it.`)],
      ["a", C(`At 200 a minute Kafka is overkill, and the question that actually decides this is not
        |throughput. It is whether you need replay.

        |Kafka is a log: consumers hold an offset and can rewind, and many independent consumers can read
        |the same stream. If your requirement is "rebuild this projection from the last 30 days of
        |events", that is Kafka's shape and nothing else does it as well.

        |A queue is a work list: a message is delivered, worked, and gone. If your requirement is "resize
        |this image, then forget about it", a queue is the right shape and a log is extra machinery.`)],
      ["h", "And Postgres? We already run it."],
      ["a", C(`At your volume, entirely reasonable, and it buys you something real: the job insert can be
        |in the same transaction as the data change that caused it. No external queue can give you that,
        |and the dual-write problem it removes is the source of a lot of "the email went out but the
        |order was rolled back" bugs.

        |\`\`\`sql
        |SELECT * FROM jobs
        |WHERE run_at <= now() AND state = 'queued'
        |ORDER BY run_at
        |FOR UPDATE SKIP LOCKED
        |LIMIT 10;
        |\`\`\`

        |\`SKIP LOCKED\` is what makes this work with many workers. Move to a dedicated queue when the job
        |table's write volume starts competing with your application traffic for the same disk, or when
        |you want a retention and replay story your database should not be responsible for.`)],
    ],
  },

  {
    title: "Idempotency keys on a payments endpoint",
    t: "2025-08-01T09:58:00Z",
    msgs: [
      ["h", C(`Clients retry our charge endpoint on timeout and occasionally double charge. We want
        |idempotency keys. What are the edge cases people miss?`)],
      ["a", C(`Three, and each one has bitten a real payments integration.

        |Storing the key only on success. A request that times out mid-flight is exactly the one that
        |will be retried, so the key must be recorded before the side effect, not after. Insert the key
        |with a unique constraint first; a duplicate insert tells you this is a retry.

        |Not storing the response. A retry must return the same response as the original, including the
        |same charge id. If you return a fresh 200 with a different body, a client reconciling by id sees
        |two charges.

        |Not binding the key to the request body. If the same key arrives with a different amount, that
        |is a client bug and you should return a 422 rather than quietly returning the old charge.`)],
      ["h", "How long do we keep the keys?"],
      ["a", C(`Long enough to cover every retry policy a client could plausibly use, which in practice
        |means 24 hours minimum and often longer. If a client's retry queue can be delayed by an outage,
        |a week is safer.

        |Keep the key, a fingerprint of the request, the response body, and the status. The storage cost
        |is trivial next to the cost of one double charge, and the record is also the artefact you will
        |want when a customer disputes what happened.`)],
    ],
  },

  {
    title: "Settling naming arguments in review",
    t: "2024-09-03T14:02:00Z",
    msgs: [
      ["h", C(`Code review keeps stalling on naming arguments. Is there anything better than "it depends"
        |to settle them?`)],
      ["a", C(`A few rules settle most of them without taste entering the room.

        |Name for what the reader needs at the call site, not for what the implementation does. A
        |function that walks a tree and returns a list is \`messagesOnPath\`, not \`traverseMapping\`.

        |Length scales with scope. A loop index can be one letter. A module-level export cannot.

        |Booleans read as assertions: \`hasCode\`, \`isTruncated\`, \`shouldRetry\`. Never a negation in the
        |name, because \`!notReady\` is where bugs live.

        |Do not encode the type. \`userList\` says nothing that \`users\` does not, and it lies the day it
        |becomes a Set.`)],
      ["h", "What about disagreements over domain terms?"],
      ["a", C(`Those are worth stalling on, because they are not naming arguments, they are modelling
        |arguments wearing a disguise. If two people want to call the same thing "customer" and
        |"account", the team does not agree on what the thing is, and the code will encode that
        |disagreement as two half-overlapping types.

        |Write a short glossary in the repository, one line per term, and make it the tiebreaker. It is
        |the cheapest document you will ever maintain and it turns a recurring argument into a one-time
        |decision.`)],
    ],
  },

  {
    title: "Making code review faster without lowering the bar",
    t: "2024-11-19T11:26:00Z",
    msgs: [
      ["h", C(`Our median time to first review is 19 hours. People context switch away and the branch
        |goes stale. What actually moves this number?`)],
      ["a", C(`Change size, before anything else. A 60 line change gets reviewed in an hour; a 900 line
        |change waits for someone to find a clear afternoon, and then gets a worse review because
        |attention does not last that long. Everything else is secondary.

        |Concretely: split by commit into a mechanical change and a behavioural change, and open them
        |separately. A rename touching 40 files and a logic change touching 3 are two reviews, and the
        |first one takes 30 seconds.`)],
      ["h", "We already say that. It does not happen."],
      ["a", C(`Then measure and publish it rather than asking. A weekly number for median review latency
        |and median diff size, visible to the team, changes behaviour in a way that a guideline in a wiki
        |does not.

        |Two structural changes also help. Make the author responsible for naming a reviewer rather than
        |posting into a channel, because a request addressed to everyone is addressed to nobody. And
        |separate "this blocks merge" from "consider this", explicitly, in the comment itself. A large
        |share of review latency is authors waiting for a decision on a comment that was never meant to
        |block them.`)],
    ],
  },
];
