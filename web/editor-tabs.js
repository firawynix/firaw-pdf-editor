document.body.dataset.activeView = 'workspace';
for (const button of document.querySelectorAll('.editor-bottom [data-view]')) {
  button.addEventListener('click', () => {
    document.body.dataset.activeView = button.dataset.view;
    for (const item of document.querySelectorAll('.editor-bottom [data-view]'))
      item.classList.toggle('selected', item === button);
    if (button.dataset.view === 'workspace') window.dispatchEvent(new Event('resize'));
  });
}
