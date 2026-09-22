async function act(message) {
  const result = await browser.runtime.sendMessage(message);
  document.querySelector('#status').textContent = JSON.stringify(result, null, 2);
}
document.querySelector('#pairing').addEventListener('change', async event => {
  try { await act({ action: 'pair', pairing: JSON.parse(await event.target.files[0].text()) }); }
  catch (error) { document.querySelector('#status').textContent = error.message; }
});
document.querySelector('#test').onclick = () => act({ action: 'test' });
document.querySelector('#enable').onclick = () => act({ action: 'mode', enabled: true });
document.querySelector('#pause').onclick = () => act({ action: 'mode', enabled: false });
document.querySelector('#refresh').onclick = () => act({ action: 'status' });
act({ action: 'status' });
