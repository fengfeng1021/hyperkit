/* My list library.
   A cabinet with wear on it, not a dropdown. Each row carries how many times it
   has been used, which book it went into last, and which of its words did not
   fit which grid. That last one is the thing that makes the fifth run cheaper
   than the first. */

import { el, clear, icon, $, $$, toast, download } from './dom.js';
import { call } from './fx.js';
import { THEMES, themeWords, themeStats } from './data/themes.js';
import * as store from './store.js';

export class Drawer {
  constructor(app) {
    this.app = app;
    this.node = $('#drawer');
    this.paneMine = $('#pane-mine');
    this.paneThemes = $('#pane-themes');
    this.tabMine = $('#tab-mine');
    this.tabThemes = $('#tab-themes');
    this.selectedThemes = new Set();
    this.lastFocus = null;
    this.closing = false;

    this.tabMine.addEventListener('click', () => this.showTab('mine'));
    this.tabThemes.addEventListener('click', () => this.showTab('themes'));
    $('#drawer-close').addEventListener('click', () => this.close());
    $('#export-lists').addEventListener('click', () => this.exportJson());
    $('#import-lists').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => this.importJson(e));

    this.node.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = $$('button, input, [tabindex="0"]', this.node).filter((n) => !n.disabled && n.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  get isOpen() {
    /* a drawer that is sliding shut is already closed as far as Esc, the
       toggle key and the focus trap are concerned */
    return !this.node.hidden && !this.closing;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(tab) {
    this.lastFocus = document.activeElement;
    this.closing = false;
    this.node.hidden = false;
    this.render();
    if (tab) this.showTab(tab);
    call('drawerOpen', this.node);
    const first = $('button, .list-row', this.node);
    if (first) first.focus();
  }

  close() {
    /* focus moves back immediately; only the panel itself waits for the slide,
       so keyboard users never wait on a decoration */
    const shut = () => {
      this.closing = false;
      this.node.hidden = true;
    };
    this.closing = true;
    if (!call('drawerClose', this.node, shut)) shut();
    if (this.lastFocus && this.lastFocus.isConnected) this.lastFocus.focus();
  }

  showTab(which) {
    const mine = which === 'mine';
    this.tabMine.setAttribute('aria-selected', String(mine));
    this.tabThemes.setAttribute('aria-selected', String(!mine));
    this.paneMine.hidden = !mine;
    this.paneThemes.hidden = mine;
  }

  render() {
    this.renderMine();
    this.renderThemes();
  }

  renderMine() {
    const host = clear(this.paneMine);
    const lists = this.app.state.lists;

    if (!store.state.available) {
      host.appendChild(
        el('p', {
          class: 'drawer-note',
          text: '這個瀏覽器不允許本機資料庫（無痕模式？）。清單庫這次不會被記住，關掉分頁就會消失。',
        }),
      );
    }

    if (!lists.length) {
      host.appendChild(
        el('div', { class: 'drawer-empty' }, [
          el('div', { class: 'empty-card', 'aria-hidden': 'true' }, [
            el('span'), el('span'), el('span'), el('span'),
          ]),
          el('p', { text: '清單庫是空的。' }),
          el('p', { text: '貼一份清單並按「存進我的清單庫」，或先從內建主題清單挑一份。' }),
          el('button', { type: 'button', class: 'btn-hair', onclick: () => this.showTab('themes') }, '看內建主題清單'),
        ]),
      );
      return;
    }

    lists.forEach((list) => host.appendChild(this.listRow(list)));
  }

  listRow(list) {
    const selected = this.app.state.listId === list.id;
    const longest = list.words.reduce((a, b) => (b.length > a.length ? b : a), '');
    const meta = `${list.words.length} 字 · 最長 ${longest.length}${list.lastBook ? ` · 上次用於《${list.lastBook}》` : ''}`;

    const choose = () => {
      this.app.applyList(list);
      this.render();
    };
    const row = el(
      'div',
      {
        class: 'list-row',
        role: 'button',
        tabindex: '0',
        'aria-selected': String(selected),
        onclick: (e) => {
          if (e.target.closest('.list-del')) return;
          choose();
        },
        onkeydown: (e) => {
          if (e.target.closest('.list-del')) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose();
          }
        },
      },
      [
        el('span', { class: 'list-top' }, [
          el('span', { class: 'list-name', text: list.name }),
          el('span', { class: 'list-uses', text: list.uses ? `用過 ${list.uses} 次` : '還沒用過' }),
        ]),
        el('span', { class: 'list-meta', text: meta }),
      ],
    );

    if (list.tooLongWords && list.tooLongWords.length) {
      const minGrid = Math.max(...list.tooLongWords.map((w) => w.minGrid));
      const problem = el('span', { class: 'list-problem' }, [
        icon('slash'),
        document.createTextNode(`${list.tooLongWords.length} 個字在 ${minGrid - 2} × ${minGrid - 2} 放不下`),
      ]);
      row.appendChild(problem);
    }

    const del = el('span', { class: 'list-del' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `刪除清單 ${list.name}`,
          onclick: (e) => {
            e.stopPropagation();
            this.confirmDelete(row, list);
          },
        },
        [icon('cancel')],
      ),
    ]);
    row.appendChild(del);
    return row;
  }

  confirmDelete(row, list) {
    const original = row.innerHTML;
    clear(row);
    const restore = () => {
      row.innerHTML = original;
      this.render();
    };
    const timer = setTimeout(restore, 2400);
    row.appendChild(el('span', { class: 'list-name', text: `刪除「${list.name}」？` }));
    row.appendChild(
      el('span', { class: 'list-top' }, [
        el(
          'span',
          {
            class: 'btn-hair',
            role: 'button',
            tabindex: '0',
            onclick: async (e) => {
              e.stopPropagation();
              clearTimeout(timer);
              await store.deleteList(list.id);
              await this.app.reloadLists();
              this.render();
              toast(`已刪除「${list.name}」`);
            },
          },
          '刪除',
        ),
        el(
          'span',
          {
            class: 'btn-hair',
            role: 'button',
            tabindex: '0',
            onclick: (e) => {
              e.stopPropagation();
              clearTimeout(timer);
              restore();
            },
          },
          '取消',
        ),
      ]),
    );
  }

  renderThemes() {
    const host = clear(this.paneThemes);
    host.appendChild(
      el('p', { class: 'drawer-note', text: '內建清單是英文，因為 KDP 的字謎書市場是英文市場。' }),
    );

    THEMES.forEach((theme) => {
      const s = themeStats(theme);
      const on = this.selectedThemes.has(theme.id);
      const row = el(
        'button',
        {
          type: 'button',
          class: 'list-row theme-row',
          'aria-selected': String(on),
          onclick: () => {
            if (this.selectedThemes.has(theme.id)) this.selectedThemes.delete(theme.id);
            else this.selectedThemes.add(theme.id);
            this.renderThemes();
          },
        },
        [
          el('span', { class: 'list-top' }, [
            el('span', { class: 'theme-check' }, [icon('check')]),
            el('span', { class: 'list-name', text: theme.name }),
          ]),
          el('span', { class: 'list-meta', text: `${s.count} 字 · 最長 ${s.longestLen} · ${s.longest.toLowerCase()}` }),
        ],
      );
      host.appendChild(row);
    });

    const total = Array.from(this.selectedThemes).reduce((n, id) => {
      const t = THEMES.find((x) => x.id === id);
      return n + (t ? themeWords(t).length : 0);
    }, 0);

    host.appendChild(
      el('div', { class: 'drawer-merge' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'btn-primary',
            disabled: this.selectedThemes.size === 0,
            onclick: () => this.useThemes(),
          },
          this.selectedThemes.size === 0
            ? '選一組或多組主題'
            : `合併 ${this.selectedThemes.size} 組共 ${total} 字`,
        ),
      ]),
    );
  }

  useThemes() {
    const picked = THEMES.filter((t) => this.selectedThemes.has(t.id));
    const words = [];
    picked.forEach((t) => themeWords(t).forEach((w) => words.push(w)));
    this.app.applyWords(Array.from(new Set(words)), picked.map((t) => t.name).join(' + '), null);
    this.close();
  }

  async exportJson() {
    const payload = await store.exportLibrary();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const { revoke } = download(blob, 'puzzle-press-library.json');
    setTimeout(revoke, 20000);
    toast(`已匯出 ${payload.lists.length} 份清單`);
  }

  async importJson(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const added = await store.importLibrary(JSON.parse(await file.text()));
      await this.app.reloadLists();
      this.render();
      toast(`已匯入 ${added} 份清單`);
    } catch (err) {
      toast(err.message || '這個檔案讀不出來。');
    }
  }
}
