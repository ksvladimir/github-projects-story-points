(function (d, w) {
'use strict';

const githubCredentials = new Promise(resolve => {
  chrome.storage.sync.get({ githubUser: '', githubToken: '' }, items => resolve(items));
});

var debounce = function (func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

const moveTo = (card_id, position) => async (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.target.innerHTML = '⏳';

  const { githubUser, githubToken } = await githubCredentials;
  if (!githubUser || !githubToken) {
    alert('please set github credentials in Github Projects Story Points settings');
    return;
  }

  const res = await fetch(
    `https://api.github.com/projects/columns/cards/${card_id}/moves`, {
      headers: {
        'Authorization': 'Basic ' + btoa(githubUser + ":" + githubToken),
        'Accept': 'application/vnd.github.inertia-preview+json',
      },
      method: 'POST',
      body: JSON.stringify({ position }),
    }
  );
  if (!res.ok) {
    console.error(`Github API error: ${res.statusTest}\n${await res.text()}`);
    alert(`Github API error: ${res.statusTest}`);
  } else {
    e.target.innerHTML = '✔️';
  }

  return false;
}

const addProjectButtons = () => {
  const projects = document.querySelectorAll(
    'form[aria-label="Select projects"] div[data-url*="show_partial?card_id="]');

  projects.forEach(project => {
    if (project.querySelectorAll('.gpsp-project-buttons').length > 0) {
      return;
    }

    const card_id = project.dataset.url.match(/show_partial\?card_id=(\d+)&/)[1];
    const buttons = document.createElement('div');
    buttons.classList.add('gpsp-project-buttons');

    const addButton = (text, direction) => {
      const button = document.createElement('div');
      button.innerText = text;
      button.addEventListener('click', moveTo(card_id, direction), {capture: true});
      button.addEventListener('mousedown', e => { e.preventDefault(); }, {capture: true});
      buttons.append(button);
    };

    addButton('↑', 'top');
    addButton('↓', 'bottom');
    project.prepend(buttons);
  });
};

const addStyle = () => {
  const sheet = document.createElement('style');
  sheet.innerHTML = `
    .gpsp-project-buttons {
      visibility: hidden;
      position: absolute;
      top: 0;
      bottom: 0;
      right: 4px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .gpsp-project-buttons div {
      width: 16px;
      text-align: center;
      cursor: pointer;
    }
    form[aria-label="Select projects"] div[data-url] {
      position: relative;
    }
    form[aria-label="Select projects"] div[data-url]:hover .gpsp-project-buttons div {
      visibility: visible;
    }
  `;
  document.body.appendChild(sheet);

};

addStyle();
addProjectButtons();

window.addEventListener('statechange', () => setTimeout(() => {
  addStyle();
  addProjectButtons();
}, 500));

const container = document.querySelector('.js-check-all-container');
if (container) {
  container.addEventListener('DOMSubtreeModified', debounce(() => addProjectButtons(), 50));
}

})();