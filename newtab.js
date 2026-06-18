(function initTabDashboard(globalScope) {
  const WELL_KNOWN_NAMES = new Map([
    ["github", "GitHub"],
    ["gmail", "Gmail"],
    ["google", "Google"],
    ["jotform", "Jotform"],
    ["linkedin", "LinkedIn"],
    ["minimax", "MiniMax"],
    ["openrouter", "OpenRouter"],
    ["youtube", "YouTube"],
  ]);

  const HOST_LABELS = new Map([
    ["docs.google.com", "Google Docs"],
    ["drive.google.com", "Google Drive"],
    ["mail.google.com", "Gmail"],
  ]);

  const INTERNAL_LABELS = new Map([
    ["chrome://extensions", "Chrome Extensions"],
    ["chrome://newtab", "New Tab"],
    ["chrome://history", "Chrome History"],
    ["chrome://settings", "Chrome Settings"],
    ["chrome://bookmarks", "Chrome Bookmarks"],
  ]);

  const MULTI_PART_PUBLIC_SUFFIXES = new Set([
    "co.uk",
    "com.au",
    "com.br",
    "com.mx",
    "co.jp",
    "co.nz",
    "co.kr",
  ]);

  const TAB_CLOSE_ANIMATION_MS = 420;
  const MASONRY_MIN_COLUMN_WIDTH = 360;
  const MASONRY_COLUMN_GAP = 14;

  function titleCaseToken(token) {
    if (!token) return "";
    const lower = token.toLowerCase();
    if (WELL_KNOWN_NAMES.has(lower)) return WELL_KNOWN_NAMES.get(lower);

    return lower
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function formatDomainName(domain) {
    if (!domain) return "Other";

    const cleanDomain = String(domain).trim().toLowerCase().replace(/\/$/, "");
    if (INTERNAL_LABELS.has(cleanDomain)) return INTERNAL_LABELS.get(cleanDomain);
    if (HOST_LABELS.has(cleanDomain)) return HOST_LABELS.get(cleanDomain);

    if (cleanDomain.startsWith("chrome://")) {
      const page = cleanDomain.replace("chrome://", "").split("/")[0];
      return page ? `Chrome ${titleCaseToken(page)}` : "Chrome";
    }

    const host = cleanDomain.replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    const significant = labels.length > 1 ? labels[labels.length - 2] : labels[0];

    return titleCaseToken(significant || host);
  }

  function getBaseDomain(hostname) {
    const host = String(hostname || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const labels = host.split(".").filter(Boolean);

    if (labels.length <= 2) return host || "other";
    if (labels.every((label) => /^\d+$/.test(label))) return host;

    const publicSuffix = labels.slice(-2).join(".");
    if (MULTI_PART_PUBLIC_SUFFIXES.has(publicSuffix) && labels.length >= 3) {
      return labels.slice(-3).join(".");
    }

    return labels.slice(-2).join(".");
  }

  function normalizeTabUrl(rawUrl) {
    if (!rawUrl) {
      return {
        groupKey: "other",
        host: "other",
        displayName: "Other",
        faviconSourceUrl: "",
        isInternal: false,
      };
    }

    const urlText = String(rawUrl);

    if (urlText.startsWith("chrome://")) {
      const parsed = new URL(urlText);
      const groupKey = `chrome://${parsed.hostname || "page"}`;
      return {
        groupKey,
        host: groupKey,
        displayName: formatDomainName(groupKey),
        faviconSourceUrl: urlText,
        isInternal: true,
      };
    }

    try {
      const parsed = new URL(urlText);
      const host = getBaseDomain(parsed.hostname);

      return {
        groupKey: host || "other",
        host: host || "other",
        displayName: formatDomainName(host),
        faviconSourceUrl: urlText,
        isInternal: parsed.protocol !== "http:" && parsed.protocol !== "https:",
      };
    } catch (_error) {
      return {
        groupKey: "other",
        host: "other",
        displayName: "Other",
        faviconSourceUrl: urlText,
        isInternal: false,
      };
    }
  }

  function createFaviconUrl(pageUrl) {
    if (!pageUrl) return "";
    const faviconBase =
      globalScope.chrome && globalScope.chrome.runtime && globalScope.chrome.runtime.getURL
        ? globalScope.chrome.runtime.getURL("/_favicon/")
        : "/_favicon/";
    return `${faviconBase}?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
  }

  function decorateTab(tab) {
    const normalized = normalizeTabUrl(tab.url || tab.pendingUrl || "");

    return {
      ...tab,
      groupKey: normalized.groupKey,
      displayDomain: normalized.displayName,
      normalizedHost: normalized.host,
      faviconUrl: createFaviconUrl(normalized.faviconSourceUrl),
    };
  }

  function groupTabsByDomain(tabs) {
    const groupsByKey = new Map();

    for (const tab of tabs || []) {
      const decoratedTab = decorateTab(tab);
      const key = decoratedTab.groupKey;

      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          key,
          domain: decoratedTab.normalizedHost,
          displayName: decoratedTab.displayDomain,
          tabs: [],
        });
      }

      groupsByKey.get(key).tabs.push(decoratedTab);
    }

    return Array.from(groupsByKey.values()).sort((a, b) => {
      if (b.tabs.length !== a.tabs.length) return b.tabs.length - a.tabs.length;
      return a.displayName.localeCompare(b.displayName);
    });
  }

  function filterGroups(groups, query) {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return groups;

    return groups
      .map((group) => {
        const groupMatches =
          group.displayName.toLowerCase().includes(needle) ||
          group.domain.toLowerCase().includes(needle);

        const tabs = group.tabs.filter((tab) => {
          const title = String(tab.title || "").toLowerCase();
          const url = String(tab.url || tab.pendingUrl || "").toLowerCase();
          return groupMatches || title.includes(needle) || url.includes(needle);
        });

        return tabs.length ? { ...group, tabs } : null;
      })
      .filter(Boolean);
  }

  function getMasonryColumnCount(containerWidth) {
    const width = Number(containerWidth) || 0;
    if (width <= MASONRY_MIN_COLUMN_WIDTH) return 1;

    return Math.max(
      1,
      Math.floor((width + MASONRY_COLUMN_GAP) / (MASONRY_MIN_COLUMN_WIDTH + MASONRY_COLUMN_GAP)),
    );
  }

  function getShortestColumnIndex(columnHeights) {
    return columnHeights.reduce(
      (shortestIndex, height, columnIndex) =>
        height < columnHeights[shortestIndex] ? columnIndex : shortestIndex,
      0,
    );
  }

  function shortUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "chrome:") return parsed.href.replace(/\/$/, "");
      return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    } catch (_error) {
      return String(url);
    }
  }

  function setText(element, text) {
    element.textContent = text == null ? "" : String(text);
  }

  function createImage(src, className) {
    const image = document.createElement("img");
    image.className = className;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    if (src) image.src = src;
    image.addEventListener("error", () => {
      image.style.visibility = "hidden";
    });
    return image;
  }

  function createButton(className, label, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.title = title || label;
    button.setAttribute("aria-label", title || label);
    setText(button, label);
    return button;
  }

  function getCloseAnimationMs() {
    if (
      globalScope.matchMedia &&
      globalScope.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return 0;
    }

    return TAB_CLOSE_ANIMATION_MS;
  }

  function closeTabWithAnimation(row, closeButton, closeAction) {
    if (row.classList.contains("is-closing")) return;

    closeButton.disabled = true;
    closeButton.setAttribute("aria-disabled", "true");
    row.classList.add("is-closing");

    const animationMs = getCloseAnimationMs();
    if (animationMs === 0) {
      closeAction();
      return;
    }

    globalScope.setTimeout(closeAction, animationMs);
  }

  function createTabRow(tab, actions) {
    const row = document.createElement("article");
    row.className = "tab-row";

    row.append(createImage(tab.faviconUrl, "favicon tab-favicon"));

    const linkButton = createButton("tab-link", "", `Jump to ${tab.title || "tab"}`);
    const title = document.createElement("span");
    title.className = "tab-title";
    setText(title, tab.title || tab.url || "Untitled tab");

    const url = document.createElement("span");
    url.className = "tab-url";
    setText(url, shortUrl(tab.url || tab.pendingUrl || ""));

    linkButton.append(title, url);
    linkButton.addEventListener("click", () => actions.activateTab(tab));

    const closeButton = createButton("close-tab", "x", `Close ${tab.title || "tab"}`);
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTabWithAnimation(row, closeButton, () => actions.closeTab(tab));
    });

    row.append(linkButton, closeButton);
    return row;
  }

  function createDomainCard(group, actions) {
    const card = document.createElement("section");
    card.className = "domain-card";

    const header = document.createElement("header");
    header.className = "domain-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "domain-title";
    const title = document.createElement("strong");
    setText(title, group.displayName);
    const meta = document.createElement("span");
    setText(meta, `${group.tabs.length} ${group.tabs.length === 1 ? "tab" : "tabs"} · ${group.domain}`);
    titleWrap.append(title, meta);

    const closeGroup = createButton("close-group", "Close group", `Close all ${group.displayName} tabs`);
    closeGroup.addEventListener("click", () => actions.closeGroup(group));

    header.append(titleWrap, closeGroup);

    const list = document.createElement("div");
    list.className = "tab-list";
    for (const tab of group.tabs) {
      list.append(createTabRow(tab, actions));
    }

    card.append(header, list);
    return card;
  }

  function createEmptyDomainColumn() {
    const column = document.createElement("div");
    column.className = "domain-column";
    return column;
  }

  function measureColumnHeight(column) {
    if (column.getBoundingClientRect) {
      const rect = column.getBoundingClientRect();
      if (rect.height) return rect.height;
    }

    return column.scrollHeight || 0;
  }

  function renderMasonryColumns(grid, groups, columnCount, actions) {
    const columns = Array.from({ length: Math.max(1, columnCount) }, createEmptyDomainColumn);
    grid.replaceChildren(...columns);

    groups.forEach((group, index) => {
      const card = createDomainCard(group, actions);

      if (index < columns.length) {
        columns[index].append(card);
        return;
      }

      const columnHeights = columns.map(measureColumnHeight);
      columns[getShortestColumnIndex(columnHeights)].append(card);
    });

    for (const column of columns) {
      if (!column.children.length) column.remove();
    }
  }

  function initializeChromeDashboard() {
    if (typeof document === "undefined") return;

    const grid = document.getElementById("domainGrid");
    const emptyState = document.getElementById("emptyState");
    const searchInput = document.getElementById("searchInput");
    const status = document.getElementById("status");
    const summary = document.getElementById("summary");

    if (!grid || !emptyState || !searchInput || !status || !summary) return;

    const chromeApi = globalScope.chrome;
    let allGroups = [];
    let currentTabId = null;

    function setStatus(message, tone) {
      setText(status, message || "");
      if (tone) {
        status.dataset.tone = tone;
      } else {
        delete status.dataset.tone;
      }
    }

    function render() {
      const filteredGroups = filterGroups(allGroups, searchInput.value);
      const visibleTabs = filteredGroups.reduce((count, group) => count + group.tabs.length, 0);
      const columnCount = getMasonryColumnCount(grid.clientWidth || globalScope.innerWidth);
      renderMasonryColumns(grid, filteredGroups, columnCount, actions);

      emptyState.hidden = filteredGroups.length > 0;
      setText(
        summary,
        `${visibleTabs} ${visibleTabs === 1 ? "tab" : "tabs"} across ${filteredGroups.length} ${
          filteredGroups.length === 1 ? "domain" : "domains"
        }`,
      );
    }

    function refreshTabs() {
      if (!chromeApi || !chromeApi.tabs) {
        setStatus("This dashboard must run as a Chrome extension with the tabs permission.", "error");
        setText(summary, "Chrome tabs API unavailable");
        return;
      }

      chromeApi.tabs.getCurrent((currentTab) => {
        currentTabId = currentTab && currentTab.id;

        chromeApi.tabs.query({}, (tabs) => {
          const runtimeError = chromeApi.runtime && chromeApi.runtime.lastError;
          if (runtimeError) {
            setStatus(runtimeError.message, "error");
            return;
          }

          const dashboardUrl = chromeApi.runtime && chromeApi.runtime.getURL
            ? chromeApi.runtime.getURL("newtab.html")
            : "";

          const visibleTabs = (tabs || []).filter((tab) => {
            if (currentTabId && tab.id === currentTabId) return false;
            return tab.url !== dashboardUrl;
          });

          allGroups = groupTabsByDomain(visibleTabs);
          setStatus("");
          render();
        });
      });
    }

    function activateTab(tab) {
      setStatus(`Opening ${tab.title || "tab"}...`);
      chromeApi.windows.update(tab.windowId, { focused: true }, () => {
        const windowError = chromeApi.runtime && chromeApi.runtime.lastError;
        if (windowError) {
          setStatus(windowError.message, "error");
          return;
        }

        chromeApi.tabs.update(tab.id, { active: true }, () => {
          const tabError = chromeApi.runtime && chromeApi.runtime.lastError;
          if (tabError) {
            setStatus(tabError.message, "error");
            return;
          }

          setStatus(`Opened ${tab.title || "tab"}.`);
        });
      });
    }

    function closeTab(tab) {
      chromeApi.tabs.remove(tab.id, () => {
        const runtimeError = chromeApi.runtime && chromeApi.runtime.lastError;
        if (runtimeError) {
          setStatus(runtimeError.message, "error");
          return;
        }

        setStatus(`Closed ${tab.title || "tab"}.`);
        refreshTabs();
      });
    }

    function closeGroup(group) {
      const confirmed = globalScope.confirm(
        `Close all ${group.tabs.length} ${group.tabs.length === 1 ? "tab" : "tabs"} in ${group.displayName}?`,
      );

      if (!confirmed) return;

      chromeApi.tabs.remove(
        group.tabs.map((tab) => tab.id),
        () => {
          const runtimeError = chromeApi.runtime && chromeApi.runtime.lastError;
          if (runtimeError) {
            setStatus(runtimeError.message, "error");
            return;
          }

          setStatus(`Closed ${group.displayName}.`);
          refreshTabs();
        },
      );
    }

    const actions = {
      activateTab,
      closeGroup,
      closeTab,
    };

    searchInput.addEventListener("input", render);
    if (globalScope.addEventListener) {
      globalScope.addEventListener("resize", render);
    }
    refreshTabs();
  }

  const api = {
    createFaviconUrl,
    decorateTab,
    filterGroups,
    formatDomainName,
    getBaseDomain,
    getMasonryColumnCount,
    getShortestColumnIndex,
    groupTabsByDomain,
    normalizeTabUrl,
    shortUrl,
    TAB_CLOSE_ANIMATION_MS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalScope.TabDashboard = api;
    initializeChromeDashboard();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
