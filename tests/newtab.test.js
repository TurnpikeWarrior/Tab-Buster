const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createFaviconUrl,
  createGroupCloseConfirmation,
  createStableRefreshScheduler,
  decorateTab,
  filterGroups,
  formatDomainName,
  getBaseDomain,
  getMasonryColumnCount,
  getReflowOffset,
  getShortestColumnIndex,
  groupTabsByDomain,
  isDashboardVisibleTab,
  normalizeTabUrl,
  organizeTabsByDuplicateUrl,
  registerTabChangeListeners,
  sanitizeFaviconFallback,
  shortUrl,
  getNextTheme,
  GROUP_CLOSE_ANIMATION_MS,
  CARD_REFLOW_ANIMATION_MS,
  TAB_CLOSE_ANIMATION_MS,
} = require("../newtab.js");

test("formatDomainName converts common domains into friendly titles", () => {
  assert.equal(formatDomainName("youtube.com"), "YouTube");
  assert.equal(formatDomainName("docs.google.com"), "Google Docs");
  assert.equal(formatDomainName("chrome://extensions"), "Chrome Extensions");
  assert.equal(formatDomainName("github.com"), "GitHub");
  assert.equal(formatDomainName("openrouter.ai"), "OpenRouter");
});

test("normalizeTabUrl extracts grouping metadata for web and internal URLs", () => {
  assert.deepEqual(normalizeTabUrl("https://www.youtube.com/watch?v=123"), {
    groupKey: "youtube.com",
    host: "youtube.com",
    displayName: "YouTube",
    faviconSourceUrl: "https://www.youtube.com/watch?v=123",
    isInternal: false,
  });

  assert.deepEqual(normalizeTabUrl("chrome://extensions/"), {
    groupKey: "chrome://extensions",
    host: "chrome://extensions",
    displayName: "Chrome Extensions",
    faviconSourceUrl: "chrome://extensions/",
    isInternal: true,
  });
});

test("getBaseDomain ignores subdomains without collapsing common multi-part suffixes", () => {
  assert.equal(getBaseDomain("gist.github.com"), "github.com");
  assert.equal(getBaseDomain("www.youtube.com"), "youtube.com");
  assert.equal(getBaseDomain("news.bbc.co.uk"), "bbc.co.uk");
});

test("shortUrl keeps localhost port numbers visible", () => {
  assert.equal(shortUrl("http://localhost:3000/dashboard"), "localhost:3000/dashboard");
  assert.equal(shortUrl("http://127.0.0.1:5173/"), "127.0.0.1:5173");
});

test("normalizeTabUrl groups subdomains by their main domain", () => {
  assert.deepEqual(normalizeTabUrl("https://gist.github.com/user/hash"), {
    groupKey: "github.com",
    host: "github.com",
    displayName: "GitHub",
    faviconSourceUrl: "https://gist.github.com/user/hash",
    isInternal: false,
  });
});

test("createFaviconUrl uses Chrome favicon service for tab URLs", () => {
  const favicon = createFaviconUrl("https://github.com/zarazhangrui/tab-out");
  assert.equal(
    favicon,
    "/_favicon/?pageUrl=https%3A%2F%2Fgithub.com%2Fzarazhangrui%2Ftab-out&size=32",
  );
});

test("sanitizeFaviconFallback only allows web favicon URLs", () => {
  assert.equal(sanitizeFaviconFallback("https://example.com/favicon.ico"), "https://example.com/favicon.ico");
  assert.equal(sanitizeFaviconFallback("http://example.com/favicon.ico"), "http://example.com/favicon.ico");
  assert.equal(sanitizeFaviconFallback("javascript:alert(1)"), "");
  assert.equal(sanitizeFaviconFallback("chrome://favicon"), "");
  assert.equal(sanitizeFaviconFallback("not a url"), "");
});

test("decorateTab prefers Chrome favicon service and keeps sanitized remote fallback", () => {
  const tab = decorateTab({
    id: 10,
    title: "Tracked page",
    url: "https://example.com/page",
    favIconUrl: "https://tracker.example/favicon.ico",
  });

  assert.equal(
    tab.faviconUrl,
    "/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fpage&size=32",
  );
  assert.equal(tab.faviconFallbackUrl, "https://tracker.example/favicon.ico");
});

test("tab close animation is quick but gives rows time to collapse", () => {
  assert.ok(TAB_CLOSE_ANIMATION_MS >= 300);
  assert.ok(TAB_CLOSE_ANIMATION_MS <= 600);
});

function createFakeEventTarget(options = {}) {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    matches(selector) {
      return selector === ":hover" ? options.hovered !== false : false;
    },
    trigger(type) {
      const listener = listeners.get(type);
      if (listener) listener();
    },
  };
}

test("stable cleanup refresh scheduler holds reflow while the cleaned card is hovered", () => {
  let refreshCount = 0;
  const windowTarget = createFakeEventTarget();
  const card = createFakeEventTarget();
  const scheduler = createStableRefreshScheduler(windowTarget, () => {
    refreshCount += 1;
  });

  assert.equal(scheduler.holdWhileCardHovered(card), true);
  scheduler.requestRefresh();

  assert.equal(refreshCount, 0);

  card.trigger("mouseleave");
  assert.equal(refreshCount, 1);

  scheduler.requestRefresh();
  assert.equal(refreshCount, 2);
});

test("stable cleanup refresh scheduler releases held reflow when the window blurs", () => {
  let refreshCount = 0;
  const windowTarget = createFakeEventTarget();
  const card = createFakeEventTarget();
  const scheduler = createStableRefreshScheduler(windowTarget, () => {
    refreshCount += 1;
  });

  scheduler.holdWhileCardHovered(card);
  scheduler.requestRefresh();
  windowTarget.trigger("blur");

  assert.equal(refreshCount, 1);
});

test("group close burst animation is quick but visible", () => {
  assert.ok(GROUP_CLOSE_ANIMATION_MS >= 350);
  assert.ok(GROUP_CLOSE_ANIMATION_MS <= 700);
});

test("card reflow animation is quick and calculates movement from old to new position", () => {
  assert.ok(CARD_REFLOW_ANIMATION_MS >= 250);
  assert.ok(CARD_REFLOW_ANIMATION_MS <= 500);
  assert.deepEqual(
    getReflowOffset({ left: 30, top: 120 }, { left: 10, top: 80 }),
    { x: 20, y: 40 },
  );
  assert.equal(getReflowOffset({ left: 10, top: 80 }, { left: 10, top: 80 }), null);
});

test("getNextTheme toggles between light and dark", () => {
  assert.equal(getNextTheme("light"), "dark");
  assert.equal(getNextTheme("dark"), "light");
  assert.equal(getNextTheme("unexpected"), "dark");
});

test("createGroupCloseConfirmation supports yes and no confirmation choices", () => {
  const confirmation = createGroupCloseConfirmation();

  assert.equal(confirmation.isConfirming(), false);
  assert.equal(confirmation.confirmClose(), false);
  confirmation.requestConfirmation();
  assert.equal(confirmation.isConfirming(), true);
  assert.equal(confirmation.confirmClose(), true);
  assert.equal(confirmation.isConfirming(), false);

  confirmation.requestConfirmation();
  confirmation.cancel();
  assert.equal(confirmation.isConfirming(), false);
});

test("groupTabsByDomain groups tabs, sorts by count then name, and keeps tab order", () => {
  const tabs = [
    { id: 1, windowId: 10, title: "Video B", url: "https://youtube.com/b" },
    { id: 2, windowId: 10, title: "Repo", url: "https://github.com/org/repo" },
    { id: 3, windowId: 11, title: "Video A", url: "https://www.youtube.com/a" },
    { id: 4, windowId: 12, title: "Extensions", url: "chrome://extensions/" },
    { id: 5, windowId: 12, title: "Alpha", url: "https://alpha.example/a" },
  ];

  const groups = groupTabsByDomain(tabs);

  assert.equal(groups.length, 4);
  assert.equal(groups[0].displayName, "YouTube");
  assert.equal(groups[0].domain, "youtube.com");
  assert.deepEqual(
    groups[0].tabs.map((tab) => tab.title),
    ["Video B", "Video A"],
  );
  assert.deepEqual(
    groups.slice(1).map((group) => group.displayName),
    ["Alpha", "Chrome Extensions", "GitHub"],
  );
});

test("groupTabsByDomain groups subdomains by their main domain", () => {
  const groups = groupTabsByDomain([
    { id: 1, title: "Repo", url: "https://github.com/org/repo" },
    { id: 2, title: "Gist", url: "https://gist.github.com/user/hash" },
    { id: 3, title: "Docs", url: "https://docs.google.com/document/d/123" },
    { id: 4, title: "Search", url: "https://google.com/search?q=test" },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.domain, group.displayName, group.tabs.length]),
    [
      ["github.com", "GitHub", 2],
      ["google.com", "Google", 2],
    ],
  );
});

test("organizeTabsByDuplicateUrl places duplicate links together and marks them", () => {
  const tabs = [
    { id: 1, title: "Video A", url: "https://youtube.com/watch?v=a" },
    { id: 2, title: "Video B", url: "https://youtube.com/watch?v=b" },
    { id: 3, title: "Video A copy", url: "https://youtube.com/watch?v=a" },
    { id: 4, title: "Video C", url: "https://youtube.com/watch?v=c" },
  ];

  const organized = organizeTabsByDuplicateUrl(tabs);

  assert.deepEqual(
    organized.map((tab) => tab.title),
    ["Video A", "Video A copy", "Video B", "Video C"],
  );
  assert.deepEqual(
    organized.map((tab) => [tab.title, tab.isDuplicateLink, tab.duplicateCount]),
    [
      ["Video A", true, 2],
      ["Video A copy", true, 2],
      ["Video B", false, 1],
      ["Video C", false, 1],
    ],
  );
});

test("getMasonryColumnCount matches the responsive card width", () => {
  assert.equal(getMasonryColumnCount(320), 1);
  assert.equal(getMasonryColumnCount(760), 2);
  assert.equal(getMasonryColumnCount(1500), 4);
  assert.equal(getMasonryColumnCount(2100), 5);
});

test("dashboard shell can expand past the old four-column width cap", () => {
  const css = fs.readFileSync(path.join(__dirname, "../newtab.css"), "utf8");
  const appShellRule = css.match(/\.app-shell\s*\{[^}]+\}/);

  assert.ok(appShellRule, "Expected .app-shell rule to exist");
  assert.doesNotMatch(appShellRule[0], /1680px/);
  assert.match(appShellRule[0], /width:\s*calc\(100%\s*-\s*100px\)/);
});

test("header centers search and keeps theme toggle on the right", () => {
  const css = fs.readFileSync(path.join(__dirname, "../newtab.css"), "utf8");
  const topbarRule = css.match(/\.topbar\s*\{[^}]+\}/);
  const searchRule = css.match(/\.search-box\s*\{[^}]+\}/);
  const themeToggleRule = css.match(/\.theme-toggle\s*\{[^}]+\}/);

  assert.ok(topbarRule, "Expected .topbar rule to exist");
  assert.ok(searchRule, "Expected .search-box rule to exist");
  assert.ok(themeToggleRule, "Expected .theme-toggle rule to exist");
  assert.match(topbarRule[0], /display:\s*grid/);
  assert.match(topbarRule[0], /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(320px,\s*420px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(searchRule[0], /grid-column:\s*2/);
  assert.match(searchRule[0], /justify-self:\s*center/);
  assert.match(themeToggleRule[0], /grid-column:\s*3/);
  assert.match(themeToggleRule[0], /justify-self:\s*end/);
});

test("getShortestColumnIndex picks the highest open spot and breaks ties from the left", () => {
  assert.equal(getShortestColumnIndex([300, 120, 180]), 1);
  assert.equal(getShortestColumnIndex([120, 120, 180]), 0);
});

test("filterGroups matches domain names, tab titles, and URLs", () => {
  const groups = groupTabsByDomain([
    { id: 1, title: "LaunchPad Lab application", url: "https://apply.workable.com/launchpadlab/j/BC801936DE/" },
    { id: 2, title: "GitHub Stars Video", url: "https://youtube.com/watch?v=abc" },
    { id: 3, title: "OpenRouter Apps", url: "https://openrouter.ai/apps" },
  ]);

  assert.deepEqual(
    filterGroups(groups, "workable").map((group) => group.displayName),
    ["Workable"],
  );
  assert.deepEqual(
    filterGroups(groups, "stars").map((group) => group.displayName),
    ["YouTube"],
  );
  assert.deepEqual(
    filterGroups(groups, "openrouter").map((group) => group.displayName),
    ["OpenRouter"],
  );
});

test("isDashboardVisibleTab excludes the dashboard tab and Chrome new tab pages", () => {
  assert.equal(
    isDashboardVisibleTab({ id: 1, url: "chrome://newtab/" }, { currentTabId: 99, dashboardUrl: "chrome-extension://abc/newtab.html" }),
    false,
  );
  assert.equal(
    isDashboardVisibleTab({ id: 99, url: "https://example.com" }, { currentTabId: 99, dashboardUrl: "chrome-extension://abc/newtab.html" }),
    false,
  );
  assert.equal(
    isDashboardVisibleTab({ id: 2, url: "chrome-extension://abc/newtab.html" }, { currentTabId: 99, dashboardUrl: "chrome-extension://abc/newtab.html" }),
    false,
  );
  assert.equal(
    isDashboardVisibleTab({ id: 3, url: "https://example.com" }, { currentTabId: 99, dashboardUrl: "chrome-extension://abc/newtab.html" }),
    true,
  );
});

test("registerTabChangeListeners refreshes when Chrome tab events fire", () => {
  const events = {};
  const chromeApi = {
    tabs: {
      onCreated: { addListener: (listener) => { events.created = listener; } },
      onRemoved: { addListener: (listener) => { events.removed = listener; } },
      onReplaced: { addListener: (listener) => { events.replaced = listener; } },
      onUpdated: { addListener: (listener) => { events.updated = listener; } },
    },
  };
  let refreshCount = 0;

  registerTabChangeListeners(chromeApi, () => {
    refreshCount += 1;
  });

  assert.equal(typeof events.removed, "function");
  assert.equal(typeof events.created, "function");
  assert.equal(typeof events.updated, "function");
  assert.equal(typeof events.replaced, "function");

  events.removed();
  events.created();
  events.updated(1, { status: "complete" });
  events.updated(1, { title: "New title" });
  events.updated(1, { favIconUrl: "https://example.com/favicon.ico" });
  events.updated(1, { audible: true });
  events.replaced();

  assert.equal(refreshCount, 6);
});
