// Allow the local entry to be previewed outside Chrome DevTools.
if (typeof chrome !== 'undefined' && chrome.devtools) {
  chrome.devtools.panels.create('Agent Trace', '', 'panel/index.html')
}
