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
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

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
    return `chrome://favicon2/?size=32&scaleFactor=1x&pageUrl=${encodeURIComponent(pageUrl)}`;
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
          faviconUrl: decoratedTab.faviconUrl,
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
      actions.closeTab(tab);
    });

    row.append(linkButton, closeButton);
    return row;
  }

  function createDomainCard(group, actions) {
    const card = document.createElement("section");
    card.className = "domain-card";

    const header = document.createElement("header");
    header.className = "domain-header";
    header.append(createImage(group.faviconUrl, "favicon domain-favicon"));

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
      grid.replaceChildren();

      for (const group of filteredGroups) {
        grid.append(createDomainCard(group, actions));
      }

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

          if (currentTabId && currentTabId !== tab.id) {
            chromeApi.tabs.remove(currentTabId, () => undefined);
          }
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
    refreshTabs();
  }

  const api = {
    createFaviconUrl,
    decorateTab,
    filterGroups,
    formatDomainName,
    groupTabsByDomain,
    normalizeTabUrl,
    shortUrl,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalScope.TabDashboard = api;
    initializeChromeDashboard();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
