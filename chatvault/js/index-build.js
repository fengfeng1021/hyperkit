/* The inverted index.

   Built with plain arrays while ingesting, then sealed into typed arrays. The
   sealed form is what search reads: contiguous Int32Array postings instead of
   tens of thousands of small objects, which is what keeps re-ranking under a
   frame at a few hundred thousand messages.

   A document here is one MESSAGE, not one conversation. Ranking rolls up to the
   conversation afterwards. That is what makes "which message said this" a real
   answer rather than a substring hunt inside a card.

   Positions are stored delta encoded so that phrase search is a real adjacency
   check. Faking phrase search by requiring all terms to be present returns
   wrong results that the user cannot see, which is worse than not shipping it. */

import { tokenizeInto, isContentTerm } from "./tokenize.js";

const MAX_POSITIONS_PER_DOC = 512;
const TOP_TERMS_PER_CONV = 40;

export const ROLE_CODE = { human: 0, assistant: 1, system: 2 };
export const SOURCE_CODE = { chatgpt: 0, claude: 1, gemini: 2, custom: 3 };
export const SOURCE_NAME = ["chatgpt", "claude", "gemini", "custom"];

export class IndexBuilder {
  constructor() {
    this.terms = [];
    this.termId = new Map();
    this.postings = []; // termId -> { docs: [], tfs: [], pos: [[]] }
    this.docConv = [];
    this.docRole = [];
    this.docNode = [];
    this.docLen = [];
    this.docOnPath = [];
    this.convIds = [];
    this.convTime = [];
    this.convSource = [];
    this.convHasCode = [];
    this.convMsgCount = [];
    this.convTermCounts = []; // Map<termId, count> during build
    this.totalLen = 0;
  }

  get docCount() {
    return this.docConv.length;
  }

  termFor(word) {
    let id = this.termId.get(word);
    if (id === undefined) {
      id = this.terms.length;
      this.terms.push(word);
      this.termId.set(word, id);
      this.postings.push({ docs: [], tfs: [], pos: [] });
    }
    return id;
  }

  /**
   * @param {object} conv a finalised conversation record
   * @param {Set<string>} onPathIds node ids on the export's own reading path
   */
  addConversation(conv, onPathIds) {
    const ci = this.convIds.length;
    this.convIds.push(conv.id);
    this.convTime.push(conv.createdAt);
    this.convSource.push(SOURCE_CODE[conv.source] ?? 3);
    this.convHasCode.push(conv.hasCode ? 1 : 0);
    this.convMsgCount.push(conv.nodes.length);
    const convCounts = new Map();
    this.convTermCounts.push(convCounts);

    // The title is indexed as a virtual message so that a title-only match is
    // findable. It is marked as role system so role filters do not pick it up.
    const units = [{ role: "system", text: conv.title, id: "#title", nodeIndex: -1 }];
    conv.nodes.forEach((n, i) => units.push({ role: n.role, text: n.text, id: n.id, nodeIndex: i }));

    const buffer = [];
    for (const unit of units) {
      const di = this.docConv.length;
      buffer.length = 0;
      const len = tokenizeInto(unit.text, buffer);
      this.docConv.push(ci);
      this.docRole.push(ROLE_CODE[unit.role] ?? 2);
      this.docNode.push(unit.nodeIndex);
      this.docLen.push(Math.min(len, 65535));
      this.docOnPath.push(onPathIds && onPathIds.has(unit.id) ? 1 : 0);
      this.totalLen += len;

      const local = new Map();
      for (let p = 0; p < buffer.length; p++) {
        const word = buffer[p];
        let entry = local.get(word);
        if (!entry) local.set(word, (entry = { tf: 0, pos: [] }));
        entry.tf++;
        if (entry.pos.length < MAX_POSITIONS_PER_DOC) entry.pos.push(p);
      }
      for (const [word, entry] of local) {
        const tid = this.termFor(word);
        const post = this.postings[tid];
        post.docs.push(di);
        post.tfs.push(Math.min(entry.tf, 65535));
        post.pos.push(entry.pos);
        convCounts.set(tid, (convCounts.get(tid) || 0) + entry.tf);
      }
    }
  }

  /** Freeze into the read-only structure that search.js consumes. */
  seal() {
    const T = this.terms.length;
    const postOff = new Int32Array(T + 1);
    let total = 0;
    for (let t = 0; t < T; t++) {
      postOff[t] = total;
      total += this.postings[t].docs.length;
    }
    postOff[T] = total;

    const postDocs = new Int32Array(total);
    const postTf = new Uint16Array(total);
    const posOff = new Int32Array(total + 1);
    let posTotal = 0;
    for (let t = 0; t < T; t++) {
      const p = this.postings[t];
      for (let k = 0; k < p.docs.length; k++) posTotal += p.pos[k].length;
    }
    const posData = new Int32Array(posTotal);

    let w = 0;
    let pw = 0;
    for (let t = 0; t < T; t++) {
      const p = this.postings[t];
      for (let k = 0; k < p.docs.length; k++) {
        postDocs[w] = p.docs[k];
        postTf[w] = p.tfs[k];
        posOff[w] = pw;
        const list = p.pos[k];
        let prev = 0;
        for (let j = 0; j < list.length; j++) {
          posData[pw++] = list[j] - prev;
          prev = list[j];
        }
        w++;
      }
    }
    posOff[total] = pw;

    const df = new Int32Array(T);
    const convDf = new Int32Array(T);
    const docConv = Int32Array.from(this.docConv);
    for (let t = 0; t < T; t++) {
      const a = postOff[t];
      const b = postOff[t + 1];
      df[t] = b - a;
      let last = -1;
      let n = 0;
      for (let k = a; k < b; k++) {
        const c = docConv[postDocs[k]];
        if (c !== last) {
          n++;
          last = c;
        }
      }
      convDf[t] = n;
    }

    // Per-conversation signature terms, used by Expanded mode to learn which
    // words travel together in this particular vault.
    const C = this.convIds.length;
    const convTopOff = new Int32Array(C + 1);
    const tops = [];
    for (let c = 0; c < C; c++) {
      const counts = this.convTermCounts[c];
      const scored = [];
      for (const [tid, n] of counts) {
        if (!isContentTerm(this.terms[tid])) continue;
        scored.push([tid, n * Math.log(1 + C / Math.max(1, convDf[tid]))]);
      }
      scored.sort((a, b) => b[1] - a[1]);
      const keep = scored.slice(0, TOP_TERMS_PER_CONV).map((x) => x[0]);
      convTopOff[c] = tops.length;
      for (const tid of keep) tops.push(tid);
    }
    convTopOff[C] = tops.length;

    return {
      version: 1,
      terms: this.terms,
      df,
      convDf,
      postOff,
      postDocs,
      postTf,
      posOff,
      posData,
      docConv,
      docRole: Uint8Array.from(this.docRole),
      docNode: Int32Array.from(this.docNode),
      docLen: Uint16Array.from(this.docLen),
      docOnPath: Uint8Array.from(this.docOnPath),
      convIds: this.convIds,
      convTime: Float64Array.from(this.convTime),
      convSource: Uint8Array.from(this.convSource),
      convHasCode: Uint8Array.from(this.convHasCode),
      convMsgCount: Int32Array.from(this.convMsgCount),
      convTopTerms: Int32Array.from(tops),
      convTopOff,
      docCount: this.docConv.length,
      avgdl: this.docConv.length ? this.totalLen / this.docConv.length : 1,
    };
  }
}

/** Rehydrate the lookup map after a structured clone or an IndexedDB read. */
export function hydrate(index) {
  if (!index) return null;
  if (!index.termId) {
    const map = new Map();
    for (let i = 0; i < index.terms.length; i++) map.set(index.terms[i], i);
    index.termId = map;
  }
  if (!index.convIndexById) {
    const map = new Map();
    for (let i = 0; i < index.convIds.length; i++) map.set(index.convIds[i], i);
    index.convIndexById = map;
  }
  return index;
}

/** Absolute positions of one posting, decoded from the delta array. */
export function positionsAt(index, postIndex) {
  const a = index.posOff[postIndex];
  const b = index.posOff[postIndex + 1];
  const out = new Int32Array(b - a);
  let prev = 0;
  for (let i = a; i < b; i++) {
    prev += index.posData[i];
    out[i - a] = prev;
  }
  return out;
}

/** Binary search inside a term's posting list. Returns the posting index or -1. */
export function findPosting(index, termId, doc) {
  let lo = index.postOff[termId];
  let hi = index.postOff[termId + 1] - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = index.postDocs[mid];
    if (v === doc) return mid;
    if (v < doc) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** The list of transferable buffers, so the index crosses the worker boundary once. */
export function indexTransferables(index) {
  return [
    index.df.buffer,
    index.convDf.buffer,
    index.postOff.buffer,
    index.postDocs.buffer,
    index.postTf.buffer,
    index.posOff.buffer,
    index.posData.buffer,
    index.docConv.buffer,
    index.docRole.buffer,
    index.docNode.buffer,
    index.docLen.buffer,
    index.docOnPath.buffer,
    index.convTime.buffer,
    index.convSource.buffer,
    index.convHasCode.buffer,
    index.convMsgCount.buffer,
    index.convTopTerms.buffer,
    index.convTopOff.buffer,
  ];
}
