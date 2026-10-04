export function registerPanel(panels: Pick<typeof chrome.devtools.panels, 'create'>): void {
  panels.create('Agent Trace', '', 'panel/index.html', () => {})
}
