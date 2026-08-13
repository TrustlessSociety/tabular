async page => page.evaluate(() => ({
  feedback: document.querySelector('.status-bar output')?.textContent,
  draft: document.querySelector('.grid-draft-bar')?.textContent,
  rows: [...document.querySelectorAll('.tabulator-row')].map(row => row.textContent?.trim())
}))
