# Tab Buster

Tab Buster is a Chrome extension that replaces the new tab page with a dashboard of all open tabs grouped by friendly domain cards.

## Features

- Groups open tabs by domain.
- Shows friendly domain names such as `YouTube` instead of `youtube.com`.
- Shows favicons beside tab titles.
- Always shows every tab title in each domain card.
- Click a tab title to jump to the existing tab.
- Close a specific tab from its row.
- Close an entire domain group after confirmation.
- Search by domain, title, or URL.

## Install Locally

1. Open `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the cloned `Tab-Buster` repository folder.
5. Open a new tab.

## Permissions

- `tabs`: reads open tab titles and URLs so the dashboard can group, activate, and close tabs.
- `favicon`: loads tab favicons through Chrome's internal favicon endpoint before using the sanitized favicon fallback described above.

## Files

- `manifest.json`: Manifest V3 extension config and new-tab override.
- `newtab.html`: New tab page shell.
- `newtab.css`: Dashboard styling.
- `newtab.js`: Tab grouping helpers, rendering, search, jump, and close behavior.
