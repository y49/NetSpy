// NetSpy devtools script
console.log("NetSpy: devtools.js loaded");

// Create the NetSpy panel
let netspyPanel = null;

chrome.devtools.panels.create(
  "NetSpy",
  "", // Icon path
  "panel.html",
  function (panel) {
    console.log("NetSpy panel created");
    netspyPanel = panel;

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'focusNetSpyPanel') {
        console.log('Request to focus NetSpy panel received');
        sendResponse({ success: true });
      }
    });
  }
);
