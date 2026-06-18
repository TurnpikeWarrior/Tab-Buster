const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFaviconUrl,
  decorateTab,
  filterGroups,
  formatDomainName,
  getBaseDomain,
  getMasonryColumnCount,
  getShortestColumnIndex,
  groupTabsByDomain,
  normalizeTabUrl,
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

test("decorateTab never uses remote favIconUrl directly", () => {
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
});

test("tab close animation is quick but gives rows time to collapse", () => {
  assert.ok(TAB_CLOSE_ANIMATION_MS >= 300);
  assert.ok(TAB_CLOSE_ANIMATION_MS <= 600);
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

test("getMasonryColumnCount matches the responsive card width", () => {
  assert.equal(getMasonryColumnCount(320), 1);
  assert.equal(getMasonryColumnCount(760), 2);
  assert.equal(getMasonryColumnCount(1500), 4);
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
