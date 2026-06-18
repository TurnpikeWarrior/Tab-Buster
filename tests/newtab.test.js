const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFaviconUrl,
  decorateTab,
  filterGroups,
  formatDomainName,
  groupTabsByDomain,
  normalizeTabUrl,
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

test("createFaviconUrl uses Chrome favicon service for tab URLs", () => {
  const favicon = createFaviconUrl("https://github.com/zarazhangrui/tab-out");
  assert.equal(
    favicon,
    "chrome://favicon2/?size=32&scaleFactor=1x&pageUrl=https%3A%2F%2Fgithub.com%2Fzarazhangrui%2Ftab-out",
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
    "chrome://favicon2/?size=32&scaleFactor=1x&pageUrl=https%3A%2F%2Fexample.com%2Fpage",
  );
});

test("groupTabsByDomain groups tabs, sorts groups by count, and keeps tab order", () => {
  const tabs = [
    { id: 1, windowId: 10, title: "Video B", url: "https://youtube.com/b" },
    { id: 2, windowId: 10, title: "Repo", url: "https://github.com/org/repo" },
    { id: 3, windowId: 11, title: "Video A", url: "https://www.youtube.com/a" },
    { id: 4, windowId: 12, title: "Extensions", url: "chrome://extensions/" },
  ];

  const groups = groupTabsByDomain(tabs);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].displayName, "YouTube");
  assert.equal(groups[0].domain, "youtube.com");
  assert.deepEqual(
    groups[0].tabs.map((tab) => tab.title),
    ["Video B", "Video A"],
  );
  assert.equal(groups[1].displayName, "Chrome Extensions");
  assert.equal(groups[2].displayName, "GitHub");
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
